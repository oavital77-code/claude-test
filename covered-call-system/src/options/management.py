"""Management rules and alerts (docs/SPEC.md section 8) plus roll
alternative generation. Pure logic — no IBKR connection or DB access —
consuming OpenOptionLot (src/options/tracking.py) and OptionQuote
(src/data_providers/ibkr.py) so it's unit-testable against synthetic data.
"""
from dataclasses import dataclass
from datetime import date
from typing import Optional

from src.data_providers.ibkr import OptionQuote
from src.db.models import Position
from src.options.chain_analysis import days_to_expiry, min_allowed_strike
from src.options.tracking import OpenOptionLot, pct_captured_now

PROFIT_TAKE = "PROFIT_TAKE"
ROLL = "ROLL"
EX_DIVIDEND = "EX_DIVIDEND"
STRIKE_CROSS = "STRIKE_CROSS"


@dataclass
class AlertSuggestion:
    rule: str
    message: str


@dataclass
class RollAlternative:
    quote: OptionQuote
    days_to_expiry: int
    net_credit_debit: float
    delta: Optional[float]
    above_cost_basis: bool


def evaluate_alerts(
    lot: OpenOptionLot,
    position: Position,
    stock_price: Optional[float],
    option_current_price: Optional[float],
    config: dict,
    next_ex_dividend_date: Optional[date] = None,
    as_of: Optional[date] = None,
) -> list[AlertSuggestion]:
    """The four rules from section 8's table, evaluated for one open lot."""
    as_of = as_of or date.today()
    mgmt_cfg = config["management_alerts"]
    alerts: list[AlertSuggestion] = []

    if option_current_price is not None:
        pct = pct_captured_now(lot, option_current_price)
        if pct is not None and pct >= mgmt_cfg["profit_take_pct_of_premium_captured"]:
            alerts.append(AlertSuggestion(
                PROFIT_TAKE,
                f"נתפסו {pct:.0%} מהפרמיה על strike {lot.strike} (תפוגה {lot.expiry}). "
                f"שקול לסגור ולכתוב מחדש.",
            ))

    dte = days_to_expiry(lot.expiry, as_of)
    if dte <= mgmt_cfg["roll_days_to_expiry_threshold"]:
        alerts.append(AlertSuggestion(
            ROLL,
            f"נותרו {dte} ימים לפקיעת strike {lot.strike} ({lot.expiry}). שקול roll.",
        ))

    if next_ex_dividend_date is not None:
        days_to_ex = (next_ex_dividend_date - as_of).days
        if 0 <= days_to_ex <= mgmt_cfg["ex_dividend_alert_days"]:
            itm = stock_price is not None and stock_price >= lot.strike
            itm_note = " הפוזיציה ITM — סיכון מימוש מוקדם מוגבר." if itm else ""
            alerts.append(AlertSuggestion(
                EX_DIVIDEND,
                f"אקס-דיבידנד בעוד {days_to_ex} ימים ({next_ex_dividend_date.isoformat()}).{itm_note}",
            ))

    if mgmt_cfg["strike_cross_alert"] and stock_price is not None and stock_price > lot.strike:
        policy = (
            "פוזיציית CORE — יש לגלגל תמיד, להימנע ממימוש."
            if position.position_type == "CORE"
            else "פוזיציית INCOME — מימוש מקובל."
        )
        alerts.append(AlertSuggestion(
            STRIKE_CROSS,
            f"מחיר המניה ({stock_price:.2f}) עבר את ה-strike ({lot.strike}). {policy}",
        ))

    return alerts


def generate_roll_alternatives(
    lot: OpenOptionLot,
    chain: list[OptionQuote],
    position: Position,
    current_stock_price: float,
    current_option_price: float,
    config: dict,
    count: Optional[int] = None,
    as_of: Optional[date] = None,
) -> list[RollAlternative]:
    """Ranks chain candidates by closeness to the position type's target
    delta, honoring the same hard cost-basis floor as strike selection
    (section 7). Net credit/debit is computed against the cost of closing
    the CURRENT lot at its live price.
    """
    as_of = as_of or date.today()
    count = count or config["management_alerts"]["roll_alternatives_count"]
    position_type = position.position_type or "INCOME"
    pt_cfg = config["position_types"][position_type]
    target_delta = (pt_cfg["target_delta_min"] + pt_cfg["target_delta_max"]) / 2
    days_min = config["options"]["expiry_days_min"]
    days_max = config["options"]["expiry_days_max"]
    floor = min_allowed_strike(position_type, current_stock_price, position.avg_cost_adjusted, config)

    cost_to_close_current = lot.contracts * current_option_price * 100

    candidates = []
    for q in chain:
        if q.strike < floor or q.delta is None:
            continue
        if q.strike == lot.strike and q.expiry == lot.expiry:
            continue  # not a roll if it's the same contract
        dte = days_to_expiry(q.expiry, as_of)
        if days_min <= dte <= days_max:
            candidates.append((q, dte))

    candidates.sort(key=lambda pair: abs(pair[0].delta - target_delta))

    alternatives = []
    for q, dte in candidates[:count]:
        new_premium = lot.contracts * (q.mid or 0) * 100
        net = new_premium - cost_to_close_current
        above_basis = position.avg_cost_adjusted is None or q.strike >= position.avg_cost_adjusted
        alternatives.append(RollAlternative(
            quote=q, days_to_expiry=dte, net_credit_debit=net, delta=q.delta, above_cost_basis=above_basis,
        ))
    return alternatives
