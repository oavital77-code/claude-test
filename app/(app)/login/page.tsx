import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/guards";
import { RegistrationWizard } from "./registration-wizard";

export default async function LoginPage() {
  const { userId, profile } = await getAuthState();

  if (profile) {
    if (profile.status === "suspended") redirect("/suspended");
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <RegistrationWizard skipToDetails={Boolean(userId)} />
    </div>
  );
}
