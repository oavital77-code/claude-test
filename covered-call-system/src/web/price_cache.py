"""In-memory cache of the last IBKR price snapshot (stage 2, section 12).

Single-process, single-user local app run manually on demand (no cron,
per section 3) — a plain module-level cache is enough. Prices are never
persisted to the DB; a fresh snapshot is only ever one click away.
"""
from dataclasses import dataclass, field
from typing import Optional

from src.data_providers.ibkr import Quote


@dataclass
class PriceCacheState:
    quotes: dict[str, Quote] = field(default_factory=dict)
    last_error: Optional[str] = None
    last_refreshed_at: Optional[str] = None


_state = PriceCacheState()


def get_state() -> PriceCacheState:
    return _state


def set_quotes(quotes: dict[str, Quote]) -> None:
    _state.quotes = quotes
    _state.last_error = None
    _state.last_refreshed_at = next(iter(quotes.values())).as_of if quotes else None


def set_error(message: str) -> None:
    _state.last_error = message
