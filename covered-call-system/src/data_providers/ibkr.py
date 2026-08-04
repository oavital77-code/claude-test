"""Read-only IBKR market-data client (docs/SPEC.md sections 3 and 12, stage 2).

READ-ONLY BY CONSTRUCTION, per CLAUDE.md ("אין שליחת פקודות לברוקר"):
this module only ever calls IB.connectAsync(..., readonly=True) and
reqTickersAsync (a market-data snapshot). It must never import or call
placeOrder, cancelOrder, or any other order-mutating method — there is no
legitimate reason for this file to need them.

Run manually per request (no scheduler/cron, per section 3): each call
opens a connection, takes one snapshot, and disconnects.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from ib_async import IB, Stock, Ticker

MARKET_DATA_TYPE_LIVE = 1
MARKET_DATA_TYPE_DELAYED = 3


class IBKRConnectionError(RuntimeError):
    """TWS/IB Gateway unreachable, or the snapshot could not be fetched."""


@dataclass
class Quote:
    ticker: str
    price: Optional[float]
    as_of: str    # ISO-8601 UTC timestamp of the snapshot
    source: str   # human-readable, e.g. "IBKR (זמן אמת)" / "IBKR (מושהה ~15 דק')"
    is_delayed: bool


def _best_price(t: Ticker) -> Optional[float]:
    for value in (t.last, t.close, t.marketPrice()):
        if value is not None and value == value and value > 0:  # value==value filters NaN
            return float(value)
    return None


async def fetch_quotes(
    securities: list[dict],
    host: str,
    port: int,
    client_id: int,
    timeout: float,
    prefer_live: bool = False,
) -> dict[str, Quote]:
    """Fetches one price snapshot per security. `securities` items need
    'ticker', 'exchange', 'currency' keys. Raises IBKRConnectionError if
    TWS/IB Gateway cannot be reached — callers must handle this, since it
    is the expected outcome whenever no broker session is running.
    """
    if not securities:
        return {}

    ib = IB()
    try:
        await ib.connectAsync(host, port, clientId=client_id, timeout=timeout, readonly=True)
    except Exception as exc:
        raise IBKRConnectionError(
            f"לא ניתן להתחבר ל-TWS/IB Gateway בכתובת {host}:{port}. "
            f"ודא שהתוכנה רצה, שה-API מופעל בהגדרות, ושה-port תואם ל-config.yaml. ({exc})"
        ) from exc

    try:
        market_data_type = MARKET_DATA_TYPE_LIVE if prefer_live else MARKET_DATA_TYPE_DELAYED
        ib.reqMarketDataType(market_data_type)

        contracts = [Stock(sec["ticker"], sec["exchange"], sec["currency"]) for sec in securities]
        try:
            await ib.qualifyContractsAsync(*contracts)
            tickers: list[Ticker] = await ib.reqTickersAsync(*contracts)
        except Exception as exc:
            raise IBKRConnectionError(f"שגיאה בשליפת מחירים מ-IBKR: {exc}") from exc

        as_of = datetime.now(timezone.utc).isoformat()
        delayed = market_data_type != MARKET_DATA_TYPE_LIVE
        source = "IBKR (מושהה ~15 דק')" if delayed else "IBKR (זמן אמת)"

        return {
            sec["ticker"]: Quote(
                ticker=sec["ticker"],
                price=_best_price(t),
                as_of=as_of,
                source=source,
                is_delayed=delayed,
            )
            for sec, t in zip(securities, tickers)
        }
    finally:
        ib.disconnect()
