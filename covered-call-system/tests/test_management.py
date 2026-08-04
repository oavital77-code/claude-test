from datetime import date

import pytest

from src.data_providers.ibkr import OptionQuote
from src.db.models import Position
from src.options.management import (
    EX_DIVIDEND,
    PROFIT_TAKE,
    ROLL,
    STRIKE_CROSS,
    evaluate_alerts,
    generate_roll_alternatives,
)
from src.options.tracking import OpenOptionLot

TEST_CONFIG = {
    "position_types": {
        "CORE": {"target_delta_min": 0.15, "target_delta_max": 0.22, "strike_min_pct_of_price": 1.07},
        "INCOME": {"target_delta_min": 0.28, "target_delta_max": 0.35, "strike_min_pct_of_price": 1.03},
    },
    "options": {"expiry_days_min": 30, "expiry_days_max": 45},
    "management_alerts": {
        "profit_take_pct_of_premium_captured": 0.50,
        "roll_days_to_expiry_threshold": 21,
        "roll_alternatives_count": 3,
        "ex_dividend_alert_days": 5,
        "strike_cross_alert": True,
    },
}

AS_OF = date(2026, 8, 4)


def make_lot(strike=110.0, expiry="2026-09-01", contracts=2, premium_per_contract=2.5, commission=0.0):
    return OpenOptionLot(trade_id=1, open_date="2026-07-01", contracts=contracts, strike=strike,
                          expiry=expiry, premium_per_contract=premium_per_contract,
                          commission_per_contract=commission, currency="USD")


def make_position(position_type="INCOME", avg_cost_adjusted=100.0):
    return Position(security_id=1, ticker="AAPL", shares_held=200, position_type=position_type,
                     avg_cost_raw=105.0, avg_cost_adjusted=avg_cost_adjusted,
                     total_premium_collected=500.0, opened_date="2026-01-10")


def quote(strike, expiry, delta, bid=1.0, ask=1.2):
    return OptionQuote(ticker="AAPL", strike=strike, expiry=expiry, bid=bid, ask=ask, last=1.1,
                        delta=delta, open_interest=500, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                        source="IBKR (מושהה ~15 דק')", is_delayed=True)


class TestProfitTakeAlert:
    def test_fires_when_pct_captured_crosses_threshold(self):
        lot = make_lot(expiry="2026-09-30")  # far from expiry, isolate this rule
        # premium_received = 2*2.5*100 = 500; current value at 1.0/contract = 200 -> pct = 60%
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=1.0,
                                  config=TEST_CONFIG, as_of=AS_OF)
        rules = [a.rule for a in alerts]
        assert PROFIT_TAKE in rules

    def test_silent_when_below_threshold(self):
        lot = make_lot(expiry="2026-09-30")
        # current value at 2.0/contract -> pct = (500-400)/500 = 20%, below 50%
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=2.0,
                                  config=TEST_CONFIG, as_of=AS_OF)
        rules = [a.rule for a in alerts]
        assert PROFIT_TAKE not in rules

    def test_silent_when_no_option_price_available(self):
        lot = make_lot(expiry="2026-09-30")
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, as_of=AS_OF)
        assert PROFIT_TAKE not in [a.rule for a in alerts]


class TestRollAlert:
    def test_fires_within_threshold(self):
        lot = make_lot(expiry="2026-08-20")  # 16 days from AS_OF
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, as_of=AS_OF)
        assert ROLL in [a.rule for a in alerts]

    def test_silent_when_plenty_of_time(self):
        lot = make_lot(expiry="2026-10-01")  # far out
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, as_of=AS_OF)
        assert ROLL not in [a.rule for a in alerts]


class TestExDividendAlert:
    def test_fires_within_window(self):
        lot = make_lot(expiry="2026-09-30", strike=110.0)
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, next_ex_dividend_date=date(2026, 8, 7), as_of=AS_OF)
        ex_alerts = [a for a in alerts if a.rule == EX_DIVIDEND]
        assert len(ex_alerts) == 1
        assert "ITM" not in ex_alerts[0].message  # stock 105 < strike 110, not ITM

    def test_flags_itm_when_price_above_strike(self):
        lot = make_lot(expiry="2026-09-30", strike=100.0)
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, next_ex_dividend_date=date(2026, 8, 7), as_of=AS_OF)
        ex_alerts = [a for a in alerts if a.rule == EX_DIVIDEND]
        assert "ITM" in ex_alerts[0].message

    def test_silent_outside_window(self):
        lot = make_lot(expiry="2026-09-30")
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, next_ex_dividend_date=date(2026, 9, 1), as_of=AS_OF)
        assert EX_DIVIDEND not in [a.rule for a in alerts]

    def test_silent_when_no_dividend_date_known(self):
        lot = make_lot(expiry="2026-09-30")
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, next_ex_dividend_date=None, as_of=AS_OF)
        assert EX_DIVIDEND not in [a.rule for a in alerts]


class TestStrikeCrossAlert:
    def test_fires_when_price_above_strike(self):
        lot = make_lot(expiry="2026-09-30", strike=100.0)
        alerts = evaluate_alerts(lot, make_position(position_type="CORE"), stock_price=105.0,
                                  option_current_price=None, config=TEST_CONFIG, as_of=AS_OF)
        cross_alerts = [a for a in alerts if a.rule == STRIKE_CROSS]
        assert len(cross_alerts) == 1
        assert "CORE" in cross_alerts[0].message

    def test_income_position_gets_different_policy_text(self):
        lot = make_lot(expiry="2026-09-30", strike=100.0)
        alerts = evaluate_alerts(lot, make_position(position_type="INCOME"), stock_price=105.0,
                                  option_current_price=None, config=TEST_CONFIG, as_of=AS_OF)
        cross_alerts = [a for a in alerts if a.rule == STRIKE_CROSS]
        assert "INCOME" in cross_alerts[0].message

    def test_silent_when_price_below_strike(self):
        lot = make_lot(expiry="2026-09-30", strike=110.0)
        alerts = evaluate_alerts(lot, make_position(), stock_price=105.0, option_current_price=None,
                                  config=TEST_CONFIG, as_of=AS_OF)
        assert STRIKE_CROSS not in [a.rule for a in alerts]


class TestRollAlternatives:
    GOOD_EXPIRY = "2026-09-18"  # 45 days from AS_OF

    def test_excludes_the_current_contract(self):
        lot = make_lot(strike=110.0, expiry=self.GOOD_EXPIRY, contracts=2)
        chain = [
            quote(110.0, self.GOOD_EXPIRY, delta=0.31),  # same as current lot -> excluded
            quote(115.0, self.GOOD_EXPIRY, delta=0.28),
        ]
        alts = generate_roll_alternatives(lot, chain, make_position(avg_cost_adjusted=100.0),
                                           current_stock_price=105.0, current_option_price=1.0,
                                           config=TEST_CONFIG, as_of=AS_OF)
        assert all(a.quote.strike != 110.0 for a in alts)

    def test_respects_cost_basis_floor(self):
        lot = make_lot(strike=110.0, expiry=self.GOOD_EXPIRY, contracts=2)
        chain = [
            quote(102.0, self.GOOD_EXPIRY, delta=0.40),  # below avg_cost_adjusted=105 -> excluded
            quote(108.0, self.GOOD_EXPIRY, delta=0.32),
        ]
        alts = generate_roll_alternatives(lot, chain, make_position(avg_cost_adjusted=105.0),
                                           current_stock_price=100.0, current_option_price=1.0,
                                           config=TEST_CONFIG, as_of=AS_OF)
        assert all(a.quote.strike >= 105.0 for a in alts)
        assert all(a.above_cost_basis for a in alts)

    def test_net_credit_debit_computed_against_current_lot_close_cost(self):
        lot = make_lot(strike=110.0, expiry=self.GOOD_EXPIRY, contracts=1)
        chain = [quote(115.0, self.GOOD_EXPIRY, delta=0.30, bid=2.0, ask=2.2)]
        alts = generate_roll_alternatives(lot, chain, make_position(avg_cost_adjusted=100.0),
                                           current_stock_price=105.0, current_option_price=0.5,
                                           config=TEST_CONFIG, as_of=AS_OF)
        assert len(alts) == 1
        # new premium = 1 * mid(2.1) * 100 = 210; cost to close current = 1 * 0.5 * 100 = 50
        assert alts[0].net_credit_debit == pytest.approx(210.0 - 50.0)

    def test_returns_at_most_configured_count(self):
        lot = make_lot(strike=90.0, expiry=self.GOOD_EXPIRY, contracts=1)
        chain = [quote(s, self.GOOD_EXPIRY, delta=0.30 + i * 0.01) for i, s in enumerate([100, 105, 110, 115, 120])]
        alts = generate_roll_alternatives(lot, chain, make_position(avg_cost_adjusted=80.0),
                                           current_stock_price=95.0, current_option_price=0.5,
                                           config=TEST_CONFIG, as_of=AS_OF)
        assert len(alts) == TEST_CONFIG["management_alerts"]["roll_alternatives_count"]
