import os

import pytest

from src.tax.events import TaxEvent
from src.tax.report import build_annual_report, export_to_excel, report_to_rows

TEST_CONFIG = {"tax": {"capital_gains_rate_pct": 0.25, "dividend_tax_rate_pct": 0.25}}


def stock_event(ticker="AAPL", date="2026-03-01", gain=1000.0):
    return TaxEvent(security_id=1, ticker=ticker, event_date=date, category="STOCK",
                     gain_loss_ils=gain, tax_year=int(date[:4]), fx_rate_open=3.5, fx_rate_close=3.6)


def option_event(ticker="AAPL", date="2026-04-01", gain=500.0):
    return TaxEvent(security_id=1, ticker=ticker, event_date=date, category="OPTION",
                     gain_loss_ils=gain, tax_year=int(date[:4]), fx_rate_open=3.5, fx_rate_close=3.6)


def dividend_event(ticker="AAPL", date="2026-05-01", gross=200.0):
    return TaxEvent(security_id=1, ticker=ticker, event_date=date, category="DIVIDEND",
                     gain_loss_ils=gross, tax_year=int(date[:4]), fx_rate_open=None, fx_rate_close=3.6,
                     gross_amount_usd=gross / 3.6)


class TestBuildAnnualReport:
    def test_sums_each_category_and_filters_by_year(self):
        events = [stock_event(gain=1000), option_event(gain=500), dividend_event(gross=200),
                  stock_event(date="2025-12-01", gain=99999)]  # different year, must be excluded
        report = build_annual_report(events, tax_year=2026, config=TEST_CONFIG)
        assert report.stock_gain_ils == pytest.approx(1000)
        assert report.option_gain_ils == pytest.approx(500)
        assert report.dividend_gross_ils == pytest.approx(200)
        assert len(report.events) == 3

    def test_estimated_tax_is_flat_rate_on_gains_and_dividends(self):
        events = [stock_event(gain=1000), option_event(gain=500), dividend_event(gross=200)]
        report = build_annual_report(events, tax_year=2026, config=TEST_CONFIG)
        # capital gains tax = (1000+500)*0.25 = 375; dividend tax = 200*0.25 = 50
        assert report.estimated_tax_ils == pytest.approx(375 + 50)

    def test_net_loss_does_not_produce_negative_tax(self):
        events = [stock_event(gain=-1000), option_event(gain=-500), dividend_event(gross=0)]
        report = build_annual_report(events, tax_year=2026, config=TEST_CONFIG)
        assert report.estimated_tax_ils == pytest.approx(0.0)

    def test_missing_fx_excludes_category_total_and_estimated_tax(self):
        events = [
            stock_event(gain=1000),
            TaxEvent(security_id=1, ticker="MSFT", event_date="2026-06-01", category="STOCK",
                     gain_loss_ils=None, tax_year=2026, fx_rate_open=None, fx_rate_close=3.6),
            option_event(gain=500), dividend_event(gross=200),
        ]
        report = build_annual_report(events, tax_year=2026, config=TEST_CONFIG)
        assert report.stock_gain_ils is None
        assert report.events_missing_fx == 1
        assert report.estimated_tax_ils is None  # can't estimate with an unknown component

    def test_empty_year_yields_zero_totals_not_none(self):
        report = build_annual_report([], tax_year=2026, config=TEST_CONFIG)
        assert report.stock_gain_ils == 0.0
        assert report.option_gain_ils == 0.0
        assert report.dividend_gross_ils == 0.0
        assert report.estimated_tax_ils == 0.0


class TestReportToRowsAndExcel:
    def test_rows_have_hebrew_headers(self):
        report = build_annual_report([stock_event()], tax_year=2026, config=TEST_CONFIG)
        rows = report_to_rows(report)
        assert rows[0]["טיקר"] == "AAPL"
        assert rows[0]["קטגוריה"] == "STOCK"

    def test_export_creates_a_readable_xlsx(self, tmp_path):
        import pandas as pd

        report = build_annual_report([stock_event(), option_event(), dividend_event()], tax_year=2026, config=TEST_CONFIG)
        path = str(tmp_path / "tax_2026.xlsx")
        export_to_excel(report, path)

        assert os.path.exists(path)
        df = pd.read_excel(path)
        assert len(df) == 3
        assert "טיקר" in df.columns
