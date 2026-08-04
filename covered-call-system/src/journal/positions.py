"""Derives current positions from the trades table. Per docs/SPEC.md
section 9: "מזינים אירועים, לא מצבים" — positions are never entered
directly, they are recomputed here every time from src.journal.cost_basis.
"""
import sqlite3

from src.db.models import Position
from src.db.queries import get_position_classifications, list_securities, list_trades
from src.journal.cost_basis import adjusted_cost_basis, compute_fifo, net_premium_collected


def _trade_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def compute_position(conn: sqlite3.Connection, security_row: sqlite3.Row, position_type: str = None) -> Position:
    security_id = security_row["id"]
    trades = [_trade_to_dict(t) for t in list_trades(conn, security_id)]

    fifo = compute_fifo(trades)
    premium = net_premium_collected(trades)
    shares_held = fifo.shares_held
    avg_cost_raw = fifo.avg_cost_raw
    avg_cost_adj = adjusted_cost_basis(fifo, premium)

    opened_date = min((lot.open_date for lot in fifo.open_lots), default=None)
    if position_type is None:
        position_type = get_position_classifications(conn).get(security_id)

    return Position(
        security_id=security_id,
        ticker=security_row["ticker"],
        shares_held=shares_held,
        position_type=position_type,
        avg_cost_raw=avg_cost_raw,
        avg_cost_adjusted=avg_cost_adj,
        total_premium_collected=premium,
        opened_date=opened_date,
    )


def list_open_positions(conn: sqlite3.Connection) -> list[Position]:
    """All securities with a nonzero share balance, derived fresh from trades."""
    classifications = get_position_classifications(conn)
    positions = [
        compute_position(conn, sec, classifications.get(sec["id"]))
        for sec in list_securities(conn)
    ]
    return [p for p in positions if abs(p.shares_held) > 1e-9]
