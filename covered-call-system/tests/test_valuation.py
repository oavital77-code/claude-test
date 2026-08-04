import pytest

from src.data_providers.ibkr import Quote
from src.db.models import Position
from src.journal.valuation import total_market_value, value_position, value_positions


def make_position(ticker="AAPL", shares=200, avg_cost_raw=180.0, avg_cost_adjusted=177.5, premium=500.0):
    return Position(
        security_id=1, ticker=ticker, shares_held=shares, position_type="CORE",
        avg_cost_raw=avg_cost_raw, avg_cost_adjusted=avg_cost_adjusted,
        total_premium_collected=premium, opened_date="2026-01-10",
    )


def make_quote(ticker="AAPL", price=190.0):
    return Quote(ticker=ticker, price=price, as_of="2026-08-04T12:00:00+00:00",
                 source="IBKR (מושהה ~15 דק')", is_delayed=True)


class TestValuePosition:
    def test_computes_market_value_and_both_pl_figures(self):
        pos = make_position()
        quote = make_quote(price=190.0)
        v = value_position(pos, quote)

        assert v.current_price == 190.0
        assert v.market_value == pytest.approx(200 * 190.0)
        assert v.unrealized_pl_raw == pytest.approx((190.0 - 180.0) * 200)
        assert v.unrealized_pl_adjusted == pytest.approx((190.0 - 177.5) * 200)

    def test_adjusted_pl_is_higher_than_raw_pl_when_premium_collected(self):
        """The whole point of avg_cost_adjusted: premium makes the position look better."""
        pos = make_position()
        v = value_position(pos, make_quote(price=190.0))
        assert v.unrealized_pl_adjusted > v.unrealized_pl_raw

    def test_missing_quote_yields_all_none_market_fields(self):
        pos = make_position()
        v = value_position(pos, quote=None)
        assert v.current_price is None
        assert v.market_value is None
        assert v.unrealized_pl_raw is None
        assert v.unrealized_pl_adjusted is None

    def test_quote_with_no_price_yields_all_none_market_fields(self):
        pos = make_position()
        quote = Quote(ticker="AAPL", price=None, as_of="2026-08-04T12:00:00+00:00",
                      source="IBKR (מושהה ~15 דק')", is_delayed=True)
        v = value_position(pos, quote)
        assert v.market_value is None
        assert v.unrealized_pl_raw is None


class TestValuePositions:
    def test_matches_quotes_by_ticker(self):
        positions = [make_position("AAPL"), make_position("MSFT", shares=100, avg_cost_raw=300.0, avg_cost_adjusted=300.0, premium=0.0)]
        quotes = {"AAPL": make_quote("AAPL", 190.0)}  # no MSFT quote

        results = value_positions(positions, quotes)

        by_ticker = {v.position.ticker: v for v in results}
        assert by_ticker["AAPL"].current_price == 190.0
        assert by_ticker["MSFT"].current_price is None


class TestTotalMarketValue:
    def test_sums_when_all_positions_have_prices(self):
        valuations = [
            value_position(make_position("AAPL"), make_quote("AAPL", 190.0)),
            value_position(make_position("MSFT", shares=100, avg_cost_raw=300.0, avg_cost_adjusted=300.0, premium=0.0), make_quote("MSFT", 310.0)),
        ]
        assert total_market_value(valuations) == pytest.approx(200 * 190.0 + 100 * 310.0)

    def test_none_when_any_position_missing_a_price(self):
        """Partial data should never report a misleadingly-low total."""
        valuations = [
            value_position(make_position("AAPL"), make_quote("AAPL", 190.0)),
            value_position(make_position("MSFT"), None),
        ]
        assert total_market_value(valuations) is None

    def test_none_when_no_positions(self):
        assert total_market_value([]) is None
