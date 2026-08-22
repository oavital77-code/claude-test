"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateHe } from "@/lib/time";
import { todayInIsrael } from "@/lib/availability/grid";
import type { Database } from "@/lib/supabase/types";
import { joinWaitlistAction, leaveWaitlistAction } from "./actions";

type Branch = Pick<Database["public"]["Tables"]["branches"]["Row"], "id" | "name">;
type Room = Pick<Database["public"]["Tables"]["rooms"]["Row"], "id" | "name" | "branch_id">;
export type WaitlistRow = Database["public"]["Tables"]["waitlist"]["Row"] & {
  roomName: string;
  branchName: string;
};

export function WaitlistClient({
  branches,
  rooms,
  entries,
}: {
  branches: Branch[];
  rooms: Room[];
  entries: WaitlistRow[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(todayInIsrael());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomsForBranch = rooms.filter((r) => r.branch_id === branchId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await joinWaitlistAction({ branchId, roomId, date, startTime, endTime });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleLeave(id: string) {
    await leaveWaitlistAction(id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-lg">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>סניף</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setRoomId("");
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>חדר</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">כל חדר בסניף</option>
                  {roomsForBranch.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>תאריך</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={todayInIsrael()} />
              </div>
              <div className="hidden sm:block" />
              <div className="flex flex-col gap-1.5">
                <Label>משעה</Label>
                <Input type="time" step={1800} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>עד שעה</Label>
                <Input type="time" step={1800} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-fit">
              {loading ? "שומר..." : "הוספה לרשימת המתנה"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">הבקשות שלי</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין בקשות ממתינות.</p>
        ) : (
          entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-center justify-between p-3 text-sm">
                <span>
                  {e.branchName} · {e.roomName} · {formatDateHe(new Date(e.date))} · {e.start_time.slice(0, 5)}–
                  {e.end_time.slice(0, 5)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleLeave(e.id)}>
                  הסרה
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
