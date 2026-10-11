#!/usr/bin/env python3
"""
המרת ייצוא הזמנות מ-Skedda (bookings_*.csv) לפורמט מסך "ייבוא לו״ז"
(הגדרות → ייבוא לו״ז, lib/schedule-import/parse.ts).

שימוש:
    python3 -I scripts/skedda-to-import.py <bookings.csv> <output.csv>

מיפוי:
  • שם — שם המחזיק (Holder first + last) כשיש; אחרת כותרת ההזמנה (ככה
    מסומנות ססיות ב-Skedda: "Hofit sesia" וכו', בלי פרטי מחזיק); בלי
    שניהם → "משבצת ללא שם".
  • מייל — Holder email (באותיות קטנות), ריק בססיות.
  • סניף — "נווה ימין" אם מופיע בטקסט ה-Spaces, אחרת "הוד השרון".
  • חדר — "Room N", N = המספר הראשון בטקסט ה-Spaces.
  • תאריך/שעות — כפי שהם ב-Skedda (שעון ישראל).

⚠️ הקלט והפלט מכילים פרטים אישיים (שמות, מיילים) — לא לשמור ב-repo.
"""
import csv
import re
import sys

BRANCH_NEVE_YAMIN = "נווה ימין"
BRANCH_HOD_HASHARON = "הוד השרון"


def convert(src: str, dst: str) -> None:
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    out = []
    skipped = []
    for i, r in enumerate(rows, start=2):
        space = r.get("Spaces", "")
        m = re.search(r"\d+", space)
        if not m:
            skipped.append((i, f"חדר לא מזוהה: {space!r}"))
            continue
        holder = f"{r.get('Holder first name', '').strip()} {r.get('Holder last name', '').strip()}".strip()
        name = holder or r.get("Booking title", "").strip() or "משבצת ללא שם"
        start, end = r["Scheduled start"].strip(), r["End"].strip()
        if start[:10] != end[:10]:
            skipped.append((i, "הזמנה שחוצה חצות"))
            continue
        out.append({
            "שם": re.sub(r"\s+", " ", name),
            "מייל": r.get("Holder email", "").strip().lower(),
            "סניף": BRANCH_NEVE_YAMIN if BRANCH_NEVE_YAMIN in space else BRANCH_HOD_HASHARON,
            "חדר": f"Room {m.group()}",
            "תאריך": start[:10],
            "משעה": start[11:16],
            "עד שעה": end[11:16],
        })

    with open(dst, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["שם", "מייל", "סניף", "חדר", "תאריך", "משעה", "עד שעה"])
        w.writeheader()
        w.writerows(out)

    print(f"{len(out)} שורות נכתבו, {len(skipped)} דולגו")
    for line, reason in skipped:
        print(f"  שורה {line}: {reason}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    convert(sys.argv[1], sys.argv[2])
