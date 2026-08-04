from datetime import date

import pytest

from src.data_providers.ibkr import OptionQuote
from src.screener.fundamental import GeneralResult, QualityResult, ValueResult
from src.screener.liquidity import LiquidityResult
from src.screener.ranking import (
    ScreenCandidate,
    compute_annualized_premium_yield,
    rank_candidates,
    score_iv_rank,
)

TEST_CONFIG = {
    "position_types": {
        "CORE": {"target_delta_min": 0.15, "target_delta_max": 0.22, "strike_min_pct_of_price": 1.07},
        "INCOME": {"target_delta_min": 0.28, "target_delta_max": 0.35, "strike_min_pct_of_price": 1.03},
    },
    "options": {"expiry_days_min": 30, "expiry_days_max": 45},
    "screener": {
        "ranking_weights": {"quality": 0.30, "value": 0.25, "annualized_premium_yield": 0.25, "iv_rank": 0.10, "liquidity": 0.10},
        "iv_rank": {"preferred_min": 30, "preferred_max": 60, "cheap_below": 25},
    },
}

AS_OF = date(2026, 8, 4)
GOOD_EXPIRY = "2026-09-18"  # 45 days out


def quote(strike, delta, bid=2.0, ask=2.2, oi=500):
    return OptionQuote(ticker="X", strike=strike, expiry=GOOD_EXPIRY, bid=bid, ask=ask, last=2.1,
                        delta=delta, open_interest=oi, volume=1000, as_of="2026-08-04T00:00:00+00:00",
                        source="IBKR (מושהה ~15 דק')", is_delayed=True)


def perfect_quality():
    return QualityResult(roic_avg=0.20, net_debt_ebitda=1.0, fcf_positive_years=5,
                          fcf_positive_years_window=5, gross_margin_ok=True, interest_coverage=10,
                          score=90.0, reasons_failed=[])


def perfect_value():
    return ValueResult(fcf_yield=0.08, ev_ebitda=8.0, ev_ebitda_sector_avg=12.0, pe=15.0,
                        pe_5y_median=20.0, score=80.0, reasons_failed=[])


def perfect_general():
    return GeneralResult(market_cap=5e9, price=100.0, sector_pct_of_portfolio=0.1, reasons_failed=[])


def perfect_liquidity():
    return LiquidityResult(open_interest_ok=True, spread_ok=True, expiry_months_ok=True,
                            volume_ok=True, best_open_interest=500, available_expiry_months=4,
                            reasons_failed=[])


def make_candidate(ticker="AAPL", price=100.0, chain=None, iv_rank=None):
    chain = chain if chain is not None else [quote(103, 0.32), quote(108, 0.20), quote(113, 0.10)]
    return ScreenCandidate(
        ticker=ticker, quality=perfect_quality(), value=perfect_value(), general=perfect_general(),
        liquidity=perfect_liquidity(), current_price=price, chain=chain, iv_rank=iv_rank,
    )


class TestComputeAnnualizedPremiumYield:
    def test_basic_calculation(self):
        from src.options.chain_analysis import StrikeSuggestion
        suggestion = StrikeSuggestion(quote=quote(108, 0.30, bid=2.0, ask=2.2), target_delta=0.315,
                                       days_to_expiry=45, crosses_earnings=False)
        # mid = 2.1, premium = 210; capital = 100*100=10000; yield = 210/10000 * 365/45
        result = compute_annualized_premium_yield(suggestion, current_price=100.0)
        assert result == pytest.approx((210.0 / 10000.0) * (365 / 45))

    def test_none_when_no_suggestion(self):
        assert compute_annualized_premium_yield(None, 100.0) is None

    def test_none_when_no_current_price(self):
        from src.options.chain_analysis import StrikeSuggestion
        suggestion = StrikeSuggestion(quote=quote(108, 0.30), target_delta=0.315, days_to_expiry=45, crosses_earnings=False)
        assert compute_annualized_premium_yield(suggestion, None) is None


class TestScoreIvRank:
    def test_full_score_in_preferred_range(self):
        assert score_iv_rank(45, TEST_CONFIG) == 100.0

    def test_penalized_when_too_cheap(self):
        assert score_iv_rank(10, TEST_CONFIG) == 20.0

    def test_ramps_up_between_cheap_and_preferred(self):
        low = score_iv_rank(26, TEST_CONFIG)
        high = score_iv_rank(29, TEST_CONFIG)
        assert 20.0 < low < high < 100.0

    def test_decays_above_preferred_max(self):
        score = score_iv_rank(80, TEST_CONFIG)
        assert 50.0 <= score < 100.0

    def test_none_when_unknown(self):
        assert score_iv_rank(None, TEST_CONFIG) is None


class TestRankCandidates:
    def test_orders_by_final_score_descending(self):
        strong = make_candidate("STRONG")
        weak_quality = QualityResult(roic_avg=0.01, net_debt_ebitda=5.0, fcf_positive_years=1,
                                      fcf_positive_years_window=5, gross_margin_ok=False,
                                      interest_coverage=1.0, score=5.0, reasons_failed=["ROIC too low"])
        weak = ScreenCandidate(ticker="WEAK", quality=weak_quality, value=perfect_value(),
                                general=perfect_general(), liquidity=perfect_liquidity(),
                                current_price=100.0, chain=[quote(108, 0.30)])
        ranked = rank_candidates([weak, strong], TEST_CONFIG)
        assert [r.candidate.ticker for r in ranked] == ["STRONG", "WEAK"]

    def test_produces_core_and_income_suggestions(self):
        candidate = make_candidate()
        ranked = rank_candidates([candidate], TEST_CONFIG)[0]
        assert ranked.core_suggestion is not None
        assert ranked.income_suggestion is not None
        assert ranked.core_suggestion.quote.delta < ranked.income_suggestion.quote.delta

    def test_single_candidate_gets_no_premium_yield_score(self):
        """Percentile scoring needs >=2 candidates to be meaningful."""
        ranked = rank_candidates([make_candidate()], TEST_CONFIG)[0]
        assert ranked.premium_yield_score is None
        assert ranked.premium_yield is not None  # raw yield is still computed

    def test_two_candidates_get_percentile_scored(self):
        higher_yield = make_candidate("HI", chain=[quote(103, 0.32, bid=5.0, ask=5.2)])
        lower_yield = make_candidate("LO", chain=[quote(103, 0.32, bid=0.5, ask=0.6)])
        ranked = rank_candidates([higher_yield, lower_yield], TEST_CONFIG)
        by_ticker = {r.candidate.ticker: r for r in ranked}
        assert by_ticker["HI"].premium_yield_score == 100.0
        assert by_ticker["LO"].premium_yield_score < 100.0

    def test_passes_fundamental_and_liquidity_flags(self):
        ranked = rank_candidates([make_candidate()], TEST_CONFIG)[0]
        assert ranked.passes_fundamental_screen is True
        assert ranked.passes_liquidity_screen is True
        assert ranked.options_eligible_only_for_holding is False

    def test_holding_only_flag_when_liquidity_fails_but_fundamentals_pass(self):
        bad_liquidity = LiquidityResult(open_interest_ok=False, spread_ok=None, expiry_months_ok=None,
                                         volume_ok=None, best_open_interest=10, available_expiry_months=None,
                                         reasons_failed=["OI too low"])
        candidate = ScreenCandidate(ticker="ILLIQUID", quality=perfect_quality(), value=perfect_value(),
                                     general=perfect_general(), liquidity=bad_liquidity,
                                     current_price=100.0, chain=[quote(108, 0.30)])
        ranked = rank_candidates([candidate], TEST_CONFIG)[0]
        assert ranked.options_eligible_only_for_holding is True

    def test_missing_current_price_yields_no_suggestions(self):
        candidate = ScreenCandidate(ticker="NOPRICE", quality=perfect_quality(), value=perfect_value(),
                                     general=perfect_general(), liquidity=perfect_liquidity(),
                                     current_price=None, chain=[quote(108, 0.30)])
        ranked = rank_candidates([candidate], TEST_CONFIG)[0]
        assert ranked.core_suggestion is None
        assert ranked.income_suggestion is None
