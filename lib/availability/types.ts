export type SlotStatus = "free" | "taken" | "mine" | "blocked";

export interface AvailabilityInterval {
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
}
