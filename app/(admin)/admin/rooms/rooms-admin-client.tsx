"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { saveBranch, saveRoom } from "./actions";

type Branch = Database["public"]["Tables"]["branches"]["Row"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];

const ROOM_TYPE_LABELS: Record<Room["room_type"], string> = {
  talk: "שיח",
  touch: "מגע",
  podcast: "פודקאסט",
  group: "קבוצתי",
};

export function RoomsAdminClient({
  branches,
  rooms,
}: {
  branches: Branch[];
  rooms: Room[];
}) {
  const router = useRouter();
  const [editingBranch, setEditingBranch] = useState<Branch | "new" | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | "new" | null>(null);
  const [roomBranchId, setRoomBranchId] = useState<string>(branches[0]?.id ?? "");

  function refresh() {
    setEditingBranch(null);
    setEditingRoom(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">סניפים</h2>
          <Button size="sm" onClick={() => setEditingBranch("new")}>
            + סניף חדש
          </Button>
        </div>

        {editingBranch === "new" && (
          <BranchForm onDone={refresh} onCancel={() => setEditingBranch(null)} />
        )}

        <div className="flex flex-col gap-2">
          {branches.map((b) =>
            editingBranch !== "new" && editingBranch?.id === b.id ? (
              <BranchForm
                key={b.id}
                branch={b}
                onDone={refresh}
                onCancel={() => setEditingBranch(null)}
              />
            ) : (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">
                      {b.name} {!b.active && <span className="text-muted-foreground">(כבוי)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{b.address}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingBranch(b)}>
                    עריכה
                  </Button>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">חדרים</h2>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={roomBranchId}
              onChange={(e) => setRoomBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setEditingRoom("new")}>
              + חדר חדש
            </Button>
          </div>
        </div>

        {editingRoom === "new" && (
          <RoomForm
            branchId={roomBranchId}
            branches={branches}
            onDone={refresh}
            onCancel={() => setEditingRoom(null)}
          />
        )}

        <div className="flex flex-col gap-2">
          {rooms
            .filter((r) => r.branch_id === roomBranchId)
            .map((r) =>
              editingRoom !== "new" && editingRoom?.id === r.id ? (
                <RoomForm
                  key={r.id}
                  room={r}
                  branchId={r.branch_id}
                  branches={branches}
                  onDone={refresh}
                  onCancel={() => setEditingRoom(null)}
                />
              ) : (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {r.name} · {ROOM_TYPE_LABELS[r.room_type]}{" "}
                        {!r.active && <span className="text-muted-foreground">(כבוי)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditingRoom(r)}>
                      עריכה
                    </Button>
                  </CardContent>
                </Card>
              ),
            )}
        </div>
      </section>
    </div>
  );
}

function BranchForm({
  branch,
  onDone,
  onCancel,
}: {
  branch?: Branch;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [wazeUrl, setWazeUrl] = useState(branch?.waze_url ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [active, setActive] = useState(branch?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await saveBranch({
      id: branch?.id,
      name,
      address,
      waze_url: wazeUrl,
      phone,
      active,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{branch ? "עריכת סניף" : "סניף חדש"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>שם הסניף</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>כתובת</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>קישור Waze</Label>
              <Input dir="ltr" className="text-left" value={wazeUrl} onChange={(e) => setWazeUrl(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>טלפון</Label>
              <Input dir="ltr" className="text-left" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} id="branch-active" />
            <Label htmlFor="branch-active" className="font-normal">
              פעיל
            </Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "שומר..." : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RoomForm({
  room,
  branchId,
  branches,
  onDone,
  onCancel,
}: {
  room?: Room;
  branchId: string;
  branches: Branch[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selectedBranchId, setSelectedBranchId] = useState(room?.branch_id ?? branchId);
  const [name, setName] = useState(room?.name ?? "");
  const [roomType, setRoomType] = useState<Room["room_type"]>(room?.room_type ?? "talk");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 2));
  const [description, setDescription] = useState(room?.description ?? "");
  const [equipment, setEquipment] = useState(
    Array.isArray(room?.equipment) ? (room.equipment as string[]).join(", ") : "",
  );
  const [active, setActive] = useState(room?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await saveRoom({
      id: room?.id,
      branch_id: selectedBranchId,
      name,
      room_type: roomType,
      capacity,
      description,
      equipment,
      active,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{room ? "עריכת חדר" : "חדר חדש"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>סניף</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>שם החדר</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>סוג חדר</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as Room["room_type"])}
              >
                {Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>קיבולת</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>תיאור</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ציוד (מופרד בפסיקים)</Label>
            <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} id="room-active" />
            <Label htmlFor="room-active" className="font-normal">
              פעיל
            </Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "שומר..." : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
