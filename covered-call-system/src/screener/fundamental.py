"""Quality/value/general fundamental screens (docs/SPEC.md section 6,
stage 1). Pure functions over RawFinancials (src/data_providers/
fundamentals.py) — no network access, so fully unit-testable.

ROIC and Net Debt/EBITDA use standard approximations (NOPAT / Invested
Capital, where Invested Capital = Total Debt + Equity - Cash) suitable
for a personal decision-support tool — see ASSUMPTIONS.md. Every metric
is Optional and every gate degrades to "unknown, not failed" when its
inputs are missing, since a decision-support screen should say "can't
tell" rather than silently failing on incomplete data.
"""
from dataclasses import dataclass, field
from typing import Optional

YearSeries = list[tuple[str, float]]  # (fiscal_year_label, value), oldest first


def _values(series: YearSeries, last_n: Optional[int] = None) -> list[float]:
    vals = [v for _, v in series]
    return vals[-last_n:] if last_n else vals


def compute_roic_series(
    ebit_series: YearSeries,
    pretax_income_series: YearSeries,
    tax_provision_series: YearSeries,
    total_debt_series: YearSeries,
    equity_series: YearSeries,
    cash_series: YearSeries,
) -> YearSeries:
    """ROIC per fiscal year = NOPAT / Invested Capital.
    NOPAT = EBIT * (1 - effective_tax_rate); tax rate = tax / pretax income.
    Invested Capital = Total Debt + Equity - Cash.
    Years missing any required input are skipped.
    """
    by_year = {}
    for label, ebit in ebit_series:
        by_year.setdefault(label, {})["ebit"] = ebit
    for label, v in pretax_income_series:
        by_year.setdefault(label, {})["pretax"] = v
    for label, v in tax_provision_series:
        by_year.setdefault(label, {})["tax"] = v
    for label, v in total_debt_series:
        by_year.setdefault(label, {})["debt"] = v
    for label, v in equity_series:
        by_year.setdefault(label, {})["equity"] = v
    for label, v in cash_series:
        by_year.setdefault(label, {})["cash"] = v

    result = []
    for label, vals in by_year.items():
        required = ("ebit", "pretax", "tax", "debt", "equity", "cash")
        if not all(k in vals for k in required):
            continue
        invested_capital = vals["debt"] + vals["equity"] - vals["cash"]
        if invested_capital == 0 or vals["pretax"] == 0:
            continue
        effective_tax_rate = vals["tax"] / vals["pretax"]
        nopat = vals["ebit"] * (1 - effective_tax_rate)
        result.append((label, nopat / invested_capital))
    return result


def compute_net_debt_to_ebitda(total_debt: float, cash: float, ebitda: float) -> Optional[float]:
    if ebitda == 0:
        return None
    return (total_debt - cash) / ebitda


def compute_fcf_positive_years(fcf_series: YearSeries, window: int) -> Optional[int]:
    values = _values(fcf_series, window)
    if not values:
        return None
    return sum(1 for v in values if v > 0)


def is_gross_margin_stable_or_rising(gross_margin_series: YearSeries, years: int) -> Optional[bool]:
    values = _values(gross_margin_series, years)
    if len(values) < 2:
        return None
    return values[-1] >= values[0]


def compute_interest_coverage(ebit: float, interest_expense: float) -> Optional[float]:
    if not interest_expense:
        return None
    return ebit / abs(interest_expense)


def compute_fcf_yield(fcf: float, market_cap: float) -> Optional[float]:
    if not market_cap:
        return None
    return fcf / market_cap


@dataclass
class QualityResult:
    roic_avg: Optional[float]
    net_debt_ebitda: Optional[float]
    fcf_positive_years: Optional[int]
    fcf_positive_years_window: int
    gross_margin_ok: Optional[bool]
    interest_coverage: Optional[float]
    score: float = 0.0  # 0-100, set by evaluate_quality; see _quality_score
    reasons_failed: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.reasons_failed) == 0


def evaluate_quality(
    roic_series: YearSeries,
    net_debt: float,
    cash: float,
    ebitda: float,
    fcf_series: YearSeries,
    gross_margin_series: YearSeries,
    ebit_latest: float,
    interest_expense_latest: float,
    config: dict,
) -> QualityResult:
    q_cfg = config["screener"]["fundamental"]["quality"]
    reasons = []

    roic_values = _values(roic_series, q_cfg["roic_avg_years"])
    roic_avg = sum(roic_values) / len(roic_values) if roic_values else None
    if roic_avg is not None and roic_avg < q_cfg["roic_min_pct"]:
        reasons.append(f"ROIC {roic_avg:.1%} מתחת לסף {q_cfg['roic_min_pct']:.0%}")

    net_debt_ebitda = compute_net_debt_to_ebitda(net_debt, cash, ebitda) if ebitda else None
    if net_debt_ebitda is not None and net_debt_ebitda > q_cfg["net_debt_ebitda_max"]:
        reasons.append(f"Net Debt/EBITDA {net_debt_ebitda:.2f} מעל הסף {q_cfg['net_debt_ebitda_max']}")

    fcf_years = compute_fcf_positive_years(fcf_series, q_cfg["fcf_positive_years_window"])
    if fcf_years is not None and fcf_years < q_cfg["fcf_positive_years_required"]:
        reasons.append(
            f"FCF חיובי רק ב-{fcf_years} מתוך {q_cfg['fcf_positive_years_window']} שנים "
            f"(נדרש {q_cfg['fcf_positive_years_required']})"
        )

    gross_margin_ok = is_gross_margin_stable_or_rising(gross_margin_series, q_cfg["gross_margin_trend_years"])
    if gross_margin_ok is False:
        reasons.append("Gross Margin יורד לאורך התקופה")

    interest_coverage = compute_interest_coverage(ebit_latest, interest_expense_latest)
    if interest_coverage is not None and interest_coverage < q_cfg["interest_coverage_min"]:
        reasons.append(f"Interest Coverage {interest_coverage:.1f} מתחת לסף {q_cfg['interest_coverage_min']}")

    result = QualityResult(
        roic_avg=roic_avg, net_debt_ebitda=net_debt_ebitda, fcf_positive_years=fcf_years,
        fcf_positive_years_window=q_cfg["fcf_positive_years_window"], gross_margin_ok=gross_margin_ok,
        interest_coverage=interest_coverage, reasons_failed=reasons,
    )
    result.score = _quality_score(result, q_cfg)
    return result


def _quality_score(r: QualityResult, q_cfg: dict) -> float:
    components = []
    if r.roic_avg is not None:
        components.append(min(100.0, max(0.0, r.roic_avg / q_cfg["roic_min_pct"] * 50)))
    if r.net_debt_ebitda is not None:
        components.append(min(100.0, max(0.0, (q_cfg["net_debt_ebitda_max"] - r.net_debt_ebitda) / q_cfg["net_debt_ebitda_max"] * 50 + 50)))
    if r.fcf_positive_years is not None:
        components.append(r.fcf_positive_years / r.fcf_positive_years_window * 100)
    if r.gross_margin_ok is not None:
        components.append(100.0 if r.gross_margin_ok else 0.0)
    if r.interest_coverage is not None:
        components.append(min(100.0, r.interest_coverage / q_cfg["interest_coverage_min"] * 50))
    return sum(components) / len(components) if components else 0.0


@dataclass
class ValueResult:
    fcf_yield: Optional[float]
    ev_ebitda: Optional[float]
    ev_ebitda_sector_avg: Optional[float]
    pe: Optional[float]
    pe_5y_median: Optional[float]
    score: float = 0.0  # 0-100, set by evaluate_value; see _value_score
    reasons_failed: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.reasons_failed) == 0


def evaluate_value(
    fcf: float,
    market_cap: float,
    ev_ebitda: Optional[float],
    ev_ebitda_sector_avg: Optional[float],
    pe: Optional[float],
    historical_pe_series: YearSeries,
    config: dict,
) -> ValueResult:
    v_cfg = config["screener"]["fundamental"]["value"]
    reasons = []

    fcf_yield = compute_fcf_yield(fcf, market_cap)
    if fcf_yield is not None and fcf_yield < v_cfg["fcf_yield_min_pct"]:
        reasons.append(f"FCF Yield {fcf_yield:.1%} מתחת לסף {v_cfg['fcf_yield_min_pct']:.0%}")

    if ev_ebitda is not None and ev_ebitda_sector_avg is not None and ev_ebitda > ev_ebitda_sector_avg:
        reasons.append(f"EV/EBITDA {ev_ebitda:.1f} מעל ממוצע הסקטור {ev_ebitda_sector_avg:.1f}")

    pe_5y_median = None
    pe_values = _values(historical_pe_series)
    if pe_values:
        sorted_vals = sorted(pe_values)
        mid = len(sorted_vals) // 2
        pe_5y_median = (
            sorted_vals[mid] if len(sorted_vals) % 2 else (sorted_vals[mid - 1] + sorted_vals[mid]) / 2
        )
    if pe is not None and pe_5y_median is not None and pe > pe_5y_median:
        reasons.append(f"P/E {pe:.1f} מעל החציון של המניה עצמה ({pe_5y_median:.1f})")

    result = ValueResult(
        fcf_yield=fcf_yield, ev_ebitda=ev_ebitda, ev_ebitda_sector_avg=ev_ebitda_sector_avg,
        pe=pe, pe_5y_median=pe_5y_median, reasons_failed=reasons,
    )
    result.score = _value_score(result, v_cfg)
    return result


def _value_score(r: ValueResult, v_cfg: dict) -> float:
    components = []
    if r.fcf_yield is not None:
        components.append(min(100.0, max(0.0, r.fcf_yield / v_cfg["fcf_yield_min_pct"] * 50)))
    if r.ev_ebitda is not None and r.ev_ebitda_sector_avg:
        components.append(min(100.0, max(0.0, (r.ev_ebitda_sector_avg - r.ev_ebitda) / r.ev_ebitda_sector_avg * 50 + 50)))
    if r.pe is not None and r.pe_5y_median:
        components.append(min(100.0, max(0.0, (r.pe_5y_median - r.pe) / r.pe_5y_median * 50 + 50)))
    return sum(components) / len(components) if components else 0.0


@dataclass
class GeneralResult:
    market_cap: Optional[float]
    price: Optional[float]
    sector_pct_of_portfolio: Optional[float]
    reasons_failed: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.reasons_failed) == 0


def evaluate_general(
    market_cap: Optional[float],
    price: Optional[float],
    sector_pct_of_portfolio: Optional[float],
    config: dict,
) -> GeneralResult:
    g_cfg = config["screener"]["fundamental"]["general"]
    p_cfg = config["portfolio"]
    reasons = []

    if market_cap is not None and market_cap < g_cfg["market_cap_min_usd"]:
        reasons.append(f"שווי שוק {market_cap:,.0f}$ מתחת לסף {g_cfg['market_cap_min_usd']:,.0f}$")

    if price is not None and not (g_cfg["price_min_usd"] <= price <= g_cfg["price_max_usd"]):
        reasons.append(f"מחיר {price:.2f}$ מחוץ לטווח {g_cfg['price_min_usd']}-{g_cfg['price_max_usd']}$")

    if sector_pct_of_portfolio is not None and sector_pct_of_portfolio >= p_cfg["max_sector_concentration_pct"]:
        reasons.append(
            f"הסקטור כבר {sector_pct_of_portfolio:.0%} מהתיק, מעל הסף "
            f"{p_cfg['max_sector_concentration_pct']:.0%}"
        )

    return GeneralResult(
        market_cap=market_cap, price=price, sector_pct_of_portfolio=sector_pct_of_portfolio,
        reasons_failed=reasons,
    )
