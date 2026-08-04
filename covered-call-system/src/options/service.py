"""Wires src/options/tracking.py (pure FIFO on contracts) to the DB, the
same way src/journal/positions.py wires cost_basis.py. Kept separate from
tracking.py so that module stays pure and unit-testable without a DB.
"""
import sqlite3
from dataclasses import dataclass

from src.db.models import Position
from src.db.queries import list_trades
from src.journal.positions import list_open_positions
from src.options.tracking import OpenOptionLot, compute_option_lots


@dataclass
class OpenOptionPosition:
    position: Position
    lot: OpenOptionLot


def open_lots_for_security(conn: sqlite3.Connection, security_id: int) -> list[OpenOptionLot]:
    trades = [dict(t) for t in list_trades(conn, security_id)]
    return compute_option_lots(trades).open_lots


def list_all_open_option_positions(conn: sqlite3.Connection) -> list[OpenOptionPosition]:
    """One entry per open call lot, across every open stock position."""
    result = []
    for position in list_open_positions(conn):
        for lot in open_lots_for_security(conn, position.security_id):
            result.append(OpenOptionPosition(position=position, lot=lot))
    return result
