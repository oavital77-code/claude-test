"""Weighted ranking and per-candidate strike suggestions (docs/SPEC.md
section 6.3 and section 6's "פלט: טבלה מדורגת... הצעת strike ו-expiry
קונקרטית לשני התרחישים"). Pure — combines the pure screener modules
(fundamental.py, liquidity.py) and stage 3's chain_analysis.select_strike,
so it's unit-testable without any network access.

Weight components (config.yaml screener.ranking_weights): quality 30%,
value 25%, annualized premium yield 25%, IV rank 10%, liquidity 10%.
A component missing its underlying data is EXCLUDED and the remaining
weights renormalized to sum to 1 — same graceful-degradation pattern as
src/screener/fundamental.py and src/screener/liquidity.py.

Premium yield is scored by PERCENTILE within the current scan batch,
not against a fixed absolute ceiling: "good" annualized premium varies
with market conditions, so relative ranking among the batch is more
meaningful than an arbitrary constant (documented in ASSUMPTIONS.md).
"""
from dataclasses import dataclass
from datetime import date
from typing import Optional

from src.data_providers.ibkr import OptionQuote
from src.options.chain_analysis import StrikeSuggestion, select_strike
from src.screener.fundamental import GeneralResult, QualityResult, ValueResult
from src.screener.liquidity import LiquidityResult


@dataclass
class ScreenCandidate:
    ticker: str
    quality: QualityResult
    value: ValueResult
    general: GeneralResult
    liquidity: LiquidityResult
    current_price: Optional[float]
    chain: list[OptionQuote]
    iv_rank: Optional[float] = None  # 0-100 percentile; manual input, no historical-IV source wired (ASSUMPTIONS.md)
    earnings_date: Optional[date] = None


@dataclass
class RankedCandidate:
    candidate: ScreenCandidate
    quality_score: float
    value_score: float
    liquidity_score: float
    premium_yield: Optional[float]        # raw annualized fraction, e.g. 0.18 = 18%
    premium_yield_score: Optional[float]  # 0-100, percentile within the batch
    iv_rank_score: Optional[float]
    final_score: float
    core_suggestion: Optional[StrikeSuggestion]
    income_suggestion: Optional[StrikeSuggestion]

    @property
    def passes_fundamental_screen(self) -> bool:
        c = self.candidate
        return c.quality.passed and c.value.passed and c.general.passed

    @property
    def passes_liquidity_screen(self) -> bool:
        return self.candidate.liquidity.passed

    @property
    def options_eligible_only_for_holding(self) -> bool:
        """Section 6 stage 2: passed fundamentals but failed liquidity ->
        kept on a 'holding only' list rather than discarded."""
        return self.passes_fundamental_screen and not self.passes_liquidity_screen


def compute_annualized_premium_yield(
    suggestion: Optional[StrikeSuggestion], current_price: Optional[float],
) -> Optional[float]:
    if suggestion is None or current_price is None or current_price <= 0 or suggestion.days_to_expiry <= 0:
        return None
    premium_per_contract = suggestion.quote.mid
    if premium_per_contract is None:
        return None
    capital_required = current_price * 100
    premium = premium_per_contract * 100
    return (premium / capital_required) * (365 / suggestion.days_to_expiry)


def score_iv_rank(iv_rank: Optional[float], config: dict) -> Optional[float]:
    """0-100: full score inside [preferred_min, preferred_max]; explicitly
    penalized below cheap_below ('הפרמיה זולה מדי'); gently decays above
    preferred_max."""
    if iv_rank is None:
        return None
    iv_cfg = config["screener"]["iv_rank"]
    lo, hi, cheap = iv_cfg["preferred_min"], iv_cfg["preferred_max"], iv_cfg["cheap_below"]

    if lo <= iv_rank <= hi:
        return 100.0
    if iv_rank < cheap:
        return 20.0
    if iv_rank < lo:
        # linear ramp from 20 (at cheap_below) to 100 (at preferred_min)
        span = lo - cheap
        return 20.0 + (iv_rank - cheap) / span * 80.0 if span > 0 else 100.0
    # iv_rank > hi: decay from 100 down to a floor of 50 by iv_rank=100
    span = max(100 - hi, 1)
    return max(50.0, 100.0 - (iv_rank - hi) / span * 50.0)


def _percentile_scores(values: list[Optional[float]]) -> list[Optional[float]]:
    """Rank-based percentile (0-100) for each value among the non-None
    ones; None stays None. Ties share the same score. Needs >= 2 known
    values to be meaningful — with fewer, every known value scores None
    (nothing to compare against)."""
    known = [v for v in values if v is not None]
    if len(known) < 2:
        return [None for _ in values]
    sorted_known = sorted(known)

    def percentile(v: float) -> float:
        # fraction of the batch this value is >= to (inclusive), so the max gets 100
        count_le = sum(1 for x in sorted_known if x <= v)
        return count_le / len(sorted_known) * 100.0

    return [percentile(v) if v is not None else None for v in values]


def _weighted_score(components: dict[str, Optional[float]], weights: dict[str, float]) -> float:
    available = {k: v for k, v in components.items() if v is not None}
    if not available:
        return 0.0
    weight_sum = sum(weights[k] for k in available)
    if weight_sum == 0:
        return 0.0
    return sum(v * weights[k] for k, v in available.items()) / weight_sum


def rank_candidates(candidates: list[ScreenCandidate], config: dict) -> list[RankedCandidate]:
    weights = config["screener"]["ranking_weights"]

    prelim = []
    for c in candidates:
        core = select_strike(c.chain, "CORE", c.current_price, None, config, earnings_date=c.earnings_date) \
            if c.current_price is not None else None
        income = select_strike(c.chain, "INCOME", c.current_price, None, config, earnings_date=c.earnings_date) \
            if c.current_price is not None else None
        # Prefer INCOME's yield as the ranking signal (higher delta -> more premium); fall back to CORE.
        yield_suggestion = income or core
        premium_yield = compute_annualized_premium_yield(yield_suggestion, c.current_price)
        prelim.append((c, core, income, premium_yield))

    premium_yield_scores = _percentile_scores([p[3] for p in prelim])

    results = []
    for (c, core, income, premium_yield), py_score in zip(prelim, premium_yield_scores):
        iv_score = score_iv_rank(c.iv_rank, config)
        components = {
            "quality": c.quality.score,
            "value": c.value.score,
            "annualized_premium_yield": py_score,
            "iv_rank": iv_score,
            "liquidity": c.liquidity.score,
        }
        final = _weighted_score(components, weights)
        results.append(RankedCandidate(
            candidate=c, quality_score=c.quality.score, value_score=c.value.score,
            liquidity_score=c.liquidity.score, premium_yield=premium_yield,
            premium_yield_score=py_score, iv_rank_score=iv_score, final_score=final,
            core_suggestion=core, income_suggestion=income,
        ))

    return sorted(results, key=lambda r: r.final_score, reverse=True)
