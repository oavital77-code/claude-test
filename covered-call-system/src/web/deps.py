"""Shared FastAPI dependencies."""
import sqlite3
from typing import Iterator

from src.config import db_path
from src.db.queries import get_connection


def get_db() -> Iterator[sqlite3.Connection]:
    conn = get_connection(db_path())
    try:
        yield conn
    finally:
        conn.close()
