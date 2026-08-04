import sqlite3

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from src.config import load_config
from src.data_providers.ibkr import IBKRConnectionError, fetch_quotes
from src.db.models import VALID_POSITION_TYPES
from src.db.queries import list_securities
from src.journal.entry import ValidationError, classify_position
from src.journal.positions import list_open_positions
from src.journal.valuation import total_market_value, value_positions
from src.web import price_cache
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/positions")
def positions_page(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    positions = list_open_positions(conn)
    cache = price_cache.get_state()
    valuations = value_positions(positions, cache.quotes)
    return templates.TemplateResponse(request, "positions.html", {
        "valuations": valuations,
        "position_types": VALID_POSITION_TYPES,
        "total_market_value": total_market_value(valuations),
        "price_error": cache.last_error,
        "price_as_of": cache.last_refreshed_at,
    })


@router.post("/positions/{security_id}/classify")
def classify(security_id: int, position_type: str = Form(...), conn: sqlite3.Connection = Depends(get_db)):
    try:
        classify_position(conn, security_id, position_type)
    except ValidationError:
        pass  # invalid value from a tampered form; ignore and redirect back unchanged
    return RedirectResponse(url="/positions", status_code=303)


@router.post("/positions/refresh-prices")
async def refresh_prices(conn: sqlite3.Connection = Depends(get_db)):
    open_tickers = {p.ticker for p in list_open_positions(conn)}
    securities = [
        {"ticker": s["ticker"], "exchange": s["exchange"], "currency": s["currency"]}
        for s in list_securities(conn)
        if s["ticker"] in open_tickers
    ]

    cfg = load_config()["ibkr"]
    try:
        quotes = await fetch_quotes(
            securities,
            host=cfg["host"],
            port=cfg["port"],
            client_id=cfg["client_id"],
            timeout=cfg["timeout_seconds"],
            prefer_live=cfg["prefer_live_market_data"],
        )
        price_cache.set_quotes(quotes)
    except IBKRConnectionError as e:
        price_cache.set_error(str(e))

    return RedirectResponse(url="/positions", status_code=303)
