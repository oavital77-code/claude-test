"""In-memory cache of the last IBKR snapshots (stock prices, option
prices, and roll-alternative lookups — stages 2-3, section 12).

Single-process, single-user local app run manually on demand (no cron,
per section 3) — a plain module-level cache is enough. Nothing here is
persisted to the DB; a fresh snapshot is only ever one click away.
"""
from dataclasses import dataclass, field
from typing import Optional

from src.data_providers.ibkr import OptionQuote, Quote
from src.options.management import RollAlternative


@dataclass
class RollLookup:
    alternatives: list[RollAlternative] = field(default_factory=list)
    error: Optional[str] = None
    as_of: Optional[str] = None


@dataclass
class PriceCacheState:
    quotes: dict[str, Quote] = field(default_factory=dict)
    last_error: Optional[str] = None
    last_refreshed_at: Optional[str] = None

    option_quotes: dict[tuple, OptionQuote] = field(default_factory=dict)
    option_last_error: Optional[str] = None
    option_last_refreshed_at: Optional[str] = None

    roll_lookups: dict[int, RollLookup] = field(default_factory=dict)  # keyed by security_id


_state = PriceCacheState()


def get_state() -> PriceCacheState:
    return _state


def set_quotes(quotes: dict[str, Quote]) -> None:
    _state.quotes = quotes
    _state.last_error = None
    _state.last_refreshed_at = next(iter(quotes.values())).as_of if quotes else None


def set_error(message: str) -> None:
    _state.last_error = message


def set_option_quotes(quotes: dict[tuple, OptionQuote]) -> None:
    _state.option_quotes = quotes
    _state.option_last_error = None
    _state.option_last_refreshed_at = next(iter(quotes.values())).as_of if quotes else None


def set_option_error(message: str) -> None:
    _state.option_last_error = message


def set_roll_lookup(security_id: int, alternatives: list[RollAlternative], as_of: str) -> None:
    _state.roll_lookups[security_id] = RollLookup(alternatives=alternatives, error=None, as_of=as_of)


def set_roll_error(security_id: int, message: str) -> None:
    _state.roll_lookups[security_id] = RollLookup(alternatives=[], error=message, as_of=None)


def get_roll_lookup(security_id: int) -> Optional[RollLookup]:
    return _state.roll_lookups.get(security_id)
