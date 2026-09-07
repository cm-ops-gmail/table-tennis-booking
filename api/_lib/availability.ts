import { SLOTS } from "../../src/shared/slots.js";
import type { DayAvailability, SlotView } from "../../src/shared/types.js";
import { bookingsForDate } from "./bookings.js";
import { listBlockedSlots, listBlockedDates } from "./blocks.js";
import { hhmmNow, ymd } from "./util.js";

export async function getDayAvailability(date: string, viewerId?: string): Promise<DayAvailability> {
  const viewer = (viewerId || "").trim().toLowerCase();
  const [dayBookings, blockedSlots, blockedDates] = await Promise.all([
    bookingsForDate(date),
    listBlockedSlots(),
    listBlockedDates(),
  ]);

  const fullDay = blockedDates.find((b) => b.date === date);
  const confirmed = dayBookings.filter((b) => b.status === "Confirmed");
  const slotBlocks = blockedSlots.filter((b) => b.date === date);

  // Once a slot's start time has come and gone today, it's no longer bookable
  // (and an existing booking for it can no longer be cancelled).
  const isToday = date === ymd();
  const nowHHMM = isToday ? hhmmNow() : "";

  const slots: SlotView[] = SLOTS.map((s) => {
    const base: SlotView = { id: s.id, label: s.label, start: s.start, end: s.end, status: "available" };
    const hasStarted = isToday && nowHHMM >= s.start;

    if (fullDay) {
      return { ...base, status: "fullday" };
    }
    const blk = slotBlocks.find((b) => b.slotId === s.id);
    if (blk) {
      return { ...base, status: "blocked", blockReason: blk.reason };
    }
    const bk = confirmed.find((b) => b.slotId === s.id);
    if (bk) {
      const isMine = bk.participants.some((p) => p.employeeId.toLowerCase() === viewer);
      return {
        ...base,
        status: "booked",
        booking: {
          bookingId: bk.bookingId,
          ownerName: bk.ownerName,
          ownerId: bk.ownerId,
          players: bk.participants.map((p) => ({ name: p.name, employeeId: p.employeeId })),
          isMine,
          canCancel: bk.ownerId.toLowerCase() === viewer && !hasStarted,
        },
      };
    }
    if (hasStarted) {
      return { ...base, status: "past" };
    }
    return base;
  });

  return {
    date,
    fullDayBlocked: Boolean(fullDay),
    fullDayReason: fullDay?.reason,
    slots,
  };
}
