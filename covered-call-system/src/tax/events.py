"""Draft tax-event computation (docs/SPEC.md section 10). This produces
a personal-reference DRAFT — it is not tax advice and does not replace an
accountant (section 0; section 10 explicitly requires accountant
verification before relying on this logic).

Tax events are DERIVED from realized stock sales
(src/journal/cost_basis.py's RealizedSale) and closed option tranches
(src/options/tracking.py's ClosedOptionTranche), never entered directly —
the same "positions are derived from trades, never entered as state"
principle from section 9 applied to the whole system. See
src/tax/service.py for the DB wiring.

Four points the spec explicitly flags as needing accountant verification
(section 10) — see also ASSUMPTIONS.md:
  1. FX gain is embedded in the ILS-denominated gain by using the
     official rate applicable to EACH leg (open vs. close), not one
     blended rate — see compute_gain_ils.
  2. A roll's close (CALL_BUY_CLOSE) and reopen (CALL_SELL_OPEN) are two
     separate tax events on the same day. This falls out naturally here:
     each trade becomes its own event, nothing roll-specific is done.
  3. Loss-offsetting rules between options/stocks/dividends are NOT
     implemented. This module produces one event per realized gain/loss;
     any netting is a reporting-level, estimate-only step (src/tax/report.py).
  4. Dividend withholding (US W-8BEN) and the Israeli credit are NOT
     computed. DIVIDEND events carry the gross ILS amount only.
"""
from dataclasses import dataclass
from datetime import date
from typing import Optional

from src.journal.cost_basis import RealizedSale
from src.options.tracking import ClosedOptionTranche

CATEGORY_STOCK = "STOCK"
CATEGORY_OPTION = "OPTION"
CATEGORY_DIVIDEND = "DIVIDEND"


@dataclass
class TaxEvent:
    security_id: int
    ticker: str
    event_date: str
    category: str
    gain_loss_ils: Optional[float]   # None if an FX rate is missing on either leg
    tax_year: int
    fx_rate_open: Optional[float]
    fx_rate_close: Optional[float]
    gross_amount_usd: Optional[float] = None  # populated for DIVIDEND only
    notes: str = ""


def tax_year_of(event_date: str) -> int:
    return date.fromisoformat(event_date).year


def compute_gain_ils(
    open_leg_usd: float,
    open_fx_rate: Optional[float],
    close_leg_usd: float,
    close_fx_rate: Optional[float],
) -> Optional[float]:
    """Converts two dated USD cash flows to ILS using the rate applicable
    to EACH leg's own date (not a single blended rate) — this is what
    embeds the FX gain/loss into the ILS result (section 10 point 1).

    Pass each leg's actual SIGNED cash flow (outflows negative, inflows
    positive) dated to when it happened — not "cost" and "proceeds"
    labels, since which leg is a cost vs. a proceed differs by
    instrument: a stock purchase is an outflow at open and the sale is
    an inflow at close, but a covered call's premium is an INFLOW at
    open and the buy-to-close (if any) is an outflow at close. Getting
    this backwards silently produces a plausible-looking wrong number —
    see tests/test_tax_service.py's roll test for the regression this
    interface exists to prevent.

    Returns None if either rate is missing: fx_rate on a trade is
    optional (manual entry, ASSUMPTIONS.md #4), so a gain that can't yet
    be converted must not be silently treated as zero.
    """
    if open_fx_rate is None or close_fx_rate is None:
        return None
    return open_leg_usd * open_fx_rate + close_leg_usd * close_fx_rate


def stock_sale_to_tax_event(
    sale: RealizedSale,
    security_id: int,
    ticker: str,
    fx_rate_open: Optional[float],
    fx_rate_close: Optional[float],
) -> TaxEvent:
    cost = sale.quantity * sale.buy_price + sale.buy_commission_alloc  # outflow at open (buy)
    proceeds = sale.quantity * sale.sell_price - sale.sell_commission_alloc  # inflow at close (sell)
    gain_ils = compute_gain_ils(-cost, fx_rate_open, proceeds, fx_rate_close)
    return TaxEvent(
        security_id=security_id, ticker=ticker, event_date=sale.close_date, category=CATEGORY_STOCK,
        gain_loss_ils=gain_ils, tax_year=tax_year_of(sale.close_date),
        fx_rate_open=fx_rate_open, fx_rate_close=fx_rate_close,
        notes=f"מכירת {sale.quantity} מניות (נקנו {sale.open_date}, נמכרו {sale.close_date})",
    )


def option_tranche_to_tax_event(
    tranche: ClosedOptionTranche,
    security_id: int,
    ticker: str,
    fx_rate_open: Optional[float],
    fx_rate_close: Optional[float],
) -> TaxEvent:
    # inflow at open (premium received writing the call); outflow at close (buy-to-close, or $0)
    gain_ils = compute_gain_ils(tranche.premium_received, fx_rate_open, -tranche.cost_to_close, fx_rate_close)
    return TaxEvent(
        security_id=security_id, ticker=ticker, event_date=tranche.close_date, category=CATEGORY_OPTION,
        gain_loss_ils=gain_ils, tax_year=tax_year_of(tranche.close_date),
        fx_rate_open=fx_rate_open, fx_rate_close=fx_rate_close,
        notes=f"{tranche.close_type}, strike {tranche.strike}, {tranche.contracts} חוזים (נפתח {tranche.open_date})",
    )


def dividend_trade_to_tax_event(
    trade: dict,
    security_id: int,
    ticker: str,
    fx_rate: Optional[float],
) -> TaxEvent:
    """trade['quantity'] = shares held at record date, trade['price'] =
    dividend per share (mirrors the STOCK_BUY/SELL quantity/price
    convention) — see ASSUMPTIONS.md."""
    gross_usd = trade["quantity"] * trade["price"] - trade["commission"]
    gross_ils = gross_usd * fx_rate if fx_rate is not None else None
    return TaxEvent(
        security_id=security_id, ticker=ticker, event_date=trade["trade_date"], category=CATEGORY_DIVIDEND,
        gain_loss_ils=gross_ils, tax_year=tax_year_of(trade["trade_date"]),
        fx_rate_open=None, fx_rate_close=fx_rate, gross_amount_usd=gross_usd,
        notes="סכום ברוטו — לפני ניכוי במקור אמריקאי (W-8BEN) וזיכוי בישראל, לא מחושבים כאן",
    )
