"""Read-only IBKR market-data client (docs/SPEC.md sections 3 and 12, stages 2-3).

READ-ONLY BY CONSTRUCTION, per CLAUDE.md ("אין שליחת פקודות לברוקר"):
this module only ever calls IB.connectAsync(..., readonly=True) plus
reqTickersAsync / reqSecDefOptParamsAsync (market-data / metadata
snapshots). It must never import or call placeOrder, cancelOrder, or any
other order-mutating method — there is no legitimate reason for this file
to need them.

Run manually per request (no scheduler/cron, per section 3): each call
opens a connection, takes one snapshot, and disconnects.
"""
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from ib_async import IB, Option, Stock, Ticker

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


@dataclass
class OptionQuote:
    """One call-option contract snapshot. Always right='C' — this system
    only writes covered calls (section 14 notes cash-secured puts as a
    possible future addition, not implemented).
    """
    ticker: str
    strike: float
    expiry: str   # ISO YYYY-MM-DD, normalized from IBKR's native YYYYMMDD —
                  # matches trades.expiry / OpenOptionLot.expiry everywhere else
    bid: Optional[float]
    ask: Optional[float]
    last: Optional[float]
    delta: Optional[float]
    open_interest: Optional[float]
    volume: Optional[float]
    as_of: str
    source: str
    is_delayed: bool

    @property
    def mid(self) -> Optional[float]:
        if self.bid is not None and self.ask is not None:
            return (self.bid + self.ask) / 2
        return self.last


def _clean(value) -> Optional[float]:
    """IB fields use NaN/-1 for 'unknown'; normalize to None."""
    if value is None:
        return None
    if value != value:  # NaN
        return None
    if value < 0:
        return None
    return float(value)


def _best_price(t: Ticker) -> Optional[float]:
    for value in (t.last, t.close, t.marketPrice()):
        cleaned = _clean(value)
        if cleaned:
            return cleaned
    return None


def _to_ibkr_date(iso_date: str) -> str:
    """YYYY-MM-DD -> YYYYMMDD, the format IB_async/IBKR expects for
    Option.lastTradeDateOrContractMonth."""
    return iso_date.replace("-", "")


def _to_iso_date(ibkr_date: str) -> str:
    """YYYYMMDD -> YYYY-MM-DD, matching trades.expiry everywhere else in
    the system."""
    return f"{ibkr_date[0:4]}-{ibkr_date[4:6]}-{ibkr_date[6:8]}"


async def _connect(ib: IB, host: str, port: int, client_id: int, timeout: float) -> None:
    try:
        await ib.connectAsync(host, port, clientId=client_id, timeout=timeout, readonly=True)
    except Exception as exc:
        raise IBKRConnectionError(
            f"לא ניתן להתחבר ל-TWS/IB Gateway בכתובת {host}:{port}. "
            f"ודא שהתוכנה רצה, שה-API מופעל בהגדרות, ושה-port תואם ל-config.yaml. ({exc})"
        ) from exc


async def fetch_quotes(
    securities: list[dict],
    host: str,
    port: int,
    client_id: int,
    timeout: float,
    prefer_live: bool = False,
) -> dict[str, Quote]:
    """Fetches one stock price snapshot per security. `securities` items
    need 'ticker', 'exchange', 'currency' keys.
    """
    if not securities:
        return {}

    ib = IB()
    await _connect(ib, host, port, client_id, timeout)
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


def _option_quotes_from_tickers(
    ticker_symbol: str, contracts: list[Option], tickers: list[Ticker], as_of: str, source: str, delayed: bool,
) -> list[OptionQuote]:
    quotes = []
    for c, t in zip(contracts, tickers):
        delta = t.modelGreeks.delta if t.modelGreeks else None
        quotes.append(OptionQuote(
            ticker=ticker_symbol,
            strike=c.strike,
            expiry=_to_iso_date(c.lastTradeDateOrContractMonth),
            bid=_clean(t.bid),
            ask=_clean(t.ask),
            last=_clean(t.last),
            delta=delta,
            open_interest=_clean(t.openInterest),
            volume=_clean(t.volume),
            as_of=as_of,
            source=source,
            is_delayed=delayed,
        ))
    return quotes


async def fetch_option_prices(
    contracts: list[dict],
    host: str,
    port: int,
    client_id: int,
    timeout: float,
    prefer_live: bool = False,
) -> dict[tuple, OptionQuote]:
    """Snapshot for SPECIFIC already-known contracts (open positions being
    tracked). `contracts` items need 'ticker', 'exchange', 'currency',
    'strike', 'expiry' (ISO YYYY-MM-DD, matching trades.expiry). Returns a
    dict keyed by (ticker, strike, expiry) using that same ISO format.
    """
    if not contracts:
        return {}

    ib = IB()
    await _connect(ib, host, port, client_id, timeout)
    try:
        market_data_type = MARKET_DATA_TYPE_LIVE if prefer_live else MARKET_DATA_TYPE_DELAYED
        ib.reqMarketDataType(market_data_type)

        option_contracts = [
            Option(c["ticker"], _to_ibkr_date(c["expiry"]), c["strike"], "C", "SMART", currency=c["currency"])
            for c in contracts
        ]
        try:
            await ib.qualifyContractsAsync(*option_contracts)
            tickers: list[Ticker] = await ib.reqTickersAsync(*option_contracts)
        except Exception as exc:
            raise IBKRConnectionError(f"שגיאה בשליפת מחירי אופציות מ-IBKR: {exc}") from exc

        as_of = datetime.now(timezone.utc).isoformat()
        delayed = market_data_type != MARKET_DATA_TYPE_LIVE
        source = "IBKR (מושהה ~15 דק')" if delayed else "IBKR (זמן אמת)"

        result = {}
        for c, quote in zip(contracts, _option_quotes_from_tickers("", option_contracts, tickers, as_of, source, delayed)):
            result[(c["ticker"], c["strike"], c["expiry"])] = quote
        return result
    finally:
        ib.disconnect()


async def fetch_option_expiries(
    ticker: str,
    exchange: str,
    currency: str,
    host: str,
    port: int,
    client_id: int,
    timeout: float,
) -> list[str]:
    """All expiry dates (ISO YYYY-MM-DD) IBKR offers for this underlying —
    metadata only, no market-data snapshot. Used by the liquidity screen
    (section 6 stage 2) to check "at least 3 months of expiries
    available," which needs visibility beyond fetch_option_chain's narrow
    30-45 day window.
    """
    ib = IB()
    await _connect(ib, host, port, client_id, timeout)
    try:
        stock = Stock(ticker, exchange, currency)
        try:
            await ib.qualifyContractsAsync(stock)
            chains = await ib.reqSecDefOptParamsAsync(stock.symbol, "", stock.secType, stock.conId)
        except Exception as exc:
            raise IBKRConnectionError(f"שגיאה בשליפת תפוגות אופציה עבור {ticker}: {exc}") from exc

        if not chains:
            raise IBKRConnectionError(f"לא נמצאה שרשרת אופציות עבור {ticker}")

        chain = next((c for c in chains if c.exchange in ("SMART", exchange)), chains[0])
        return sorted(_to_iso_date(e) for e in chain.expirations)
    finally:
        ib.disconnect()


async def fetch_option_chain(
    ticker: str,
    exchange: str,
    currency: str,
    current_price: float,
    expiry_days_min: int,
    expiry_days_max: int,
    host: str,
    port: int,
    client_id: int,
    timeout: float,
    prefer_live: bool = False,
    strike_band_pct: float = 0.15,
) -> list[OptionQuote]:
    """Fetches call-option quotes across the strikes/expiries relevant to
    selecting or rolling a covered call: expiries within
    [expiry_days_min, expiry_days_max] days, strikes within
    +/- strike_band_pct of current_price.
    """
    ib = IB()
    await _connect(ib, host, port, client_id, timeout)
    try:
        stock = Stock(ticker, exchange, currency)
        try:
            await ib.qualifyContractsAsync(stock)
            chains = await ib.reqSecDefOptParamsAsync(stock.symbol, "", stock.secType, stock.conId)
        except Exception as exc:
            raise IBKRConnectionError(f"שגיאה בשליפת שרשרת אופציות עבור {ticker}: {exc}") from exc

        if not chains:
            raise IBKRConnectionError(f"לא נמצאה שרשרת אופציות עבור {ticker}")

        chain = next((c for c in chains if c.exchange in ("SMART", exchange)), chains[0])

        today = date.today()
        target_expiries = [
            e for e in sorted(chain.expirations)
            if expiry_days_min <= (datetime.strptime(e, "%Y%m%d").date() - today).days <= expiry_days_max
        ]
        if not target_expiries:
            raise IBKRConnectionError(
                f"אין תפוגות זמינות בטווח {expiry_days_min}-{expiry_days_max} ימים עבור {ticker}"
            )

        lo, hi = current_price * (1 - strike_band_pct), current_price * (1 + strike_band_pct)
        target_strikes = sorted(s for s in chain.strikes if lo <= s <= hi)
        if not target_strikes:
            raise IBKRConnectionError(f"אין סטרייקים זמינים בטווח המחיר עבור {ticker}")

        market_data_type = MARKET_DATA_TYPE_LIVE if prefer_live else MARKET_DATA_TYPE_DELAYED
        ib.reqMarketDataType(market_data_type)

        contracts = [
            Option(ticker, expiry, strike, "C", "SMART", currency=currency)
            for expiry in target_expiries
            for strike in target_strikes
        ]
        try:
            qualified = await ib.qualifyContractsAsync(*contracts)
            qualified = [c for c in qualified if getattr(c, "conId", None)]
            if not qualified:
                raise IBKRConnectionError(f"לא ניתן לאמת חוזי אופציה עבור {ticker}")
            tickers: list[Ticker] = await ib.reqTickersAsync(*qualified)
        except IBKRConnectionError:
            raise
        except Exception as exc:
            raise IBKRConnectionError(f"שגיאה בשליפת מחירי שרשרת אופציות מ-IBKR: {exc}") from exc

        as_of = datetime.now(timezone.utc).isoformat()
        delayed = market_data_type != MARKET_DATA_TYPE_LIVE
        source = "IBKR (מושהה ~15 דק')" if delayed else "IBKR (זמן אמת)"

        return _option_quotes_from_tickers(ticker, qualified, tickers, as_of, source, delayed)
    finally:
        ib.disconnect()
