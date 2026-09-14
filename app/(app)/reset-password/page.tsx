import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/guards";
import { LoginBackdrop } from "@/components/login-backdrop";
import { ResetPasswordForm } from "./reset-password-form";

// מגיעים לכאן דרך הקישור במייל האיפוס: /auth/callback כבר החליף את הטוקן
// בסשן, אז יש כאן משתמש מחובר גם אם הוא לא זוכר את הסיסמה הישנה.
// כניסה ישירה בלי סשן → חזרה למסך ההתחברות.
export default async function ResetPasswordPage() {
  const { userId } = await getAuthState();
  if (!userId) redirect("/login?error=auth");

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <LoginBackdrop />
      <ResetPasswordForm />
    </div>
  );
}
