"""Dataclasses mirroring the rows in schema.sql. No business logic here."""
from dataclasses import dataclass
from typing import Optional

VALID_TRADE_TYPES = (
    "STOCK_BUY", "STOCK_SELL",
    "CALL_SELL_OPEN", "CALL_BUY_CLOSE",
    "ASSIGNMENT", "EXPIRATION", "DIVIDEND",
)

VALID_POSITION_TYPES = ("CORE", "INCOME")


@dataclass
class Security:
    id: Optional[int]
    ticker: str
    exchange: str
    currency: str
    name: Optional[str] = None
    sector: Optional[str] = None
    options_eligible: bool = True


@dataclass
class Trade:
    id: Optional[int]
    security_id: int
    trade_date: str
    type: str
    quantity: float
    price: float
    commission: float
    currency: str
    fx_rate: Optional[float] = None
    strike: Optional[float] = None
    expiry: Optional[str] = None
    roll_group_id: Optional[str] = None
    lot_id: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class Position:
    """Fully derived from trades (+ manual position_type). Never stored as-is."""
    security_id: int
    ticker: str
    shares_held: float
    position_type: Optional[str]
    avg_cost_raw: Optional[float]
    avg_cost_adjusted: Optional[float]
    total_premium_collected: float
    opened_date: Optional[str]
