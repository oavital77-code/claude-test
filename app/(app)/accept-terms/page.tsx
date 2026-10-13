import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/guards";
import { AcceptTermsForm } from "./accept-terms-form";

export default async function AcceptTermsPage() {
  const { userId, profile } = await getAuthState();
  if (!userId || !profile) redirect("/login");
  if (profile.terms_accepted_at) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">ברוכים הבאים ל-Cleana, {profile.full_name}</h1>
      <p className="text-sm text-muted-foreground">
        החשבון שלך הועבר מ-Skedda, כולל יתרת השעות. לפני שממשיכים — יש לאשר את תקנון השירות.
      </p>
      <AcceptTermsForm />
    </div>
  );
}
