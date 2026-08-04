"""Annual tax report (docs/SPEC.md section 10). Aggregates TaxEvents
(src/tax/events.py) for one tax year. The estimated tax liability is a
flat-rate approximation, explicitly flagged as an ESTIMATE per the spec —
it ignores tax brackets, credits, prior-year loss carryforwards, and the
loss-netting rules in section 10 point 3 (see ASSUMPTIONS.md). This is a
decision aid, not a filing.
"""
from dataclasses import dataclass
from typing import Optional

from src.tax.events import CATEGORY_DIVIDEND, CATEGORY_OPTION, CATEGORY_STOCK, TaxEvent


@dataclass
class AnnualTaxReport:
    tax_year: int
    events: list[TaxEvent]
    stock_gain_ils: Optional[float]
    option_gain_ils: Optional[float]
    dividend_gross_ils: Optional[float]
    events_missing_fx: int
    estimated_tax_ils: Optional[float]

    @property
    def net_capital_gain_ils(self) -> Optional[float]:
        if self.stock_gain_ils is None or self.option_gain_ils is None:
            return None
        return self.stock_gain_ils + self.option_gain_ils


def _sum_category(events: list[TaxEvent], category: str) -> tuple[Optional[float], int]:
    """(sum, missing_fx_count) for one category. Returns None for the sum
    if ANY event in the category is missing an FX conversion — a partial
    total would misleadingly look complete (same principle as
    src/journal/valuation.py's total_market_value)."""
    matching = [e for e in events if e.category == category]
    missing = sum(1 for e in matching if e.gain_loss_ils is None)
    if missing > 0:
        return None, missing
    return sum(e.gain_loss_ils for e in matching), 0


def build_annual_report(all_events: list[TaxEvent], tax_year: int, config: dict) -> AnnualTaxReport:
    year_events = sorted((e for e in all_events if e.tax_year == tax_year), key=lambda e: e.event_date)

    stock_gain, stock_missing = _sum_category(year_events, CATEGORY_STOCK)
    option_gain, option_missing = _sum_category(year_events, CATEGORY_OPTION)
    dividend_gross, dividend_missing = _sum_category(year_events, CATEGORY_DIVIDEND)

    tax_cfg = config["tax"]
    estimated_tax = None
    if stock_gain is not None and option_gain is not None and dividend_gross is not None:
        net_capital_gain = stock_gain + option_gain
        capital_gains_tax = max(0.0, net_capital_gain) * tax_cfg["capital_gains_rate_pct"]
        dividend_tax = max(0.0, dividend_gross) * tax_cfg["dividend_tax_rate_pct"]
        estimated_tax = capital_gains_tax + dividend_tax

    return AnnualTaxReport(
        tax_year=tax_year, events=year_events,
        stock_gain_ils=stock_gain, option_gain_ils=option_gain, dividend_gross_ils=dividend_gross,
        events_missing_fx=stock_missing + option_missing + dividend_missing,
        estimated_tax_ils=estimated_tax,
    )


def report_to_rows(report: AnnualTaxReport) -> list[dict]:
    """Flat rows for display or Excel export."""
    return [
        {
            "תאריך": e.event_date,
            "טיקר": e.ticker,
            "קטגוריה": e.category,
            "רווח/הפסד בש\"ח": e.gain_loss_ils,
            "שער פתיחה": e.fx_rate_open,
            "שער סגירה": e.fx_rate_close,
            "הערות": e.notes,
        }
        for e in report.events
    ]


def export_to_excel(report: AnnualTaxReport, path: str) -> None:
    import pandas as pd

    df = pd.DataFrame(report_to_rows(report))
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=f"מס {report.tax_year}"[:31])
