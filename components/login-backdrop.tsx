/**
 * הרקע המצויר (כתמים/קווים/טבעות) שמור למסך הכניסה בלבד — לפי מסמך
 * השפה העיצובית: "להסיר את הרקע המצויר מהאזורים הפנימיים (נשאר רק
 * בכניסה/שיווק)". שאר האפליקציה (אחרי התחברות) נשארת על --canvas נקי.
 */
export function LoginBackdrop() {
  return (
    <div className="bg-decor" aria-hidden="true">
      <span className="blob-1" />
      <span className="blob-2" />
      <span className="blob-3" />
      <span className="line-1" />
      <span className="line-2" />
      <span className="ring-1" />
      <span className="ring-2" />
      <span className="mark-outline" />
    </div>
  );
}
