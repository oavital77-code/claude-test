"""Combines derived positions (src/journal/positions.py) with a live price
snapshot (src/data_providers/ibkr.py) into market value and unrealized
P&L, per docs/SPEC.md section 12 stage 2. Pure functions — no IBKR
connection here, so this is unit-testable with plain Quote objects.

Two unrealized P&L figures are reported, per section 9's realized/
unrealized split and the distinction between avg_cost_raw and
avg_cost_adjusted:
  - unrealized_pl_raw: against the plain stock cost basis.
  - unrealized_pl_adjusted: against cost basis net of premium collected —
    "המדד האמיתי לרווחיות האסטרטגיה".
"""
from dataclasses import dataclass
from typing import Optional

from src.data_providers.ibkr import Quote
from src.db.models import Position


@dataclass
class PositionValuation:
    position: Position
    current_price: Optional[float]
    market_value: Optional[float]
    unrealized_pl_raw: Optional[float]
    unrealized_pl_adjusted: Optional[float]
    quote_source: Optional[str]
    quote_as_of: Optional[str]


def value_position(position: Position, quote: Optional[Quote]) -> PositionValuation:
    price = quote.price if quote else None

    market_value = price * position.shares_held if price is not None else None
    pl_raw = (
        (price - position.avg_cost_raw) * position.shares_held
        if price is not None and position.avg_cost_raw is not None
        else None
    )
    pl_adjusted = (
        (price - position.avg_cost_adjusted) * position.shares_held
        if price is not None and position.avg_cost_adjusted is not None
        else None
    )

    return PositionValuation(
        position=position,
        current_price=price,
        market_value=market_value,
        unrealized_pl_raw=pl_raw,
        unrealized_pl_adjusted=pl_adjusted,
        quote_source=quote.source if quote else None,
        quote_as_of=quote.as_of if quote else None,
    )


def value_positions(positions: list[Position], quotes: dict[str, Quote]) -> list[PositionValuation]:
    return [value_position(p, quotes.get(p.ticker)) for p in positions]


def total_market_value(valuations: list[PositionValuation]) -> Optional[float]:
    values = [v.market_value for v in valuations if v.market_value is not None]
    if not values or len(values) != len(valuations):
        return None  # partial data: don't report a misleadingly-low total
    return sum(values)
