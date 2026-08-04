"""Pure strike/expiry selection logic (docs/SPEC.md section 7). No IBKR
connection here — src/data_providers/ibkr.py supplies the OptionQuote
chain; this module only reasons about it, so it's fully unit-testable.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from src.data_providers.ibkr import OptionQuote


@dataclass
class StrikeSuggestion:
    quote: OptionQuote
    target_delta: float
    days_to_expiry: int
    crosses_earnings: bool


def days_to_expiry(expiry: str, as_of: Optional[date] = None) -> int:
    """expiry is ISO YYYY-MM-DD — the format used by trades.expiry,
    OpenOptionLot.expiry, and OptionQuote.expiry alike (the IBKR client
    normalizes its native YYYYMMDD to this at the data-provider boundary,
    src/data_providers/ibkr.py)."""
    as_of = as_of or date.today()
    expiry_date = date.fromisoformat(expiry)
    return (expiry_date - as_of).days


def third_friday(year: int, month: int) -> date:
    """Monthly options expire on the third Friday (section 7: 'שליש שישי')."""
    first_of_month = date(year, month, 1)
    days_to_first_friday = (4 - first_of_month.weekday()) % 7  # Friday = weekday 4
    first_friday = first_of_month + timedelta(days=days_to_first_friday)
    return first_friday + timedelta(weeks=2)


def monthly_expiries_in_range(days_min: int, days_max: int, as_of: Optional[date] = None) -> list[date]:
    """Third-Friday monthly expiries falling within [days_min, days_max]
    days from as_of. Scans forward a few months since the window (30-45
    days) can straddle a month boundary.
    """
    as_of = as_of or date.today()
    year, month = as_of.year, as_of.month
    candidates = []
    for _ in range(4):
        tf = third_friday(year, month)
        if days_min <= (tf - as_of).days <= days_max:
            candidates.append(tf)
        month += 1
        if month > 12:
            month = 1
            year += 1
    return candidates


def min_allowed_strike(
    position_type: str, current_price: float, avg_cost_adjusted: Optional[float], config: dict,
) -> float:
    """Hard floor per section 7: never below avg_cost_adjusted, and never
    below the position type's minimum % of current price (107%/103%)."""
    pt_cfg = config["position_types"][position_type]
    pct_floor = current_price * pt_cfg["strike_min_pct_of_price"]
    if avg_cost_adjusted is not None:
        return max(pct_floor, avg_cost_adjusted)
    return pct_floor


def select_strike(
    chain: list[OptionQuote],
    position_type: str,
    current_price: float,
    avg_cost_adjusted: Optional[float],
    config: dict,
    earnings_date: Optional[date] = None,
    as_of: Optional[date] = None,
) -> Optional[StrikeSuggestion]:
    """Picks the chain quote closest to the position type's target delta
    among candidates that respect the hard floor (min_allowed_strike) and
    the configured expiry window. Returns None if nothing qualifies."""
    as_of = as_of or date.today()
    pt_cfg = config["position_types"][position_type]
    target_delta = (pt_cfg["target_delta_min"] + pt_cfg["target_delta_max"]) / 2
    days_min = config["options"]["expiry_days_min"]
    days_max = config["options"]["expiry_days_max"]
    floor = min_allowed_strike(position_type, current_price, avg_cost_adjusted, config)

    candidates = []
    for q in chain:
        if q.strike < floor or q.delta is None:
            continue
        dte = days_to_expiry(q.expiry, as_of)
        if days_min <= dte <= days_max:
            candidates.append((q, dte))

    if not candidates:
        return None

    best_quote, best_dte = min(candidates, key=lambda pair: abs(pair[0].delta - target_delta))
    expiry_date = date.fromisoformat(best_quote.expiry)
    crosses_earnings = earnings_date is not None and as_of <= earnings_date <= expiry_date

    return StrikeSuggestion(
        quote=best_quote,
        target_delta=target_delta,
        days_to_expiry=best_dte,
        crosses_earnings=crosses_earnings,
    )
