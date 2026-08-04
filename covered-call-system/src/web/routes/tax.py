import io
import sqlite3
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates

from src.config import load_config
from src.tax.report import build_annual_report, export_to_excel
from src.tax.service import compute_all_tax_events
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/tax")
def tax_page(request: Request, year: Optional[int] = None, conn: sqlite3.Connection = Depends(get_db)):
    cfg = load_config()
    all_events = compute_all_tax_events(conn)

    available_years = sorted({e.tax_year for e in all_events}, reverse=True)
    selected_year = year or (available_years[0] if available_years else date.today().year)

    report = build_annual_report(all_events, selected_year, cfg)

    return templates.TemplateResponse(request, "tax.html", {
        "report": report,
        "available_years": available_years or [selected_year],
        "selected_year": selected_year,
    })


@router.get("/tax/export")
def export_tax_excel(year: int, conn: sqlite3.Connection = Depends(get_db)):
    cfg = load_config()
    all_events = compute_all_tax_events(conn)
    report = build_annual_report(all_events, year, cfg)

    buffer = io.BytesIO()
    export_to_excel(report, buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=tax_report_{year}.xlsx"},
    )
