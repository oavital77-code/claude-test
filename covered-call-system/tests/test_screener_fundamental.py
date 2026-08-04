import pytest

from src.screener.fundamental import (
    compute_fcf_positive_years,
    compute_interest_coverage,
    compute_net_debt_to_ebitda,
    compute_roic_series,
    evaluate_general,
    evaluate_quality,
    evaluate_value,
    is_gross_margin_stable_or_rising,
)

TEST_CONFIG = {
    "portfolio": {"max_sector_concentration_pct": 0.25},
    "screener": {
        "fundamental": {
            "quality": {
                "roic_min_pct": 0.12, "roic_avg_years": 3, "net_debt_ebitda_max": 2.5,
                "fcf_positive_years_required": 4, "fcf_positive_years_window": 5,
                "gross_margin_trend_years": 3, "interest_coverage_min": 5,
            },
            "value": {"fcf_yield_min_pct": 0.05},
            "general": {"market_cap_min_usd": 2_000_000_000, "price_min_usd": 25, "price_max_usd": 130},
        }
    },
}


class TestComputeRoicSeries:
    def test_computes_nopat_over_invested_capital(self):
        series = compute_roic_series(
            ebit_series=[("2023", 100.0)],
            pretax_income_series=[("2023", 90.0)],
            tax_provision_series=[("2023", 18.0)],  # 20% effective tax rate
            total_debt_series=[("2023", 200.0)],
            equity_series=[("2023", 400.0)],
            cash_series=[("2023", 100.0)],
        )
        # NOPAT = 100 * (1 - 0.2) = 80; invested capital = 200+400-100 = 500
        assert series == [("2023", pytest.approx(80.0 / 500.0))]

    def test_skips_years_missing_any_input(self):
        series = compute_roic_series(
            ebit_series=[("2023", 100.0)],
            pretax_income_series=[],  # missing
            tax_provision_series=[("2023", 18.0)],
            total_debt_series=[("2023", 200.0)],
            equity_series=[("2023", 400.0)],
            cash_series=[("2023", 100.0)],
        )
        assert series == []


class TestNetDebtToEbitda:
    def test_basic(self):
        assert compute_net_debt_to_ebitda(total_debt=500, cash=100, ebitda=200) == pytest.approx(2.0)

    def test_none_when_ebitda_zero(self):
        assert compute_net_debt_to_ebitda(500, 100, 0) is None


class TestFcfPositiveYears:
    def test_counts_positive_years_within_window(self):
        series = [("2020", 10), ("2021", -5), ("2022", 3), ("2023", 8), ("2024", -1)]
        assert compute_fcf_positive_years(series, window=5) == 3

    def test_none_when_no_data(self):
        assert compute_fcf_positive_years([], window=5) is None


class TestGrossMarginTrend:
    def test_rising_is_ok(self):
        series = [("2022", 0.30), ("2023", 0.32), ("2024", 0.35)]
        assert is_gross_margin_stable_or_rising(series, years=3) is True

    def test_declining_is_not_ok(self):
        series = [("2022", 0.40), ("2023", 0.35), ("2024", 0.30)]
        assert is_gross_margin_stable_or_rising(series, years=3) is False

    def test_none_when_insufficient_data(self):
        assert is_gross_margin_stable_or_rising([("2024", 0.30)], years=3) is None


class TestInterestCoverage:
    def test_basic(self):
        assert compute_interest_coverage(ebit=500, interest_expense=100) == pytest.approx(5.0)

    def test_none_when_no_interest_expense(self):
        assert compute_interest_coverage(500, 0) is None


class TestEvaluateQuality:
    def _good_inputs(self):
        return dict(
            roic_series=[("2022", 0.15), ("2023", 0.16), ("2024", 0.14)],
            net_debt=100, cash=50, ebitda=100,  # net_debt_ebitda = 0.5
            fcf_series=[("2020", 10), ("2021", 10), ("2022", 10), ("2023", 10), ("2024", 10)],
            gross_margin_series=[("2022", 0.30), ("2023", 0.32), ("2024", 0.34)],
            ebit_latest=500, interest_expense_latest=50,  # coverage = 10
        )

    def test_passes_when_all_metrics_clear_thresholds(self):
        result = evaluate_quality(**self._good_inputs(), config=TEST_CONFIG)
        assert result.passed
        assert result.score > 50

    def test_fails_on_low_roic(self):
        inputs = self._good_inputs()
        inputs["roic_series"] = [("2022", 0.05), ("2023", 0.05), ("2024", 0.05)]
        result = evaluate_quality(**inputs, config=TEST_CONFIG)
        assert not result.passed
        assert any("ROIC" in r for r in result.reasons_failed)

    def test_fails_on_high_net_debt_ebitda(self):
        inputs = self._good_inputs()
        inputs["net_debt"] = 1000
        result = evaluate_quality(**inputs, config=TEST_CONFIG)
        assert not result.passed
        assert any("Net Debt" in r for r in result.reasons_failed)

    def test_missing_data_does_not_fail_the_gate(self):
        """Section 0: this is a decision aid, not a hard oracle — unknown != failed."""
        result = evaluate_quality(
            roic_series=[], net_debt=0, cash=0, ebitda=0, fcf_series=[],
            gross_margin_series=[], ebit_latest=0, interest_expense_latest=0,
            config=TEST_CONFIG,
        )
        assert result.passed
        assert result.score == 0.0


class TestEvaluateValue:
    def test_passes_with_good_fcf_yield_and_below_median_pe(self):
        result = evaluate_value(
            fcf=100, market_cap=1000, ev_ebitda=8.0, ev_ebitda_sector_avg=12.0,
            pe=15.0, historical_pe_series=[("2020", 20), ("2021", 22), ("2022", 18), ("2023", 25), ("2024", 19)],
            config=TEST_CONFIG,
        )
        assert result.passed
        assert result.pe_5y_median == pytest.approx(20.0)

    def test_fails_on_low_fcf_yield(self):
        result = evaluate_value(
            fcf=10, market_cap=1000, ev_ebitda=None, ev_ebitda_sector_avg=None,
            pe=None, historical_pe_series=[], config=TEST_CONFIG,
        )
        assert not result.passed
        assert any("FCF Yield" in r for r in result.reasons_failed)

    def test_fails_on_pe_above_own_5y_median(self):
        result = evaluate_value(
            fcf=100, market_cap=1000, ev_ebitda=None, ev_ebitda_sector_avg=None,
            pe=30.0, historical_pe_series=[("2020", 20), ("2021", 20)],
            config=TEST_CONFIG,
        )
        assert not result.passed
        assert any("P/E" in r for r in result.reasons_failed)

    def test_ev_ebitda_check_skipped_without_sector_avg(self):
        """No sector-avg data source is wired yet (ASSUMPTIONS.md) — must not fail spuriously."""
        result = evaluate_value(
            fcf=100, market_cap=1000, ev_ebitda=50.0, ev_ebitda_sector_avg=None,
            pe=None, historical_pe_series=[], config=TEST_CONFIG,
        )
        assert result.passed


class TestEvaluateGeneral:
    def test_passes_within_all_bounds(self):
        result = evaluate_general(market_cap=5_000_000_000, price=80.0, sector_pct_of_portfolio=0.1, config=TEST_CONFIG)
        assert result.passed

    def test_fails_below_market_cap_floor(self):
        result = evaluate_general(market_cap=500_000_000, price=80.0, sector_pct_of_portfolio=0.1, config=TEST_CONFIG)
        assert not result.passed

    def test_fails_outside_price_range(self):
        result = evaluate_general(market_cap=5_000_000_000, price=200.0, sector_pct_of_portfolio=0.1, config=TEST_CONFIG)
        assert not result.passed

    def test_fails_when_sector_concentration_at_cap(self):
        result = evaluate_general(market_cap=5_000_000_000, price=80.0, sector_pct_of_portfolio=0.25, config=TEST_CONFIG)
        assert not result.passed
