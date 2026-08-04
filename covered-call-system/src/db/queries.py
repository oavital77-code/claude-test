"""SQLite connection helper and CRUD queries for securities, trades and
manual position classification. Position aggregates (shares held, cost
basis, premium collected) are computed in src/journal/positions.py from
the rows returned here — never read or written as stored state.
"""
import sqlite3
from pathlib import Path
from typing import Optional

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection(db_path)
    try:
        conn.executescript(SCHEMA_PATH.read_text())
        conn.commit()
    finally:
        conn.close()


def get_or_create_security(
    conn: sqlite3.Connection,
    ticker: str,
    exchange: str,
    currency: str,
    name: Optional[str] = None,
    sector: Optional[str] = None,
    options_eligible: bool = True,
) -> int:
    row = conn.execute(
        "SELECT id FROM securities WHERE ticker = ? AND exchange = ?",
        (ticker, exchange),
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        """INSERT INTO securities (ticker, exchange, currency, name, sector, options_eligible)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (ticker, exchange, currency, name, sector, int(options_eligible)),
    )
    conn.commit()
    return cur.lastrowid


def list_securities(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM securities ORDER BY ticker").fetchall()


def insert_trade(conn: sqlite3.Connection, trade: dict) -> int:
    cur = conn.execute(
        """INSERT INTO trades
           (security_id, trade_date, type, quantity, price, commission, currency,
            fx_rate, strike, expiry, roll_group_id, lot_id, notes)
           VALUES (:security_id, :trade_date, :type, :quantity, :price, :commission,
                   :currency, :fx_rate, :strike, :expiry, :roll_group_id, :lot_id, :notes)""",
        trade,
    )
    conn.commit()
    return cur.lastrowid


def list_trades(conn: sqlite3.Connection, security_id: Optional[int] = None) -> list[sqlite3.Row]:
    if security_id is not None:
        return conn.execute(
            "SELECT * FROM trades WHERE security_id = ? ORDER BY trade_date, id",
            (security_id,),
        ).fetchall()
    return conn.execute("SELECT * FROM trades ORDER BY trade_date, id").fetchall()


def set_position_classification(conn: sqlite3.Connection, security_id: int, position_type: str) -> None:
    conn.execute(
        """INSERT INTO position_classification (security_id, position_type, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(security_id) DO UPDATE SET
                position_type = excluded.position_type,
                updated_at = excluded.updated_at""",
        (security_id, position_type),
    )
    conn.commit()


def get_position_classifications(conn: sqlite3.Connection) -> dict[int, str]:
    rows = conn.execute("SELECT security_id, position_type FROM position_classification").fetchall()
    return {row["security_id"]: row["position_type"] for row in rows}
