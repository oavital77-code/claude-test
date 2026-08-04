import pytest

from src.db.queries import get_connection, init_db
from src.journal.entry import ValidationError, classify_position, record_trade
from src.journal.positions import compute_position, list_open_positions
from src.db.queries import list_securities


@pytest.fixture
def conn(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    connection = get_connection(db_path)
    yield connection
    connection.close()


def test_position_derived_from_trades_not_entered_directly(conn):
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-10", type="STOCK_BUY", quantity=200, price=180, commission=1.5)
    record_trade(conn, ticker="AAPL", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="CALL_SELL_OPEN", quantity=2, price=2.5,
                 commission=1.3, strike=190, expiry="2026-03-20")

    positions = list_open_positions(conn)
    assert len(positions) == 1
    pos = positions[0]
    assert pos.ticker == "AAPL"
    assert pos.shares_held == 200
    assert pos.avg_cost_raw == pytest.approx(180 + 1.5 / 200)
    assert pos.total_premium_collected == pytest.approx(2 * 2.5 * 100 - 1.3)
    assert pos.avg_cost_adjusted == pytest.approx(pos.avg_cost_raw - pos.total_premium_collected / 200)
    assert pos.position_type is None  # not classified yet


def test_fully_closed_position_excluded_from_open_positions(conn):
    record_trade(conn, ticker="MSFT", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=100, price=300, commission=1)
    record_trade(conn, ticker="MSFT", exchange="NASDAQ", currency="USD",
                 trade_date="2026-02-01", type="STOCK_SELL", quantity=100, price=310, commission=1)

    assert list_open_positions(conn) == []


def test_classify_position_persists_and_is_reflected_in_position(conn):
    record_trade(conn, ticker="GOOG", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=50, price=140, commission=1)
    security_id = list_securities(conn)[0]["id"]

    classify_position(conn, security_id, "CORE")

    positions = list_open_positions(conn)
    assert positions[0].position_type == "CORE"


def test_classify_position_rejects_invalid_type(conn):
    record_trade(conn, ticker="GOOG", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=50, price=140, commission=1)
    security_id = list_securities(conn)[0]["id"]

    with pytest.raises(ValidationError):
        classify_position(conn, security_id, "SPECULATIVE")


def test_record_trade_rejects_overselling(conn):
    record_trade(conn, ticker="TSLA", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=10, price=200, commission=1)

    with pytest.raises(ValidationError):
        record_trade(conn, ticker="TSLA", exchange="NASDAQ", currency="USD",
                      trade_date="2026-02-01", type="STOCK_SELL", quantity=20, price=210, commission=1)


def test_record_trade_requires_strike_and_expiry_for_options(conn):
    record_trade(conn, ticker="TSLA", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=100, price=200, commission=1)

    with pytest.raises(ValidationError):
        record_trade(conn, ticker="TSLA", exchange="NASDAQ", currency="USD",
                      trade_date="2026-02-01", type="CALL_SELL_OPEN", quantity=1, price=3.0, commission=1)


def test_compute_position_for_security_with_no_trades(conn):
    record_trade(conn, ticker="AMZN", exchange="NASDAQ", currency="USD",
                 trade_date="2026-01-01", type="STOCK_BUY", quantity=10, price=100, commission=0)
    security_row = list_securities(conn)[0]
    pos = compute_position(conn, security_row)
    assert pos.shares_held == 10
