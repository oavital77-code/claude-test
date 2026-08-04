from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.config import db_path
from src.db.queries import init_db
from src.web.routes import alerts, dashboard, options, positions, screener, tax, trades

app = FastAPI(title="Covered Call System")
app.mount("/static", StaticFiles(directory="src/web/static"), name="static")

app.include_router(dashboard.router)
app.include_router(positions.router)
app.include_router(trades.router)
app.include_router(options.router)
app.include_router(alerts.router)
app.include_router(screener.router)
app.include_router(tax.router)


@app.on_event("startup")
def _ensure_db() -> None:
    init_db(db_path())
