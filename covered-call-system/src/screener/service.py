"""Orchestrates the full stage 4 pipeline for one or more tickers: fetch
fundamentals (Yahoo Finance, src/data_providers/fundamentals.py) and the
option chain/expiries (IBKR, src/data_providers/ibkr.py) — both untestable
live in this sandbox — then run the pure, unit-tested screener/*.py
modules and rank the results.

Per-ticker failures are isolated: one ticker's fetch error is collected
as a TickerScreenError and does not abort the rest of the batch.
"""
import asyncio
from dataclasses import dataclass
from datetime import date
from typing import Optional

from src.data_providers.fundamentals import FundamentalsError, fetch_fundamentals
from src.data_providers.ibkr import IBKRConnectionError, fetch_option_chain, fetch_option_expiries
from src.screener import fundamental as fundamental_module
from src.screener.fundamental import evaluate_general, evaluate_quality, evaluate_value
from src.screener.liquidity import evaluate_liquidity
from src.screener.ranking import RankedCandidate, ScreenCandidate, rank_candidates


@dataclass
class TickerScreenError:
    ticker: str
    stage: str  # "fundamentals" / "liquidity"
    message: str


def _latest(series: list[tuple[str, float]]) -> float:
    return series[-1][1] if series else 0.0


async def build_candidate(
    ticker: str,
    exchange: str,
    currency: str,
    sector_pct_of_portfolio: Optional[float],
    ev_ebitda_sector_avg: Optional[float],
    ibkr_cfg: dict,
    config: dict,
    earnings_date: Optional[date] = None,
    iv_rank: Optional[float] = None,
) -> tuple[Optional[ScreenCandidate], list[TickerScreenError]]:
    errors: list[TickerScreenError] = []

    try:
        # fetch_fundamentals is a blocking network call (yfinance has no
        # async API) — offload it so it doesn't stall the event loop.
        raw = await asyncio.to_thread(fetch_fundamentals, ticker)
    except FundamentalsError as e:
        errors.append(TickerScreenError(ticker, "fundamentals", str(e)))
        return None, errors

    roic_series = fundamental_module.compute_roic_series(
        raw.ebit_series, raw.pretax_income_series, raw.tax_provision_series,
        raw.total_debt_series, raw.stockholders_equity_series, raw.cash_series,
    )
    total_debt_latest = _latest(raw.total_debt_series)
    cash_latest = _latest(raw.cash_series)

    quality = evaluate_quality(
        roic_series=roic_series, net_debt=total_debt_latest, cash=cash_latest,
        ebitda=_latest(raw.ebitda_series), fcf_series=raw.fcf_series,
        gross_margin_series=raw.gross_margin_series, ebit_latest=_latest(raw.ebit_series),
        interest_expense_latest=_latest(raw.interest_expense_series), config=config,
    )
    value = evaluate_value(
        fcf=_latest(raw.fcf_series), market_cap=raw.market_cap or 0, ev_ebitda=raw.ev_ebitda,
        ev_ebitda_sector_avg=ev_ebitda_sector_avg, pe=raw.trailing_pe,
        historical_pe_series=raw.historical_pe_series, config=config,
    )
    general = evaluate_general(
        market_cap=raw.market_cap, price=raw.price, sector_pct_of_portfolio=sector_pct_of_portfolio,
        config=config,
    )

    chain: list = []
    expiries: list = []
    try:
        if raw.price is not None:
            chain = await fetch_option_chain(
                ticker, exchange, currency, raw.price,
                config["options"]["expiry_days_min"], config["options"]["expiry_days_max"],
                host=ibkr_cfg["host"], port=ibkr_cfg["port"], client_id=ibkr_cfg["client_id"],
                timeout=ibkr_cfg["timeout_seconds"], prefer_live=ibkr_cfg["prefer_live_market_data"],
            )
        expiries = await fetch_option_expiries(
            ticker, exchange, currency,
            host=ibkr_cfg["host"], port=ibkr_cfg["port"], client_id=ibkr_cfg["client_id"],
            timeout=ibkr_cfg["timeout_seconds"],
        )
    except IBKRConnectionError as e:
        errors.append(TickerScreenError(ticker, "liquidity", str(e)))

    liquidity = evaluate_liquidity(chain, expiries, raw.avg_daily_volume, config)

    candidate = ScreenCandidate(
        ticker=ticker, quality=quality, value=value, general=general, liquidity=liquidity,
        current_price=raw.price, chain=chain, iv_rank=iv_rank, earnings_date=earnings_date,
    )
    return candidate, errors


async def run_screen(
    tickers: list[dict],
    sector_pct_lookup: dict,
    ibkr_cfg: dict,
    config: dict,
) -> tuple[list[RankedCandidate], list[TickerScreenError]]:
    """`tickers` items: {"ticker","exchange","currency"}, optionally
    "ev_ebitda_sector_avg", "iv_rank", "earnings_date"."""
    candidates = []
    all_errors: list[TickerScreenError] = []
    for spec in tickers:
        candidate, errors = await build_candidate(
            spec["ticker"], spec["exchange"], spec["currency"],
            sector_pct_of_portfolio=sector_pct_lookup.get(spec["ticker"]),
            ev_ebitda_sector_avg=spec.get("ev_ebitda_sector_avg"),
            ibkr_cfg=ibkr_cfg, config=config,
            earnings_date=spec.get("earnings_date"), iv_rank=spec.get("iv_rank"),
        )
        all_errors.extend(errors)
        if candidate is not None:
            candidates.append(candidate)

    return rank_candidates(candidates, config), all_errors
