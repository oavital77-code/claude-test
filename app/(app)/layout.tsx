import { AppNav } from "./nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AppNav />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
