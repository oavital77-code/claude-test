"""Options-liquidity screen (docs/SPEC.md section 6, stage 2) — described
in the spec as "הסינון המכריע בפועל": a stock that clears the fundamental
screen but fails here is kept on a "holding only" list rather than
discarded. Pure functions over OptionQuote (src/data_providers/ibkr.py).

Two different chain views are needed:
  - `chain`: near-the-money quotes at the target expiry window (the same
    fetch used for strike selection/roll alternatives, stage 3) — used
    for the open-interest and bid/ask-spread checks.
  - `available_expiries`: the FULL list of expiry dates IBKR offers for
    the underlying (independent of strike/expiry-window filtering) —
    used for the "at least 3 months of monthly expiries" check, since
    that needs to see beyond the narrow 30-45 day window `chain` covers.
"""
from dataclasses import dataclass, field
from typing import Optional

from src.data_providers.ibkr import OptionQuote


def spread_ok(quote: OptionQuote, max_pct_of_mid: float, max_abs_usd: float) -> Optional[bool]:
    """Passes if the bid/ask spread clears EITHER the % or the absolute
    threshold (section 6: 'עד 5% מ-mid, או עד 0.10 דולר')."""
    if quote.bid is None or quote.ask is None:
        return None
    spread = quote.ask - quote.bid
    mid = quote.mid
    pct_ok = mid is not None and mid > 0 and spread <= max_pct_of_mid * mid
    abs_ok = spread <= max_abs_usd
    return pct_ok or abs_ok


def count_available_expiry_months(available_expiries: list[str]) -> int:
    """Distinct calendar months represented across ALL of the
    underlying's available expiries (ISO YYYY-MM-DD)."""
    return len({e[:7] for e in available_expiries})


@dataclass
class LiquidityResult:
    open_interest_ok: Optional[bool]
    spread_ok: Optional[bool]
    expiry_months_ok: Optional[bool]
    volume_ok: Optional[bool]
    best_open_interest: Optional[float]
    available_expiry_months: Optional[int]
    reasons_failed: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.reasons_failed) == 0

    @property
    def score(self) -> float:
        checks = [self.open_interest_ok, self.spread_ok, self.expiry_months_ok, self.volume_ok]
        known = [c for c in checks if c is not None]
        return (sum(1 for c in known if c) / len(known) * 100) if known else 0.0


def evaluate_liquidity(
    chain: list[OptionQuote],
    available_expiries: list[str],
    avg_daily_volume: Optional[float],
    config: dict,
) -> LiquidityResult:
    l_cfg = config["screener"]["liquidity"]
    reasons = []

    best_oi = max((q.open_interest for q in chain if q.open_interest is not None), default=None)
    oi_ok = None if best_oi is None else best_oi >= l_cfg["open_interest_min"]
    if oi_ok is False:
        reasons.append(f"Open Interest המקסימלי בשרשרת ({best_oi:.0f}) מתחת לסף {l_cfg['open_interest_min']}")

    spread_flags = [
        spread_ok(q, l_cfg["bid_ask_spread_max_pct_of_mid"], l_cfg["bid_ask_spread_max_abs_usd"]) for q in chain
    ]
    known_spreads = [f for f in spread_flags if f is not None]
    # "at least one strike in the window is tradeable" — not every strike needs a tight spread
    spreads_ok_flag = any(known_spreads) if known_spreads else None
    if spreads_ok_flag is False:
        reasons.append("אף סטרייק בשרשרת לא עומד בסף ה-bid/ask spread")

    months = count_available_expiry_months(available_expiries) if available_expiries else None
    expiry_months_ok = None if months is None else months >= l_cfg["min_months_of_expiries_available"]
    if expiry_months_ok is False:
        reasons.append(f"רק {months} חודשי תפוגה זמינים, נדרש {l_cfg['min_months_of_expiries_available']}")

    volume_ok = None if avg_daily_volume is None else avg_daily_volume >= l_cfg["avg_daily_volume_min_shares"]
    if volume_ok is False:
        reasons.append(f"נפח יומי ממוצע {avg_daily_volume:,.0f} מתחת לסף {l_cfg['avg_daily_volume_min_shares']:,.0f}")

    return LiquidityResult(
        open_interest_ok=oi_ok, spread_ok=spreads_ok_flag, expiry_months_ok=expiry_months_ok,
        volume_ok=volume_ok, best_open_interest=best_oi, available_expiry_months=months,
        reasons_failed=reasons,
    )
