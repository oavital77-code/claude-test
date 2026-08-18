import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminNav />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
