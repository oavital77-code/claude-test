import "server-only";

/**
 * מעטפת HTML משותפת לכל המיילים — RTL, עברית, טבלאות (לא flexbox/grid) כי
 * לקוחות מייל לא תומכים ב-CSS מודרני. עיצוב מינימלי בכוונה.
 */
export function emailLayout(bodyHtml: string, previewText?: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>בקליניקה</title>
</head>
<body style="margin:0;padding:0;background:#f5f4ee;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ee;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dcd8ca;">
          <tr>
            <td style="background:#1f5f52;padding:20px 28px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;">בקליניקה</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:#182420;font-size:15px;line-height:1.75;text-align:right;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f5f4ee;color:#6b7570;font-size:12px;text-align:right;">
              נשלח אוטומטית ממערכת בקליניקה. לשאלות יש לפנות להנהלה.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:#1f5f52;border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
    </td></tr>
  </table>`;
}
