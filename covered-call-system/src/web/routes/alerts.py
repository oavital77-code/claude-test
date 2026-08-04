import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from src.config import load_config
from src.db.queries import (
    dismiss_alert,
    get_next_ex_dividend_dates,
    list_active_alerts,
    list_securities,
    replace_active_alerts,
)
from src.options.management import evaluate_alerts
from src.options.service import list_all_open_option_positions
from src.web import price_cache
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/alerts")
def alerts_page(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    alerts = list_active_alerts(conn)
    securities = {s["id"]: s for s in list_securities(conn)}
    return templates.TemplateResponse(request, "alerts.html", {
        "alerts": alerts,
        "securities": securities,
    })


@router.post("/alerts/refresh")
def refresh_alerts(conn: sqlite3.Connection = Depends(get_db)):
    cfg = load_config()
    price_state = price_cache.get_state()
    ex_div_dates = get_next_ex_dividend_dates(conn)

    computed = []
    for op in list_all_open_option_positions(conn):
        stock_quote = price_state.quotes.get(op.position.ticker)
        stock_price = stock_quote.price if stock_quote else None

        option_quote = price_state.option_quotes.get((op.position.ticker, op.lot.strike, op.lot.expiry))
        option_price = option_quote.mid if option_quote else None

        ex_div_str = ex_div_dates.get(op.position.security_id)
        ex_div_date = date.fromisoformat(ex_div_str) if ex_div_str else None

        for alert in evaluate_alerts(
            op.lot, op.position, stock_price, option_price, cfg, next_ex_dividend_date=ex_div_date,
        ):
            computed.append(dict(security_id=op.position.security_id, rule=alert.rule, message=alert.message))

    replace_active_alerts(conn, computed)
    return RedirectResponse(url="/alerts", status_code=303)


@router.post("/alerts/{alert_id}/dismiss")
def dismiss(alert_id: int, conn: sqlite3.Connection = Depends(get_db)):
    dismiss_alert(conn, alert_id)
    return RedirectResponse(url="/alerts", status_code=303)
