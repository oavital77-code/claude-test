"""Wires src/tax/events.py (pure) to the DB, the same way
src/journal/positions.py wires cost_basis.py and src/options/service.py
wires tracking.py.

Tax events are computed fresh from trades every time — never persisted
to the `tax_events` table in schema.sql, even though that table exists.
This keeps the same "positions/derived state is recomputed, never
entered or cached" principle (section 9) applied consistently: if a
historical trade or its fx_rate is corrected, tax events must reflect
that immediately, not go stale in a stored table. See ASSUMPTIONS.md.
"""
import sqlite3

from src.db.queries import list_securities, list_trades
from src.journal.cost_basis import compute_fifo
from src.options.tracking import compute_option_lots
from src.tax.events import TaxEvent, dividend_trade_to_tax_event, option_tranche_to_tax_event, stock_sale_to_tax_event


def compute_tax_events_for_security(conn: sqlite3.Connection, security_id: int, ticker: str) -> list[TaxEvent]:
    trades = [dict(t) for t in list_trades(conn, security_id)]
    trades_by_id = {t["id"]: t for t in trades}

    def fx_rate_of(trade_id):
        return trades_by_id.get(trade_id, {}).get("fx_rate")

    events: list[TaxEvent] = []

    for sale in compute_fifo(trades).realized_sales:
        events.append(stock_sale_to_tax_event(
            sale, security_id, ticker, fx_rate_of(sale.open_trade_id), fx_rate_of(sale.close_trade_id),
        ))

    for tranche in compute_option_lots(trades).closed_tranches:
        events.append(option_tranche_to_tax_event(
            tranche, security_id, ticker, fx_rate_of(tranche.open_trade_id), fx_rate_of(tranche.close_trade_id),
        ))

    for t in trades:
        if t["type"] == "DIVIDEND":
            events.append(dividend_trade_to_tax_event(t, security_id, ticker, t.get("fx_rate")))

    return events


def compute_all_tax_events(conn: sqlite3.Connection) -> list[TaxEvent]:
    events: list[TaxEvent] = []
    for sec in list_securities(conn):
        events.extend(compute_tax_events_for_security(conn, sec["id"], sec["ticker"]))
    return sorted(events, key=lambda e: e.event_date)
