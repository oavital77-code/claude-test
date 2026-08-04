"""Creates data/portfolio.db from schema.sql. Safe to re-run (CREATE TABLE IF NOT EXISTS)."""
from src.config import db_path
from src.db.queries import init_db

if __name__ == "__main__":
    path = db_path()
    init_db(path)
    print(f"DB initialized at {path}")
