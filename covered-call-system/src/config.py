"""Loads config.yaml. All numeric thresholds live there; nothing here is hardcoded."""
from pathlib import Path
from functools import lru_cache
import yaml

CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


@lru_cache
def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def db_path() -> str:
    cfg = load_config()
    return str(Path(__file__).parent.parent / cfg["database"]["path"])
