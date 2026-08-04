from datetime import date

import pytest

from src.data_providers.fundamentals import FundamentalsError, RawFinancials
from src.data_providers.ibkr import IBKRConnectionError, OptionQuote
from src.screener import service

TEST_CONFIG = {
    "portfolio": {"max_sector_concentration_pct": 0.25},
    "position_types": {
        "CORE": {"target_delta_min": 0.15, "target_delta_max": 0.22, "strike_min_pct_of_price": 1.07},
        "INCOME": {"target_delta_min": 0.28, "target_delta_max": 0.35, "strike_min_pct_of_price": 1.03},
    },
    "options": {"expiry_days_min": 30, "expiry_days_max": 45},
    "screener": {
        "fundamental": {
            "quality": {
                "roic_min_pct": 0.12, "roic_avg_years": 3, "net_debt_ebitda_max": 2.5,
                "fcf_positive_years_required": 4, "fcf_positive_years_window": 5,
                "gross_margin_trend_years": 3, "interest_coverage_min": 5,
            },
            "value": {"fcf_yield_min_pct": 0.05},
            "general": {"market_cap_min_usd": 2_000_000_000, "price_min_usd": 25, "price_max_usd": 130},
        },
        "liquidity": {
            "open_interest_min": 200, "bid_ask_spread_max_pct_of_mid": 0.05,
            "bid_ask_spread_max_abs_usd": 0.10, "min_months_of_expiries_available": 3,
            "avg_daily_volume_min_shares": 500_000,
        },
        "ranking_weights": {"quality": 0.30, "value": 0.25, "annualized_premium_yield": 0.25, "iv_rank": 0.10, "liquidity": 0.10},
        "iv_rank": {"preferred_min": 30, "preferred_max": 60, "cheap_below": 25},
    },
    "ibkr": {"host": "127.0.0.1", "port": 7497, "client_id": 1, "timeout_seconds": 5, "prefer_live_market_data": False},
}


def make_raw_financials(ticker="AAPL", price=100.0):
    return RawFinancials(
        ticker=ticker, as_of="2026-08-04T00:00:00+00:00", source="Yahoo Finance (yfinance)",
        market_cap=5_000_000_000, price=price, sector="Technology", trailing_pe=15.0, ev_ebitda=8.0,
        avg_daily_volume=1_000_000,
        ebit_series=[("2022-12-31", 100.0), ("2023-12-31", 110.0), ("2024-12-31", 120.0)],
        ebitda_series=[("2024-12-31", 150.0)],
        pretax_income_series=[("2022-12-31", 90.0), ("2023-12-31", 95.0), ("2024-12-31", 100.0)],
        tax_provision_series=[("2022-12-31", 18.0), ("2023-12-31", 19.0), ("2024-12-31", 20.0)],
        total_debt_series=[("2024-12-31", 200.0)],
        stockholders_equity_series=[("2022-12-31", 380.0), ("2023-12-31", 390.0), ("2024-12-31", 400.0)],
        cash_series=[("2022-12-31", 90.0), ("2023-12-31", 95.0), ("2024-12-31", 100.0)],
        fcf_series=[("2020-12-31", 10), ("2021-12-31", 20), ("2022-12-31", 30), ("2023-12-31", 40), ("2024-12-31", 50)],
        gross_margin_series=[("2022-12-31", 0.30), ("2023-12-31", 0.32), ("2024-12-31", 0.35)],
        interest_expense_series=[("2024-12-31", 15.0)],
        historical_pe_series=[("2021-12-31", 18), ("2022-12-31", 22), ("2023-12-31", 20), ("2024-12-31", 19)],
    )


def make_chain():
    return [
        OptionQuote(ticker="AAPL", strike=103, expiry="2026-09-18", bid=2.0, ask=2.1, last=2.05,
                    delta=0.32, open_interest=500, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                    source="IBKR (מושהה ~15 דק')", is_delayed=True),
        OptionQuote(ticker="AAPL", strike=108, expiry="2026-09-18", bid=1.0, ask=1.05, last=1.02,
                    delta=0.20, open_interest=500, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                    source="IBKR (מושהה ~15 דק')", is_delayed=True),
    ]


@pytest.mark.asyncio
class TestBuildCandidate:
    async def test_wires_fundamentals_and_chain_into_candidate(self, monkeypatch):
        monkeypatch.setattr(service, "fetch_fundamentals", lambda ticker: make_raw_financials(ticker))

        async def fake_chain(*args, **kwargs):
            return make_chain()

        async def fake_expiries(*args, **kwargs):
            return ["2026-08-21", "2026-09-18", "2026-10-16"]

        monkeypatch.setattr(service, "fetch_option_chain", fake_chain)
        monkeypatch.setattr(service, "fetch_option_expiries", fake_expiries)

        candidate, errors = await service.build_candidate(
            "AAPL", "NASDAQ", "USD", sector_pct_of_portfolio=0.1, ev_ebitda_sector_avg=12.0,
            ibkr_cfg=TEST_CONFIG["ibkr"], config=TEST_CONFIG,
        )

        assert errors == []
        assert candidate is not None
        assert candidate.ticker == "AAPL"
        assert candidate.current_price == 100.0
        assert candidate.quality.passed
        assert candidate.liquidity.passed
        assert len(candidate.chain) == 2

    async def test_fundamentals_error_returns_none_candidate_with_error(self, monkeypatch):
        def raise_error(ticker):
            raise FundamentalsError(f"no data for {ticker}")

        monkeypatch.setattr(service, "fetch_fundamentals", raise_error)

        candidate, errors = await service.build_candidate(
            "BADTICKER", "NASDAQ", "USD", sector_pct_of_portfolio=None, ev_ebitda_sector_avg=None,
            ibkr_cfg=TEST_CONFIG["ibkr"], config=TEST_CONFIG,
        )

        assert candidate is None
        assert len(errors) == 1
        assert errors[0].stage == "fundamentals"

    async def test_ibkr_error_still_yields_a_candidate_with_liquidity_gap(self, monkeypatch):
        """One data source failing shouldn't discard the fundamentals we did get."""
        monkeypatch.setattr(service, "fetch_fundamentals", lambda ticker: make_raw_financials(ticker))

        async def fail_chain(*args, **kwargs):
            raise IBKRConnectionError("no TWS running")

        async def fail_expiries(*args, **kwargs):
            raise IBKRConnectionError("no TWS running")

        monkeypatch.setattr(service, "fetch_option_chain", fail_chain)
        monkeypatch.setattr(service, "fetch_option_expiries", fail_expiries)

        candidate, errors = await service.build_candidate(
            "AAPL", "NASDAQ", "USD", sector_pct_of_portfolio=None, ev_ebitda_sector_avg=None,
            ibkr_cfg=TEST_CONFIG["ibkr"], config=TEST_CONFIG,
        )

        assert candidate is not None
        assert candidate.quality.passed  # fundamentals still evaluated
        assert candidate.chain == []
        assert any(e.stage == "liquidity" for e in errors)


@pytest.mark.asyncio
class TestRunScreen:
    async def test_partial_batch_failure_does_not_abort_other_tickers(self, monkeypatch):
        def fake_fetch(ticker):
            if ticker == "BAD":
                raise FundamentalsError("no data")
            return make_raw_financials(ticker)

        async def fake_chain(*args, **kwargs):
            return make_chain()

        async def fake_expiries(*args, **kwargs):
            return ["2026-08-21", "2026-09-18", "2026-10-16"]

        monkeypatch.setattr(service, "fetch_fundamentals", fake_fetch)
        monkeypatch.setattr(service, "fetch_option_chain", fake_chain)
        monkeypatch.setattr(service, "fetch_option_expiries", fake_expiries)

        ranked, errors = await service.run_screen(
            tickers=[
                {"ticker": "AAPL", "exchange": "NASDAQ", "currency": "USD"},
                {"ticker": "BAD", "exchange": "NASDAQ", "currency": "USD"},
            ],
            sector_pct_lookup={}, ibkr_cfg=TEST_CONFIG["ibkr"], config=TEST_CONFIG,
        )

        assert len(ranked) == 1
        assert ranked[0].candidate.ticker == "AAPL"
        assert len(errors) == 1
        assert errors[0].ticker == "BAD"
