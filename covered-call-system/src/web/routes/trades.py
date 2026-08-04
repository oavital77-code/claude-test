import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from src.db.models import VALID_TRADE_TYPES
from src.db.queries import list_securities, list_trades
from src.journal.entry import ValidationError, record_trade
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/trades")
def trades_page(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    trades = list_trades(conn)
    securities = {s["id"]: s for s in list_securities(conn)}
    return templates.TemplateResponse(request, "trades.html", {
        "trades": trades,
        "securities": securities,
    })


@router.get("/trades/new")
def new_trade_form(request: Request, error: Optional[str] = None):
    return templates.TemplateResponse(request, "trade_form.html", {
        "trade_types": VALID_TRADE_TYPES,
        "error": error,
    })


@router.post("/trades/new")
def submit_trade(
    request: Request,
    ticker: str = Form(...),
    exchange: str = Form(...),
    currency: str = Form(...),
    trade_date: str = Form(...),
    type: str = Form(...),
    quantity: float = Form(...),
    price: float = Form(...),
    commission: float = Form(0.0),
    fx_rate: Optional[float] = Form(None),
    strike: Optional[float] = Form(None),
    expiry: Optional[str] = Form(None),
    roll_group_id: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    sector: Optional[str] = Form(None),
    options_eligible: Optional[str] = Form(None),
    conn: sqlite3.Connection = Depends(get_db),
):
    try:
        record_trade(
            conn,
            ticker=ticker.strip().upper(),
            exchange=exchange.strip().upper(),
            currency=currency.strip().upper(),
            trade_date=trade_date,
            type=type,
            quantity=quantity,
            price=price,
            commission=commission,
            fx_rate=fx_rate,
            strike=strike,
            expiry=expiry or None,
            roll_group_id=roll_group_id or None,
            notes=notes or None,
            name=name or None,
            sector=sector or None,
            options_eligible=bool(options_eligible),
        )
    except ValidationError as e:
        return templates.TemplateResponse(request, "trade_form.html", {
            "trade_types": VALID_TRADE_TYPES,
            "error": "; ".join(e.errors),
            "form": dict(
                ticker=ticker, exchange=exchange, currency=currency, trade_date=trade_date,
                type=type, quantity=quantity, price=price, commission=commission,
            ),
        }, status_code=400)

    return RedirectResponse(url="/trades", status_code=303)
