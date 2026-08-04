import sqlite3
from datetime import date, datetime

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from src.config import load_config
from src.data_providers.ibkr import IBKRConnectionError, fetch_option_chain, fetch_option_prices
from src.db.queries import get_next_ex_dividend_dates, list_securities, set_next_ex_dividend_date
from src.options.chain_analysis import days_to_expiry
from src.options.management import evaluate_alerts, generate_roll_alternatives
from src.options.service import list_all_open_option_positions
from src.options.tracking import pct_captured_now
from src.web import price_cache
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/options")
def options_page(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    cfg = load_config()
    price_state = price_cache.get_state()
    ex_div_dates = get_next_ex_dividend_dates(conn)

    rows = []
    for op in list_all_open_option_positions(conn):
        stock_quote = price_state.quotes.get(op.position.ticker)
        stock_price = stock_quote.price if stock_quote else None

        key = (op.position.ticker, op.lot.strike, op.lot.expiry)
        option_quote = price_state.option_quotes.get(key)
        option_price = option_quote.mid if option_quote else None
        pct = pct_captured_now(op.lot, option_price) if option_price is not None else None

        ex_div_str = ex_div_dates.get(op.position.security_id)
        ex_div_date = date.fromisoformat(ex_div_str) if ex_div_str else None

        alerts = evaluate_alerts(
            op.lot, op.position, stock_price, option_price, cfg,
            next_ex_dividend_date=ex_div_date,
        )

        rows.append(dict(
            security_id=op.position.security_id,
            op=op,
            days_to_expiry=days_to_expiry(op.lot.expiry),
            option_price=option_price,
            pct_captured=pct,
            alerts=alerts,
            ex_dividend_date=ex_div_str or "",
            roll=price_cache.get_roll_lookup(op.position.security_id),
        ))

    return templates.TemplateResponse(request, "options.html", {
        "rows": rows,
        "price_error": price_state.option_last_error,
        "price_as_of": price_state.option_last_refreshed_at,
    })


@router.post("/options/refresh-prices")
async def refresh_option_prices(conn: sqlite3.Connection = Depends(get_db)):
    open_positions = list_all_open_option_positions(conn)
    securities = {s["id"]: s for s in list_securities(conn)}

    contracts = [
        dict(
            ticker=securities[op.position.security_id]["ticker"],
            exchange=securities[op.position.security_id]["exchange"],
            currency=securities[op.position.security_id]["currency"],
            strike=op.lot.strike,
            expiry=op.lot.expiry,
        )
        for op in open_positions
    ]

    cfg = load_config()["ibkr"]
    try:
        quotes = await fetch_option_prices(
            contracts, host=cfg["host"], port=cfg["port"], client_id=cfg["client_id"],
            timeout=cfg["timeout_seconds"], prefer_live=cfg["prefer_live_market_data"],
        )
        price_cache.set_option_quotes(quotes)
    except IBKRConnectionError as e:
        price_cache.set_option_error(str(e))

    return RedirectResponse(url="/options", status_code=303)


@router.post("/options/{security_id}/ex-dividend")
def set_ex_dividend(
    security_id: int, next_ex_dividend_date: str = Form(""), conn: sqlite3.Connection = Depends(get_db),
):
    set_next_ex_dividend_date(conn, security_id, next_ex_dividend_date or None)
    return RedirectResponse(url="/options", status_code=303)


@router.post("/options/{security_id}/roll")
async def refresh_roll_alternatives(security_id: int, conn: sqlite3.Connection = Depends(get_db)):
    cfg = load_config()
    securities = {s["id"]: s for s in list_securities(conn)}
    sec = securities.get(security_id)
    if sec is None:
        return RedirectResponse(url="/options", status_code=303)

    matches = [op for op in list_all_open_option_positions(conn) if op.position.security_id == security_id]
    if not matches:
        price_cache.set_roll_error(security_id, "אין פוזיציית אופציה פתוחה עבור נייר זה.")
        return RedirectResponse(url="/options", status_code=303)
    op = matches[0]

    price_state = price_cache.get_state()
    stock_quote = price_state.quotes.get(sec["ticker"])
    if stock_quote is None or stock_quote.price is None:
        price_cache.set_roll_error(security_id, "יש לרענן מחירי מניות (עמוד הפוזיציות) לפני חיפוש roll.")
        return RedirectResponse(url="/options", status_code=303)

    option_quote = price_state.option_quotes.get((sec["ticker"], op.lot.strike, op.lot.expiry))
    if option_quote is None or option_quote.mid is None:
        price_cache.set_roll_error(security_id, "יש לרענן מחירי אופציות לפני חיפוש roll.")
        return RedirectResponse(url="/options", status_code=303)

    ibkr_cfg = cfg["ibkr"]
    try:
        chain = await fetch_option_chain(
            sec["ticker"], sec["exchange"], sec["currency"], stock_quote.price,
            cfg["options"]["expiry_days_min"], cfg["options"]["expiry_days_max"],
            host=ibkr_cfg["host"], port=ibkr_cfg["port"], client_id=ibkr_cfg["client_id"],
            timeout=ibkr_cfg["timeout_seconds"], prefer_live=ibkr_cfg["prefer_live_market_data"],
        )
        alternatives = generate_roll_alternatives(
            op.lot, chain, op.position, stock_quote.price, option_quote.mid, cfg,
        )
        price_cache.set_roll_lookup(security_id, alternatives, datetime.now().isoformat())
    except IBKRConnectionError as e:
        price_cache.set_roll_error(security_id, str(e))

    return RedirectResponse(url="/options", status_code=303)
