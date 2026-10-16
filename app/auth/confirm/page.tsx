import { LoginBackdrop } from "@/components/login-backdrop";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmButtonLabel, parseOtpType, safeNext } from "@/lib/auth/email-link";
import { confirmEmailLink } from "./actions";

// דף ביניים לקישורי מייל: הקוד מנוצל רק בלחיצה על הכפתור, כדי שסורקי
// קישורים של שירותי מייל לא "ישרפו" אותו. ר' lib/auth/email-link.ts.
export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const params = await searchParams;
  const type = parseOtpType(params.type);
  const valid = !!params.token_hash && !!type;

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center p-4">
      <LoginBackdrop />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <Logo markClassName="size-12" wordmarkClassName="text-2xl" />
          </CardTitle>
          <CardDescription>
            {valid ? "כמעט סיימנו — לחצו על הכפתור כדי להמשיך." : "הקישור לא תקין. אפשר לבקש קישור חדש ממסך ההתחברות."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <form action={confirmEmailLink} className="flex flex-col gap-3">
              <input type="hidden" name="token_hash" value={params.token_hash} />
              <input type="hidden" name="type" value={type!} />
              <input type="hidden" name="next" value={safeNext(params.next)} />
              <Button type="submit" size="lg">
                {confirmButtonLabel(type!)}
              </Button>
            </form>
          ) : (
            <Button asChild variant="outline">
              <a href="/login">למסך ההתחברות</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
