import { describe, expect, it } from "vitest";
import { normalizeDate, normalizeTime, parseScheduleFile } from "./parse";

describe("normalizeDate", () => {
  it("מפענח תאריך ישראלי dd/MM/yyyy — יום לפני חודש", () => {
    expect(normalizeDate("03/09/2026")).toBe("2026-09-03");
    expect(normalizeDate("3.9.2026")).toBe("2026-09-03");
  });

  it("מפענח ISO", () => {
    expect(normalizeDate("2026-09-03")).toBe("2026-09-03");
  });

  it("דוחה תאריך שלא קיים", () => {
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeDate("שלישי")).toBeNull();
  });
});

describe("normalizeTime", () => {
  it("מרפד לאפס מוביל", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
    expect(normalizeTime("14:30:00")).toBe("14:30");
  });

  it("דוחה שעה לא תקינה", () => {
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("בוקר")).toBeNull();
  });
});

describe("parseScheduleFile", () => {
  it("מפענח קובץ תקין עם כותרות בעברית", () => {
    const csv = [
      "שם מטפלת,מייל,חדר,תאריך,משעה,עד שעה",
      "טלי כהן,Tali@Example.com,חדר 1,03/09/2026,09:00,10:00",
      "דנה לוי,dana@example.com,חדר 2,04/09/2026,11:00,12:30",
    ].join("\n");

    const result = parseScheduleFile(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      therapistName: "טלי כהן",
      email: "tali@example.com", // מנורמל לאותיות קטנות
      roomName: "חדר 1",
      date: "2026-09-03",
      startTime: "09:00",
      endTime: "10:00",
    });
  });

  it("מתמודד עם BOM ומפריד ; — כמו שאקסל בעברית מייצא בפועל", () => {
    const csv = "﻿שם;חדר;תאריך;שעה\nטלי כהן;חדר 1;03/09/2026;09:00";
    const result = parseScheduleFile(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].therapistName).toBe("טלי כהן");
  });

  it("מכבד מרכאות סביב שדה שמכיל פסיק", () => {
    const csv = 'שם,חדר,תאריך,שעה\n"כהן, טלי",חדר 1,03/09/2026,09:00';
    const result = parseScheduleFile(csv);
    expect(result.rows[0].therapistName).toBe("כהן, טלי");
  });

  it("בלי עמודת שעת סיום — משלים שעה אחת", () => {
    const csv = "שם,חדר,תאריך,שעה\nטלי,חדר 1,03/09/2026,09:00";
    const result = parseScheduleFile(csv);
    expect(result.rows[0].endTime).toBe("10:00");
  });

  it("מדווח על שורה פגומה עם מספר השורה, וממשיך לשורות התקינות", () => {
    const csv = [
      "שם,חדר,תאריך,שעה",
      "טלי,חדר 1,03/09/2026,09:00",
      "דנה,חדר 2,לא-תאריך,10:00",
      "רונית,חדר 3,05/09/2026,11:00",
    ].join("\n");

    const result = parseScheduleFile(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(3);
    expect(result.errors[0].message).toContain("תאריך לא תקין");
  });

  it("נכשל בברור כשחסרות עמודות חובה", () => {
    const csv = "שם,הערות\nטלי,משהו";
    const result = parseScheduleFile(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain("חסרות עמודות חובה");
    expect(result.errors[0].message).toContain("חדר");
  });

  it("דוחה שורה שבה הסיום אינו אחרי ההתחלה", () => {
    const csv = "שם,חדר,תאריך,משעה,עד שעה\nטלי,חדר 1,03/09/2026,12:00,11:00";
    const result = parseScheduleFile(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain("אינה אחרי");
  });

  it("קובץ ריק מחזיר שגיאה ולא קורס", () => {
    expect(parseScheduleFile("").errors[0].message).toBe("הקובץ ריק");
  });
});
