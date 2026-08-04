from datetime import date

import pytest

from src.data_providers.ibkr import OptionQuote
from src.options.chain_analysis import (
    min_allowed_strike,
    monthly_expiries_in_range,
    select_strike,
    third_friday,
)

TEST_CONFIG = {
    "position_types": {
        "CORE": {
            "target_delta_min": 0.15, "target_delta_max": 0.22,
            "strike_min_pct_of_price": 1.07, "require_above_cost_basis": True,
        },
        "INCOME": {
            "target_delta_min": 0.28, "target_delta_max": 0.35,
            "strike_min_pct_of_price": 1.03, "require_above_cost_basis": False,
        },
    },
    "options": {"expiry_days_min": 30, "expiry_days_max": 45},
}


def quote(strike, expiry, delta, bid=1.0, ask=1.2):
    return OptionQuote(ticker="AAPL", strike=strike, expiry=expiry, bid=bid, ask=ask, last=1.1,
                        delta=delta, open_interest=500, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                        source="IBKR (מושהה ~15 דק')", is_delayed=True)


class TestThirdFriday:
    def test_known_month(self):
        # March 2026: 1st is a Sunday -> first Friday is the 6th -> third Friday is the 20th
        assert third_friday(2026, 3) == date(2026, 3, 20)

    def test_is_always_a_friday(self):
        for month in range(1, 13):
            assert third_friday(2026, month).weekday() == 4


class TestMonthlyExpiriesInRange:
    def test_finds_expiry_in_30_45_day_window(self):
        as_of = date(2026, 8, 4)
        expiries = monthly_expiries_in_range(30, 45, as_of=as_of)
        assert len(expiries) >= 1
        for e in expiries:
            assert 30 <= (e - as_of).days <= 45


class TestMinAllowedStrike:
    def test_uses_pct_floor_when_no_cost_basis(self):
        floor = min_allowed_strike("INCOME", 100.0, None, TEST_CONFIG)
        assert floor == pytest.approx(103.0)

    def test_cost_basis_overrides_pct_floor_when_higher(self):
        floor = min_allowed_strike("INCOME", 100.0, avg_cost_adjusted=110.0, config=TEST_CONFIG)
        assert floor == pytest.approx(110.0)

    def test_pct_floor_wins_when_cost_basis_is_lower(self):
        floor = min_allowed_strike("CORE", 100.0, avg_cost_adjusted=90.0, config=TEST_CONFIG)
        assert floor == pytest.approx(107.0)


class TestSelectStrike:
    AS_OF = date(2026, 8, 4)
    GOOD_EXPIRY = "2026-09-18"  # 45 days out from AS_OF

    def test_picks_quote_closest_to_target_delta(self):
        chain = [
            quote(105, self.GOOD_EXPIRY, delta=0.40),
            quote(110, self.GOOD_EXPIRY, delta=0.30),  # INCOME target = (0.28+0.35)/2 = 0.315
            quote(115, self.GOOD_EXPIRY, delta=0.20),
        ]
        result = select_strike(chain, "INCOME", current_price=100.0, avg_cost_adjusted=None,
                                config=TEST_CONFIG, as_of=self.AS_OF)
        assert result is not None
        assert result.quote.strike == 110

    def test_never_suggests_below_cost_basis(self):
        chain = [
            quote(105, self.GOOD_EXPIRY, delta=0.32),  # below cost basis, must be excluded
            quote(120, self.GOOD_EXPIRY, delta=0.20),
        ]
        result = select_strike(chain, "INCOME", current_price=100.0, avg_cost_adjusted=115.0,
                                config=TEST_CONFIG, as_of=self.AS_OF)
        assert result is not None
        assert result.quote.strike == 120

    def test_excludes_expiries_outside_window(self):
        chain = [quote(110, "2026-08-10", delta=0.30)]  # 6 days out, too soon
        result = select_strike(chain, "INCOME", current_price=100.0, avg_cost_adjusted=None,
                                config=TEST_CONFIG, as_of=self.AS_OF)
        assert result is None

    def test_returns_none_when_no_candidates(self):
        result = select_strike([], "CORE", current_price=100.0, avg_cost_adjusted=None,
                                config=TEST_CONFIG, as_of=self.AS_OF)
        assert result is None

    def test_flags_earnings_crossing_expiry(self):
        chain = [quote(110, self.GOOD_EXPIRY, delta=0.30)]
        earnings = date(2026, 9, 1)  # inside [as_of, expiry]
        result = select_strike(chain, "INCOME", current_price=100.0, avg_cost_adjusted=None,
                                config=TEST_CONFIG, earnings_date=earnings, as_of=self.AS_OF)
        assert result.crosses_earnings is True

    def test_no_earnings_flag_when_date_is_after_expiry(self):
        chain = [quote(110, self.GOOD_EXPIRY, delta=0.30)]
        earnings = date(2026, 12, 1)  # after expiry
        result = select_strike(chain, "INCOME", current_price=100.0, avg_cost_adjusted=None,
                                config=TEST_CONFIG, earnings_date=earnings, as_of=self.AS_OF)
        assert result.crosses_earnings is False
