import { requireTherapistProfile } from "@/lib/auth/guards";
import { getCleanaPlusStatus } from "@/lib/cleana-plus/connection";
import { CleanaPlusCard } from "./cleana-plus-card";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ cleana_plus?: string }>;
}) {
  const { userId, profile } = await requireTherapistProfile();
  const [{ cleana_plus: cleanaPlusResult }, cleanaPlus] = await Promise.all([searchParams, getCleanaPlusStatus(userId)]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">הכרטיס האישי שלי</h1>
        <p className="text-sm text-muted-foreground">הפרטים שנמסרו בהרשמה. ניתן לעדכן חלק מהם כאן.</p>
      </div>
      <ProfileClient
        fullName={profile.full_name}
        profession={profile.profession ?? ""}
        businessNumber={profile.business_number ?? ""}
        phone={profile.phone}
        email={profile.email}
        nationalId={profile.national_id}
        doorCode={profile.door_code}
        termsAcceptedAt={profile.terms_accepted_at}
        termsVersion={profile.terms_version}
        createdAt={profile.created_at}
      />
      <CleanaPlusCard
        connected={cleanaPlus.connected}
        connectedAt={cleanaPlus.connected ? cleanaPlus.connectedAt : null}
        accountLabel={cleanaPlus.connected ? cleanaPlus.accountLabel : null}
        result={cleanaPlusResult ?? null}
      />
    </div>
  );
}
