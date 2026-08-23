import { getAuthState } from "@/lib/auth/guards";
import { AppNav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();

  return (
    <div className="flex flex-1 flex-col">
      <AppNav isAdmin={profile?.role === "admin"} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
