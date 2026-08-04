"""Validates and records a single trade event (docs/SPEC.md section 9).

שדות חובה: תאריך, טיקר, סוג, כמות, מחיר, עמלה, מטבע. שער החליפין נשלף
אוטומטית לפי התאריך (src/data_providers/fx.py, שלב 2) עם אפשרות דריסה
ידנית — בשלב 1, ללא ספק FX חי, יש להזין אותו ידנית.
"""
import sqlite3
from datetime import date
from typing import Optional

from src.db.models import VALID_POSITION_TYPES, VALID_TRADE_TYPES
from src.db.queries import get_or_create_security, insert_trade, list_trades, set_position_classification
from src.journal.cost_basis import compute_fifo

OPTION_TYPES = ("CALL_SELL_OPEN", "CALL_BUY_CLOSE", "ASSIGNMENT", "EXPIRATION")


class ValidationError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def validate_trade(trade: dict, existing_trades: Optional[list[dict]] = None) -> list[str]:
    """Returns a list of validation error messages (empty list = valid)."""
    errors: list[str] = []

    if trade.get("type") not in VALID_TRADE_TYPES:
        errors.append(f"סוג עסקה לא חוקי: {trade.get('type')!r}")

    try:
        date.fromisoformat(trade.get("trade_date", ""))
    except (TypeError, ValueError):
        errors.append("תאריך עסקה חסר או לא בפורמט ISO (YYYY-MM-DD)")

    if not trade.get("currency"):
        errors.append("מטבע הוא שדה חובה")

    quantity = trade.get("quantity")
    if quantity is None or quantity == 0:
        errors.append("כמות חייבת להיות שונה מאפס")

    price = trade.get("price")
    if price is None or price < 0:
        if trade.get("type") != "EXPIRATION":
            errors.append("מחיר חייב להיות אפס ומעלה")

    commission = trade.get("commission")
    if commission is None or commission < 0:
        errors.append("עמלה חייבת להיות אפס ומעלה")

    if trade.get("type") in OPTION_TYPES:
        if trade.get("strike") is None:
            errors.append("strike הוא שדה חובה עבור עסקאות אופציה")
        if not trade.get("expiry"):
            errors.append("expiry הוא שדה חובה עבור עסקאות אופציה")

    if trade.get("type") in ("STOCK_SELL", "ASSIGNMENT") and existing_trades is not None and not errors:
        try:
            fifo = compute_fifo(existing_trades + [{**trade, "id": trade.get("id") or -1}])
            if fifo.shares_held < -1e-9:
                errors.append("אין מספיק מניות פתוחות לסגירה (FIFO underflow)")
        except ValueError as e:
            errors.append(str(e))

    return errors


def record_trade(
    conn: sqlite3.Connection,
    ticker: str,
    exchange: str,
    currency: str,
    trade_date: str,
    type: str,
    quantity: float,
    price: float,
    commission: float = 0.0,
    fx_rate: Optional[float] = None,
    strike: Optional[float] = None,
    expiry: Optional[str] = None,
    roll_group_id: Optional[str] = None,
    lot_id: Optional[str] = None,
    notes: Optional[str] = None,
    name: Optional[str] = None,
    sector: Optional[str] = None,
    options_eligible: bool = True,
) -> int:
    security_id = get_or_create_security(
        conn, ticker=ticker, exchange=exchange, currency=currency,
        name=name, sector=sector, options_eligible=options_eligible,
    )

    trade = dict(
        security_id=security_id, trade_date=trade_date, type=type,
        quantity=quantity, price=price, commission=commission, currency=currency,
        fx_rate=fx_rate, strike=strike, expiry=expiry,
        roll_group_id=roll_group_id, lot_id=lot_id, notes=notes,
    )

    existing = [dict(t) for t in list_trades(conn, security_id)]
    errors = validate_trade(trade, existing_trades=existing)
    if errors:
        raise ValidationError(errors)

    return insert_trade(conn, trade)


def classify_position(conn: sqlite3.Connection, security_id: int, position_type: str) -> None:
    if position_type not in VALID_POSITION_TYPES:
        raise ValidationError([f"סיווג פוזיציה לא חוקי: {position_type!r}"])
    set_position_classification(conn, security_id, position_type)
