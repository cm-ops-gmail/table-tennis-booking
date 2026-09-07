import type { AdminStats, Booking } from "../../src/shared/types";
import { listBookings } from "./bookings";
import { listBlockedSlots, listBlockedDates } from "./blocks";
import { listResponses } from "./ratings";
import { listEmployees } from "./employees";
import { ymd } from "./util";

export interface PlayerRow {
  employeeId: string;
  name: string;
  department: string;
  total: number;
  owned: number;
  cancelled: number;
  lastPlayed: string;
}

export async function adminOverview(): Promise<{
  stats: AdminStats;
  recent: Booking[];
  participation: PlayerRow[];
  recentRaters: { employeeId: string; name: string; bookingId: string; submittedAt: string }[];
}> {
  const [bookings, bSlots, bDates, responses, employees] = await Promise.all([
    listBookings(),
    listBlockedSlots(),
    listBlockedDates(),
    listResponses(),
    listEmployees(),
  ]);
  const today = ymd();
  const confirmed = bookings.filter((b) => b.status === "Confirmed");

  const stats: AdminStats = {
    totalBookings: bookings.length,
    todayBookings: confirmed.filter((b) => b.date === today).length,
    upcomingBookings: confirmed.filter((b) => b.date >= today).length,
    cancelledBookings: bookings.filter((b) => b.status === "Cancelled").length,
    blockedSlots: bSlots.length,
    blockedDates: bDates.length,
    totalRatings: new Set(responses.map((r) => `${r.bookingId}:${r.employeeId}`)).size,
  };

  const partMap = new Map<string, PlayerRow>();
  const empById = new Map(employees.map((e) => [e.employeeId.toLowerCase(), e]));
  for (const b of bookings) {
    for (const p of b.participants) {
      const key = p.employeeId.toLowerCase();
      const cur =
        partMap.get(key) ||
        {
          employeeId: p.employeeId,
          name: p.name,
          department: empById.get(key)?.department || "",
          total: 0,
          owned: 0,
          cancelled: 0,
          lastPlayed: "",
        };
      if (b.status === "Cancelled") cur.cancelled += 1;
      else {
        cur.total += 1;
        if (b.ownerId.toLowerCase() === key) cur.owned += 1;
        if (b.date > cur.lastPlayed) cur.lastPlayed = b.date;
      }
      partMap.set(key, cur);
    }
  }

  const seen = new Set<string>();
  const recentRaters = [...responses]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .filter((r) => {
      const k = `${r.bookingId}:${r.employeeId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12)
    .map((r) => ({
      employeeId: r.employeeId,
      name: r.employeeName,
      bookingId: r.bookingId,
      submittedAt: r.submittedAt,
    }));

  return {
    stats,
    recent: [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25),
    participation: [...partMap.values()].sort(
      (a, b) => b.total - a.total || b.owned - a.owned || a.name.localeCompare(b.name)
    ),
    recentRaters,
  };
}

export async function queryBookings(filter: {
  date?: string;
  employee?: string;
  status?: string;
}): Promise<Booking[]> {
  let rows = await listBookings();
  if (filter.date) rows = rows.filter((b) => b.date === filter.date);
  if (filter.status) rows = rows.filter((b) => b.status.toLowerCase() === filter.status!.toLowerCase());
  if (filter.employee) {
    const q = filter.employee.trim().toLowerCase();
    rows = rows.filter(
      (b) =>
        b.participants.some(
          (p) => p.employeeId.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.email.includes(q)
        )
    );
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slotId - b.slotId));
}
