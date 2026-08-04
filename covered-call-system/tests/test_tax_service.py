import pytest

from src.db.queries import get_connection, init_db
from src.journal.entry import record_trade
from src.tax.service import compute_all_tax_events, compute_tax_events_for_security


@pytest.fixture
def conn(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    connection = get_connection(db_path)
    yield connection
    connection.close()


def test_stock_sale_produces_a_tax_event_with_correct_fx_rates(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=180, commission=0, fx_rate=3.5)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-06-01", type="STOCK_SELL", quantity=100, price=200, commission=0, fx_rate=3.7)

    events = compute_tax_events_for_security(conn, security_id=1, ticker="AAPL")
    assert len(events) == 1
    event = events[0]
    assert event.category == "STOCK"
    assert event.fx_rate_open == pytest.approx(3.5)
    assert event.fx_rate_close == pytest.approx(3.7)
    proceeds, cost = 100 * 200, 100 * 180
    assert event.gain_loss_ils == pytest.approx(proceeds * 3.7 - cost * 3.5)


def test_roll_produces_two_separate_tax_events_same_day(conn):
    """Section 10 point 2: closing at a loss and reopening are two
    separate events, even on the same calendar day."""
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=180, commission=0, fx_rate=3.5)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="CALL_SELL_OPEN", quantity=1, price=2.0, commission=0,
                 strike=190, expiry="2026-03-20", fx_rate=3.5)
    # roll same day: close the old call at a loss, open a new one
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-03-01", type="CALL_BUY_CLOSE", quantity=1, price=3.0, commission=0,
                 strike=190, expiry="2026-03-20", fx_rate=3.6)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-03-01", type="CALL_SELL_OPEN", quantity=1, price=2.5, commission=0,
                 strike=195, expiry="2026-04-17", fx_rate=3.6)

    events = compute_tax_events_for_security(conn, security_id=1, ticker="AAPL")
    option_events = [e for e in events if e.category == "OPTION"]
    assert len(option_events) == 1  # only the CLOSE is realized; the new open isn't a tax event yet
    closed = option_events[0]
    assert closed.event_date == "2026-03-01"
    premium_received, cost_to_close = 1 * 2.0 * 100, 1 * 3.0 * 100
    assert closed.gain_loss_ils == pytest.approx(premium_received * 3.5 - cost_to_close * 3.6)
    assert closed.gain_loss_ils < 0  # closed at a loss, as set up


def test_dividend_produces_a_tax_event(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=180, commission=0)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-15", type="DIVIDEND", quantity=100, price=0.5, commission=0, fx_rate=3.6)

    events = compute_tax_events_for_security(conn, security_id=1, ticker="AAPL")
    dividend_events = [e for e in events if e.category == "DIVIDEND"]
    assert len(dividend_events) == 1
    assert dividend_events[0].gross_amount_usd == pytest.approx(50.0)
    assert dividend_events[0].gain_loss_ils == pytest.approx(50.0 * 3.6)


def test_compute_all_tax_events_covers_multiple_securities(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=180, commission=0, fx_rate=3.5)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="STOCK_SELL", quantity=100, price=190, commission=0, fx_rate=3.6)
    record_trade(conn, ticker="MSFT", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=50, price=300, commission=0, fx_rate=3.5)
    record_trade(conn, ticker="MSFT", exchange="NASDAQ", currency="USD",
                 trade_date="2026-03-01", type="STOCK_SELL", quantity=50, price=320, commission=0, fx_rate=3.6)

    events = compute_all_tax_events(conn)
    tickers = {e.ticker for e in events}
    assert tickers == {"AAPL", "MSFT"}
    assert events == sorted(events, key=lambda e: e.event_date)


def test_open_position_produces_no_tax_events_yet(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=180, commission=0, fx_rate=3.5)
    events = compute_tax_events_for_security(conn, security_id=1, ticker="AAPL")
    assert events == []
