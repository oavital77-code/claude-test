import { requireTherapistProfile } from "@/lib/auth/guards";

export default async function HomePage() {
  const { profile } = await requireTherapistProfile();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">שלום, {profile.full_name}</h1>
      <p className="text-muted-foreground">
        לוח הזמנים והיתרות בבנייה — M2 ואילך.
      </p>
    </div>
  );
}
