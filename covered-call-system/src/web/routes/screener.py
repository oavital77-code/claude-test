from fastapi import APIRouter, Form, Request
from fastapi.templating import Jinja2Templates

from src.config import load_config
from src.screener.service import run_screen

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


def _parse_tickers(raw: str) -> list[dict]:
    """One ticker per line. 'TICKER' defaults to NASDAQ/USD; override with
    'TICKER:EXCHANGE:CURRENCY'."""
    specs = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip().upper() for p in line.split(":")]
        ticker = parts[0]
        exchange = parts[1] if len(parts) > 1 else "NASDAQ"
        currency = parts[2] if len(parts) > 2 else "USD"
        specs.append({"ticker": ticker, "exchange": exchange, "currency": currency})
    return specs


@router.get("/screener")
def screener_page(request: Request):
    return templates.TemplateResponse(request, "screener.html", {
        "ranked": None, "errors": None, "tickers_raw": "",
    })


@router.post("/screener")
async def run_screener_route(request: Request, tickers: str = Form(...)):
    cfg = load_config()
    specs = _parse_tickers(tickers)

    ranked, errors = await run_screen(
        specs, sector_pct_lookup={}, ibkr_cfg=cfg["ibkr"], config=cfg,
    )

    return templates.TemplateResponse(request, "screener.html", {
        "ranked": ranked, "errors": errors, "tickers_raw": tickers,
    })
