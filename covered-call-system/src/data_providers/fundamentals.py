"""Fundamental-data provider (docs/SPEC.md section 3, stage 4) via
yfinance (Yahoo Finance) — read-only, no order capability of any kind
exists in this domain, so there is no "read-only by construction" note
to make here the way there is for src/data_providers/ibkr.py.

UNTESTED LIVE in this sandbox: Yahoo Finance is blocked by this
environment's outbound network policy (confirmed via the proxy status
endpoint — see ASSUMPTIONS.md). It should work normally wherever this
system actually runs. All the metric computation/threshold logic lives
in src/screener/fundamental.py, which IS unit-tested against synthetic
RawFinancials data — this module only fetches and reshapes raw numbers,
tolerating missing fields (yfinance's `.info` dict and statement rows are
not guaranteed to be present for every ticker).
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf

YearSeries = list[tuple[str, float]]


class FundamentalsError(RuntimeError):
    """Data could not be fetched for this ticker."""


@dataclass
class RawFinancials:
    ticker: str
    as_of: str
    source: str
    market_cap: Optional[float]
    price: Optional[float]
    sector: Optional[str]
    trailing_pe: Optional[float]
    ev_ebitda: Optional[float]
    avg_daily_volume: Optional[float]
    ebit_series: YearSeries = field(default_factory=list)
    ebitda_series: YearSeries = field(default_factory=list)
    pretax_income_series: YearSeries = field(default_factory=list)
    tax_provision_series: YearSeries = field(default_factory=list)
    total_debt_series: YearSeries = field(default_factory=list)
    stockholders_equity_series: YearSeries = field(default_factory=list)
    cash_series: YearSeries = field(default_factory=list)
    fcf_series: YearSeries = field(default_factory=list)
    gross_margin_series: YearSeries = field(default_factory=list)
    interest_expense_series: YearSeries = field(default_factory=list)
    historical_pe_series: YearSeries = field(default_factory=list)


def _row_series(df, row_name: str) -> YearSeries:
    """One row of a yfinance statement DataFrame -> [(year_label, value)],
    oldest first. yfinance returns columns most-recent-first; we re-sort."""
    if df is None or df.empty or row_name not in df.index:
        return []
    row = df.loc[row_name].dropna()
    items = sorted(row.items(), key=lambda kv: kv[0])
    return [(str(col.date()) if hasattr(col, "date") else str(col), float(v)) for col, v in items]


def _gross_margin_series(income_stmt) -> YearSeries:
    gross_profit = dict(_row_series(income_stmt, "Gross Profit"))
    revenue = dict(_row_series(income_stmt, "Total Revenue"))
    years = sorted(set(gross_profit) & set(revenue))
    return [(y, gross_profit[y] / revenue[y]) for y in years if revenue[y]]


def _historical_pe_series(t) -> YearSeries:
    """Best-effort P/E per fiscal year: year-end close price / diluted
    EPS for that year, from up to 5 years of annual statements. This is
    an approximation (year-end close vs. the EPS reported for that fiscal
    year, not a true point-in-time historical P/E from a data vendor) —
    see ASSUMPTIONS.md."""
    try:
        income_stmt = t.income_stmt
        if income_stmt is None or income_stmt.empty or "Diluted EPS" not in income_stmt.index:
            return []
        eps_row = income_stmt.loc["Diluted EPS"].dropna()
        if eps_row.empty:
            return []
        history = t.history(period="5y")
        if history.empty:
            return []
        result = []
        for col, eps in eps_row.items():
            if not eps:
                continue
            year_end = col.date() if hasattr(col, "date") else col
            nearby = history.loc[:str(year_end)]
            if nearby.empty:
                continue
            price_then = nearby["Close"].iloc[-1]
            result.append((str(year_end), float(price_then) / float(eps)))
        return sorted(result, key=lambda kv: kv[0])
    except Exception:
        return []


def fetch_fundamentals(ticker: str) -> RawFinancials:
    try:
        t = yf.Ticker(ticker)
        info = t.info
        income_stmt = t.income_stmt
        balance_sheet = t.balance_sheet
        cash_flow = t.cash_flow
    except Exception as exc:
        raise FundamentalsError(f"שגיאה בשליפת נתונים פונדמנטליים עבור {ticker}: {exc}") from exc

    as_of = datetime.now(timezone.utc).isoformat()
    avg_volume = info.get("averageVolume") or info.get("averageDailyVolume10Day")

    return RawFinancials(
        ticker=ticker, as_of=as_of, source="Yahoo Finance (yfinance)",
        market_cap=info.get("marketCap"),
        price=info.get("currentPrice") or info.get("regularMarketPrice"),
        sector=info.get("sector"),
        trailing_pe=info.get("trailingPE"),
        ev_ebitda=info.get("enterpriseToEbitda"),
        avg_daily_volume=avg_volume,
        ebit_series=_row_series(income_stmt, "EBIT"),
        ebitda_series=_row_series(income_stmt, "EBITDA"),
        pretax_income_series=_row_series(income_stmt, "Pretax Income"),
        tax_provision_series=_row_series(income_stmt, "Tax Provision"),
        total_debt_series=_row_series(balance_sheet, "Total Debt"),
        stockholders_equity_series=_row_series(balance_sheet, "Stockholders Equity"),
        cash_series=_row_series(balance_sheet, "Cash And Cash Equivalents"),
        fcf_series=_row_series(cash_flow, "Free Cash Flow"),
        gross_margin_series=_gross_margin_series(income_stmt),
        interest_expense_series=_row_series(income_stmt, "Interest Expense"),
        historical_pe_series=_historical_pe_series(t),
    )
