import pytest

from src.db.queries import get_connection, init_db
from src.journal.entry import record_trade
from src.options.service import list_all_open_option_positions, open_lots_for_security


@pytest.fixture
def conn(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    connection = get_connection(db_path)
    yield connection
    connection.close()


def test_open_option_position_linked_to_stock_position(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=200, price=180, commission=1.5)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="CALL_SELL_OPEN", quantity=2, price=2.5,
                 commission=1.3, strike=190, expiry="2026-03-20")

    positions = list_all_open_option_positions(conn)
    assert len(positions) == 1
    assert positions[0].position.ticker == "AAPL"
    assert positions[0].lot.contracts == 2
    assert positions[0].lot.strike == 190


def test_no_open_lots_when_option_fully_closed(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=200, price=180, commission=0)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="CALL_SELL_OPEN", quantity=2, price=2.5,
                 commission=0, strike=190, expiry="2026-03-20")
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-15", type="CALL_BUY_CLOSE", quantity=2, price=1.0,
                 commission=0, strike=190, expiry="2026-03-20")

    assert list_all_open_option_positions(conn) == []


def test_open_lots_for_security_with_no_option_trades(conn):
    record_trade(conn, ticker="MSFT", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=100, price=300, commission=0)
    security_id = list_all_open_option_positions(conn)  # no options yet
    assert security_id == []
    from src.db.queries import list_securities
    sec = list_securities(conn)[0]
    assert open_lots_for_security(conn, sec["id"]) == []
