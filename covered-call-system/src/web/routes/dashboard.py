import sqlite3

from fastapi import APIRouter, Depends, Request
from fastapi.templating import Jinja2Templates

from src.db.queries import list_trades
from src.journal.positions import list_open_positions
from src.journal.valuation import total_market_value, value_positions
from src.web import price_cache
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/")
def dashboard(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    positions = list_open_positions(conn)
    total_premium = sum(p.total_premium_collected for p in positions)

    cache = price_cache.get_state()
    valuations = value_positions(positions, cache.quotes)

    return templates.TemplateResponse(request, "dashboard.html", {
        "position_count": len(positions),
        "total_premium": total_premium,
        "trade_count": len(list_trades(conn)),
        "total_market_value": total_market_value(valuations),
        "price_as_of": cache.last_refreshed_at,
    })
