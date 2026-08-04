import sqlite3

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from src.db.models import VALID_POSITION_TYPES
from src.journal.entry import ValidationError, classify_position
from src.journal.positions import list_open_positions
from src.web.deps import get_db

router = APIRouter()
templates = Jinja2Templates(directory="src/web/templates")


@router.get("/positions")
def positions_page(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    positions = list_open_positions(conn)
    return templates.TemplateResponse(request, "positions.html", {
        "positions": positions,
        "position_types": VALID_POSITION_TYPES,
    })


@router.post("/positions/{security_id}/classify")
def classify(security_id: int, position_type: str = Form(...), conn: sqlite3.Connection = Depends(get_db)):
    try:
        classify_position(conn, security_id, position_type)
    except ValidationError:
        pass  # invalid value from a tampered form; ignore and redirect back unchanged
    return RedirectResponse(url="/positions", status_code=303)
