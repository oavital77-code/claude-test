import pytest

from src.data_providers.ibkr import OptionQuote
from src.screener.liquidity import count_available_expiry_months, evaluate_liquidity, spread_ok

TEST_CONFIG = {
    "screener": {
        "liquidity": {
            "open_interest_min": 200,
            "bid_ask_spread_max_pct_of_mid": 0.05,
            "bid_ask_spread_max_abs_usd": 0.10,
            "min_months_of_expiries_available": 3,
            "avg_daily_volume_min_shares": 500_000,
        }
    }
}


def quote(strike=100.0, expiry="2026-09-18", bid=1.0, ask=1.05, oi=500):
    return OptionQuote(ticker="AAPL", strike=strike, expiry=expiry, bid=bid, ask=ask, last=1.02,
                        delta=0.3, open_interest=oi, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                        source="IBKR (מושהה ~15 דק')", is_delayed=True)


class TestSpreadOk:
    def test_passes_within_pct_threshold(self):
        q = quote(bid=1.00, ask=1.03)  # spread 0.03, mid 1.015 -> 2.96% < 5%
        assert spread_ok(q, max_pct_of_mid=0.05, max_abs_usd=0.10) is True

    def test_passes_within_abs_threshold_even_if_pct_fails(self):
        q = quote(bid=1.00, ask=1.08)  # spread 0.08 <= 0.10 abs, even if % is high on a cheap option
        assert spread_ok(q, max_pct_of_mid=0.05, max_abs_usd=0.10) is True

    def test_fails_both_thresholds(self):
        q = quote(bid=1.00, ask=1.50)  # spread 0.50
        assert spread_ok(q, max_pct_of_mid=0.05, max_abs_usd=0.10) is False

    def test_none_when_no_bid_ask(self):
        q = quote(bid=None, ask=None)
        assert spread_ok(q, 0.05, 0.10) is None


class TestCountAvailableExpiryMonths:
    def test_counts_distinct_months(self):
        expiries = ["2026-08-21", "2026-09-18", "2026-09-25", "2026-10-16"]
        assert count_available_expiry_months(expiries) == 3

    def test_empty_list(self):
        assert count_available_expiry_months([]) == 0


class TestEvaluateLiquidity:
    def test_passes_when_all_checks_clear(self):
        chain = [quote(oi=500, bid=1.00, ask=1.03)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=1_000_000, config=TEST_CONFIG)
        assert result.passed
        assert result.score == 100.0

    def test_fails_on_low_open_interest(self):
        chain = [quote(oi=50, bid=1.00, ask=1.03)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=1_000_000, config=TEST_CONFIG)
        assert not result.passed
        assert any("Open Interest" in r for r in result.reasons_failed)

    def test_fails_when_no_strike_has_tight_spread(self):
        chain = [quote(oi=500, bid=1.00, ask=2.00), quote(oi=500, bid=5.00, ask=6.00)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=1_000_000, config=TEST_CONFIG)
        assert not result.passed
        assert any("spread" in r for r in result.reasons_failed)

    def test_passes_spread_check_if_at_least_one_strike_is_tight(self):
        chain = [quote(strike=100, oi=500, bid=1.00, ask=2.00), quote(strike=105, oi=500, bid=1.00, ask=1.03)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=1_000_000, config=TEST_CONFIG)
        assert result.spread_ok is True

    def test_fails_on_too_few_expiry_months(self):
        chain = [quote(oi=500)]
        expiries = ["2026-08-21", "2026-08-28"]  # both August, 1 month
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=1_000_000, config=TEST_CONFIG)
        assert not result.passed
        assert any("חודשי תפוגה" in r for r in result.reasons_failed)

    def test_fails_on_low_volume(self):
        chain = [quote(oi=500)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=10_000, config=TEST_CONFIG)
        assert not result.passed
        assert any("נפח יומי" in r for r in result.reasons_failed)

    def test_missing_volume_data_does_not_fail_the_gate(self):
        chain = [quote(oi=500)]
        expiries = ["2026-08-21", "2026-09-18", "2026-10-16"]
        result = evaluate_liquidity(chain, expiries, avg_daily_volume=None, config=TEST_CONFIG)
        assert result.passed
        assert result.volume_ok is None

    def test_empty_chain_and_expiries_yields_unknown_not_failed(self):
        result = evaluate_liquidity([], [], avg_daily_volume=None, config=TEST_CONFIG)
        assert result.passed
        assert result.score == 0.0
