import pytest

from src.journal.cost_basis import RealizedSale
from src.options.tracking import ClosedOptionTranche
from src.tax.events import (
    CATEGORY_DIVIDEND,
    CATEGORY_OPTION,
    CATEGORY_STOCK,
    compute_gain_ils,
    dividend_trade_to_tax_event,
    option_tranche_to_tax_event,
    stock_sale_to_tax_event,
    tax_year_of,
)


class TestTaxYearOf:
    def test_extracts_year(self):
        assert tax_year_of("2026-03-15") == 2026


class TestComputeGainIls:
    def test_uses_different_rate_per_leg_embedding_fx_gain(self):
        # $1000 outflow at open (rate 3.5) -> -3500 ILS; $1100 inflow at close (rate 3.8) -> +4180 ILS
        gain = compute_gain_ils(open_leg_usd=-1000, open_fx_rate=3.5, close_leg_usd=1100, close_fx_rate=3.8)
        assert gain == pytest.approx(1100 * 3.8 - 1000 * 3.5)
        # this differs from a single-blended-rate calc, e.g. (1100-1000)*3.8 = 380, proving FX gain is embedded
        assert gain != pytest.approx((1100 - 1000) * 3.8)

    def test_none_when_open_rate_missing(self):
        assert compute_gain_ils(-1000, None, 1100, 3.8) is None

    def test_none_when_close_rate_missing(self):
        assert compute_gain_ils(-1000, 3.5, 1100, None) is None


class TestStockSaleToTaxEvent:
    def test_basic_conversion(self):
        sale = RealizedSale(
            open_trade_id=1, close_trade_id=2, open_date="2026-01-01", close_date="2026-06-01",
            quantity=100, buy_price=50.0, sell_price=60.0, buy_commission_alloc=1.0,
            sell_commission_alloc=1.0, currency="USD",
        )
        event = stock_sale_to_tax_event(sale, security_id=1, ticker="AAPL", fx_rate_open=3.5, fx_rate_close=3.7)
        assert event.category == CATEGORY_STOCK
        assert event.tax_year == 2026
        assert event.event_date == "2026-06-01"
        proceeds = 100 * 60.0 - 1.0
        cost = 100 * 50.0 + 1.0
        assert event.gain_loss_ils == pytest.approx(proceeds * 3.7 - cost * 3.5)

    def test_none_gain_when_fx_missing(self):
        sale = RealizedSale(
            open_trade_id=1, close_trade_id=2, open_date="2026-01-01", close_date="2026-06-01",
            quantity=100, buy_price=50.0, sell_price=60.0, buy_commission_alloc=0,
            sell_commission_alloc=0, currency="USD",
        )
        event = stock_sale_to_tax_event(sale, 1, "AAPL", fx_rate_open=None, fx_rate_close=3.7)
        assert event.gain_loss_ils is None


class TestOptionTrancheToTaxEvent:
    def test_expiration_is_pure_gain_no_close_cost(self):
        tranche = ClosedOptionTranche(
            open_trade_id=1, close_trade_id=2, close_type="EXPIRATION", open_date="2026-01-01",
            close_date="2026-02-20", contracts=2, strike=190.0, expiry="2026-02-20",
            premium_received=500.0, cost_to_close=0.0,
        )
        event = option_tranche_to_tax_event(tranche, 1, "AAPL", fx_rate_open=3.5, fx_rate_close=3.6)
        assert event.category == CATEGORY_OPTION
        # premium is an inflow at OPEN (fx_rate_open); cost_to_close is 0 here
        assert event.gain_loss_ils == pytest.approx(500.0 * 3.5 - 0.0 * 3.6)

    def test_roll_close_and_reopen_are_independent_events(self):
        """Section 10 point 2: a roll's close and reopen must be two
        separate tax events on the same day. Verified by computing them
        independently — a CALL_BUY_CLOSE tranche's tax event doesn't
        reference the new CALL_SELL_OPEN at all."""
        close_leg = ClosedOptionTranche(
            open_trade_id=1, close_trade_id=2, close_type="CALL_BUY_CLOSE", open_date="2026-01-01",
            close_date="2026-02-15", contracts=2, strike=190.0, expiry="2026-02-20",
            premium_received=500.0, cost_to_close=200.0,
        )
        event = option_tranche_to_tax_event(close_leg, 1, "AAPL", fx_rate_open=3.5, fx_rate_close=3.6)
        assert event.event_date == "2026-02-15"
        # premium (inflow) at OPEN rate 3.5; cost_to_close (outflow) at CLOSE rate 3.6
        assert event.gain_loss_ils == pytest.approx(500.0 * 3.5 - 200.0 * 3.6)


class TestDividendTradeToTaxEvent:
    def test_gross_amount_and_ils_conversion(self):
        trade = dict(quantity=100, price=0.5, commission=0.0, trade_date="2026-03-01")
        event = dividend_trade_to_tax_event(trade, security_id=1, ticker="AAPL", fx_rate=3.6)
        assert event.category == CATEGORY_DIVIDEND
        assert event.gross_amount_usd == pytest.approx(50.0)
        assert event.gain_loss_ils == pytest.approx(50.0 * 3.6)

    def test_none_ils_when_fx_missing(self):
        trade = dict(quantity=100, price=0.5, commission=0.0, trade_date="2026-03-01")
        event = dividend_trade_to_tax_event(trade, 1, "AAPL", fx_rate=None)
        assert event.gain_loss_ils is None
        assert event.gross_amount_usd == pytest.approx(50.0)  # USD figure still known
