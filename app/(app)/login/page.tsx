import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/guards";
import { LoginBackdrop } from "@/components/login-backdrop";
import { RegistrationWizard } from "./registration-wizard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId, profile } = await getAuthState();
  const { error } = await searchParams;

  if (profile) {
    if (profile.status === "suspended") redirect("/suspended");
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <LoginBackdrop />
      <RegistrationWizard
        skipToDetails={Boolean(userId)}
        linkExpiredError={error === "auth"}
      />
    </div>
  );
}
