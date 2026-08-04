"""Derives open/closed option (call) positions from the trades table, per
docs/SPEC.md section 5 (option_positions) and section 12 stage 3. Mirrors
the FIFO approach in src/journal/cost_basis.py, but tracks *contracts*
instead of shares, and is pure (no DB access) for testability.

Quantity convention (see ASSUMPTIONS.md #1):
  - CALL_SELL_OPEN, CALL_BUY_CLOSE, EXPIRATION: trades.quantity is in
    CONTRACTS (1 contract = 100 shares, config.yaml).
  - ASSIGNMENT: trades.quantity is in SHARES (consistent with
    STOCK_SELL, since it is simultaneously a stock disposal — handled
    separately in cost_basis.py). Here it is converted to contracts by
    dividing by 100.
"""
from dataclasses import dataclass, field
from typing import Optional

OPTION_OPEN_TYPES = ("CALL_SELL_OPEN",)
OPTION_CLOSE_TYPES = ("CALL_BUY_CLOSE", "ASSIGNMENT", "EXPIRATION")


def _contracts_in_trade(t: dict) -> float:
    if t["type"] == "ASSIGNMENT":
        return t["quantity"] / 100
    return t["quantity"]


@dataclass
class OpenOptionLot:
    trade_id: int
    open_date: str
    contracts: float      # remaining, not yet closed
    strike: float
    expiry: str
    premium_per_contract: float
    commission_per_contract: float
    currency: str

    @property
    def premium_received(self) -> float:
        return self.contracts * self.premium_per_contract * 100 - self.contracts * self.commission_per_contract


@dataclass
class ClosedOptionTranche:
    open_trade_id: int
    close_trade_id: int
    close_type: str    # CALL_BUY_CLOSE / ASSIGNMENT / EXPIRATION
    open_date: str
    close_date: str
    contracts: float
    strike: float
    expiry: str
    premium_received: float   # this tranche's share of the opening premium, net of open commission
    cost_to_close: float      # 0 for ASSIGNMENT/EXPIRATION

    @property
    def pct_captured(self) -> Optional[float]:
        if self.premium_received == 0:
            return None
        return (self.premium_received - self.cost_to_close) / self.premium_received


@dataclass
class OptionFifoResult:
    open_lots: list[OpenOptionLot] = field(default_factory=list)
    closed_tranches: list[ClosedOptionTranche] = field(default_factory=list)


def compute_option_lots(trades: list[dict]) -> OptionFifoResult:
    """Replays CALL_SELL_OPEN / CALL_BUY_CLOSE / ASSIGNMENT / EXPIRATION
    for one security in trade_date order (FIFO on contracts).
    """
    ordered = sorted(
        (t for t in trades if t["type"] in OPTION_OPEN_TYPES + OPTION_CLOSE_TYPES),
        key=lambda t: (t["trade_date"], t.get("id") or 0),
    )
    lots: list[OpenOptionLot] = []
    tranches: list[ClosedOptionTranche] = []

    for t in ordered:
        if t["type"] in OPTION_OPEN_TYPES:
            contracts = t["quantity"]
            commission_per_contract = (t["commission"] / contracts) if contracts else 0.0
            lots.append(OpenOptionLot(
                trade_id=t["id"],
                open_date=t["trade_date"],
                contracts=contracts,
                strike=t["strike"],
                expiry=t["expiry"],
                premium_per_contract=t["price"],
                commission_per_contract=commission_per_contract,
                currency=t["currency"],
            ))
        else:
            remaining_to_close = _contracts_in_trade(t)
            close_commission_per_contract = (
                (t["commission"] / remaining_to_close) if remaining_to_close and t["type"] != "ASSIGNMENT" else 0.0
            )
            while remaining_to_close > 1e-9:
                if not lots:
                    raise ValueError(
                        f"Option FIFO underflow: trying to close {remaining_to_close} contracts "
                        f"with no open lots (trade {t.get('id')})"
                    )
                lot = lots[0]
                contracts_from_lot = min(lot.contracts, remaining_to_close)
                fraction = contracts_from_lot / lot.contracts
                lot_premium_received = lot.premium_received
                tranche_premium = lot_premium_received * fraction

                if t["type"] == "CALL_BUY_CLOSE":
                    cost_to_close = contracts_from_lot * t["price"] * 100 + contracts_from_lot * close_commission_per_contract
                else:  # ASSIGNMENT or EXPIRATION: obligation extinguished, no buy-to-close cost
                    cost_to_close = 0.0

                tranches.append(ClosedOptionTranche(
                    open_trade_id=lot.trade_id,
                    close_trade_id=t["id"],
                    close_type=t["type"],
                    open_date=lot.open_date,
                    close_date=t["trade_date"],
                    contracts=contracts_from_lot,
                    strike=lot.strike,
                    expiry=lot.expiry,
                    premium_received=tranche_premium,
                    cost_to_close=cost_to_close,
                ))

                lot.contracts -= contracts_from_lot
                remaining_to_close -= contracts_from_lot
                if lot.contracts <= 1e-9:
                    lots.pop(0)

    return OptionFifoResult(open_lots=lots, closed_tranches=tranches)


def pct_captured_now(lot: OpenOptionLot, current_option_price_per_contract: float) -> Optional[float]:
    """Unrealized % of premium captured for a still-OPEN lot, given the
    option contract's current market price (per contract, i.e. per
    share — multiply by 100 happens here)."""
    premium_received = lot.premium_received
    if premium_received == 0:
        return None
    current_value = lot.contracts * current_option_price_per_contract * 100
    return (premium_received - current_value) / premium_received
