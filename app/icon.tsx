import { ImageResponse } from "next/og";

// ⚠️ אין עדיין לוגו/מיתוג רשמי (תמונות החדרים גם חסרות — חוסם פתוח, ר' spec §12).
// זהו סימן גרפי זמני, גיאומטרי בכוונה — לא טקסט עברי, כי לפונט ברירת המחדל
// של ImageResponse/satori אין תמיכה בעברית בלי הטענת גופן מפורשת.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#b5622f",
        }}
      >
        <div
          style={{
            width: 240,
            height: 240,
            borderRadius: "50%",
            border: "32px solid #f7f1ea",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
