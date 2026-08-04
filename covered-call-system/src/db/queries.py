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
    # check_same_thread=False: FastAPI's sync `get_db` dependency (src/web/deps.py)
    # creates this connection in a threadpool worker, but async route handlers
    # (e.g. refresh-prices) then use it from the event loop thread. The
    # connection is still scoped to a single request and never shared
    # concurrently, so this is safe.
    conn = sqlite3.connect(db_path, check_same_thread=False)
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


def set_next_ex_dividend_date(conn: sqlite3.Connection, security_id: int, date_str: Optional[str]) -> None:
    """Manual input (no dividend-calendar data source is wired yet, ASSUMPTIONS.md)."""
    conn.execute(
        """INSERT INTO position_classification (security_id, next_ex_dividend_date, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(security_id) DO UPDATE SET
                next_ex_dividend_date = excluded.next_ex_dividend_date,
                updated_at = excluded.updated_at""",
        (security_id, date_str),
    )
    conn.commit()


def get_next_ex_dividend_dates(conn: sqlite3.Connection) -> dict[int, Optional[str]]:
    rows = conn.execute(
        "SELECT security_id, next_ex_dividend_date FROM position_classification"
    ).fetchall()
    return {row["security_id"]: row["next_ex_dividend_date"] for row in rows}


def replace_active_alerts(conn: sqlite3.Connection, computed: list[dict]) -> None:
    """Called on each manual alert refresh (section 8): replaces the
    current non-dismissed alert set with freshly computed ones. Dismissed
    alerts stay as historical rows (dismissed_at set) but are not carried
    forward — if a dismissed condition still holds on the next refresh, it
    reappears, since this is a manually-triggered check-in, not a push
    notification (ASSUMPTIONS.md).
    """
    conn.execute("DELETE FROM alerts WHERE dismissed_at IS NULL")
    if computed:
        conn.executemany(
            "INSERT INTO alerts (security_id, rule, message) VALUES (:security_id, :rule, :message)",
            computed,
        )
    conn.commit()


def list_active_alerts(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM alerts WHERE dismissed_at IS NULL ORDER BY created_at DESC"
    ).fetchall()


def dismiss_alert(conn: sqlite3.Connection, alert_id: int) -> None:
    conn.execute("UPDATE alerts SET dismissed_at = datetime('now') WHERE id = ?", (alert_id,))
    conn.commit()
