import { ImageResponse } from "next/og";

// סימן הלוגו הרשמי (Cleana brand kit) — squircle סגול, טבעת לבנה, נקודה
// מרכזית. בנוי מ-divs (לא SVG גולמי) כי satori/ImageResponse לא תומך
// בכל תחביר SVG בבטחה.
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
          background: "#7A5AF8",
        }}
      >
        <div
          style={{
            width: 266,
            height: 266,
            borderRadius: "50%",
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: "#7A5AF8",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
