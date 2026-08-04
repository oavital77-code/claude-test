-- Covered Call System - database schema
-- ר' docs/SPEC.md סעיף 5. trades היא טבלת האמת: positions נגזרת ממנה בקוד
-- (src/journal/positions.py), לא נשמרת כטבלה נפרדת עם ערכים מוזנים.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS securities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker          TEXT NOT NULL,
    exchange        TEXT NOT NULL,          -- e.g. NASDAQ, NYSE, TASE
    currency        TEXT NOT NULL,          -- e.g. USD, ILS
    name            TEXT,
    sector          TEXT,
    options_eligible INTEGER NOT NULL DEFAULT 1 CHECK (options_eligible IN (0, 1)),
    UNIQUE (ticker, exchange)
);

-- כל שורה היא אירוע בודד שקרה. אין עדכון-במקום של שורות קיימות (append-only).
CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id     INTEGER NOT NULL REFERENCES securities(id),
    trade_date      TEXT NOT NULL,          -- ISO 8601 date
    type            TEXT NOT NULL CHECK (type IN (
                        'STOCK_BUY', 'STOCK_SELL',
                        'CALL_SELL_OPEN', 'CALL_BUY_CLOSE',
                        'ASSIGNMENT', 'EXPIRATION', 'DIVIDEND'
                    )),
    quantity        REAL NOT NULL,          -- shares, or option contracts (per type)
    price            REAL NOT NULL,          -- per-share / per-contract price; 0 for EXPIRATION
    commission      REAL NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL,
    fx_rate         REAL,                   -- שער יציג ליום העסקה; ניתן לדרוס ידנית
    strike          REAL,                   -- option trades only
    expiry          TEXT,                   -- option trades only, ISO 8601 date
    roll_group_id   TEXT,                   -- מקשר סגירה+פתיחה של אותו roll
    lot_id          TEXT,                   -- FIFO lot linkage for STOCK_SELL/ASSIGNMENT
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_security_date ON trades(security_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type);
CREATE INDEX IF NOT EXISTS idx_trades_roll_group ON trades(roll_group_id);

-- מטא-דאטה שמוזנת ידנית לכל נייר: הסיווג CORE/INCOME (העיקרון המארגן של
-- המערכת, סעיף 2.1) ותאריך אקס-דיבידנד הקרוב (סעיף 8) - אין ספק דיבידנדים
-- אוטומטי עדיין (ר' ASSUMPTIONS.md). שאר שדות "positions" (shares_held,
-- avg_cost_raw, avg_cost_adjusted, total_premium_collected, opened_date)
-- מחושבים תמיד מ-trades ואינם מאוחסנים.
CREATE TABLE IF NOT EXISTS position_classification (
    security_id           INTEGER PRIMARY KEY REFERENCES securities(id),
    position_type         TEXT CHECK (position_type IN ('CORE', 'INCOME')),
    next_ex_dividend_date TEXT,
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- שלב 3: מעקב אופציות פתוחות (נגזר גם הוא מ-trades, אך שומר מצב תצוגה נוח)
CREATE TABLE IF NOT EXISTS option_positions (
    trade_id        INTEGER PRIMARY KEY REFERENCES trades(id),
    status          TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'ROLLED', 'ASSIGNED', 'EXPIRED')),
    contracts       INTEGER NOT NULL,
    strike          REAL NOT NULL,
    expiry          TEXT NOT NULL,
    premium_received REAL NOT NULL,
    current_value   REAL,
    pct_captured    REAL
);

-- שלב 5: מודול המס
CREATE TABLE IF NOT EXISTS tax_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id        INTEGER NOT NULL REFERENCES trades(id),
    event_date      TEXT NOT NULL,
    gain_loss_ils   REAL NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('STOCK', 'OPTION', 'DIVIDEND')),
    tax_year        INTEGER NOT NULL,
    fx_rate_open    REAL,
    fx_rate_close   REAL,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_tax_events_year ON tax_events(tax_year);

-- התראות פעילות מהסריקה/מהניהול האחרונים
CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id     INTEGER REFERENCES securities(id),
    rule            TEXT NOT NULL,          -- e.g. PROFIT_TAKE, ROLL, EX_DIVIDEND, STRIKE_CROSS
    message         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    dismissed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(dismissed_at);
