import { appendRows } from "./sheets.js";
import { TAB } from "./schema.js";
import { genId, nowIso } from "./util.js";
import { getHrRecipient } from "./config.js";
import type { Booking } from "../../src/shared/types.js";
import type { Employee } from "../../src/shared/types.js";

type NotifType = "booking_created" | "booking_cancelled";

interface OutboxRow {
  [key: string]: string;
  "Notification ID": string;
  "Created At": string;
  Type: NotifType;
  "Recipient Role": "participant" | "line_manager" | "hr_admin";
  "Recipient Name": string;
  "Recipient Email": string;
  Subject: string;
  Body: string;
  "Booking ID": string;
  Status: "Pending";
}

function fmtPlayers(b: Booking): string {
  return b.participants.map((p) => `${p.name} (${p.employeeId})${p.isOwner ? " — owner" : ""}`).join(", ");
}

/**
 * Queue all notifications for a booking event. Rows land in the Notifications
 * tab with Status = "Pending"; the spreadsheet's Apps Script sends the mail.
 */
export async function queueBookingNotifications(
  b: Booking,
  type: NotifType,
  managers: Pick<Employee, "employeeId" | "name" | "lineManagerName" | "lineManagerEmail">[]
): Promise<void> {
  const hr = await getHrRecipient();
  const verb = type === "booking_created" ? "confirmed" : "cancelled";
  const rows: OutboxRow[] = [];

  const base = {
    "Notification ID": "",
    "Created At": nowIso(),
    Type: type,
    "Booking ID": b.bookingId,
    Status: "Pending" as const,
  };

  // 11.1 — participating employees
  for (const p of b.participants) {
    if (!p.email) continue;
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "participant",
      "Recipient Name": p.name,
      "Recipient Email": p.email,
      Subject: `Table Tennis booking ${verb} — ${b.date} ${b.slotLabel}`,
      Body:
        `Your Table Tennis match has been ${verb}.\n\n` +
        `Date: ${b.date}\nTime: ${b.slotLabel}\nBooking Owner: ${b.ownerName}\n` +
        `Players: ${fmtPlayers(b)}\nBooking ID: ${b.bookingId}` +
        (type === "booking_cancelled" && b.cancelledBy ? `\nCancelled by: ${b.cancelledBy}` : ""),
    });
  }

  // 11.2 — line manager of each participant. Grouped by manager email, not
  // by employee: two participants who share a manager produce ONE email
  // naming both of them, not two separate emails.
  const byManager = new Map<
    string,
    { name: string; email: string; people: { name: string; employeeId: string }[] }
  >();
  for (const p of b.participants) {
    const mgr = managers.find((m) => m.employeeId === p.employeeId);
    if (!mgr?.lineManagerEmail) continue;
    const key = mgr.lineManagerEmail.toLowerCase();
    const cur = byManager.get(key) || {
      name: mgr.lineManagerName || "Line Manager",
      email: mgr.lineManagerEmail,
      people: [] as { name: string; employeeId: string }[],
    };
    cur.people.push({ name: p.name, employeeId: p.employeeId });
    byManager.set(key, cur);
  }
  for (const mgr of byManager.values()) {
    const multi = mgr.people.length > 1;
    const names = mgr.people.map((x) => `${x.name} (${x.employeeId})`).join(", ");
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "line_manager",
      "Recipient Name": mgr.name,
      "Recipient Email": mgr.email,
      Subject: `Team member${multi ? "s'" : "'s"} Table Tennis booking ${verb} — ${names}`,
      Body:
        `This is to inform you that ${multi ? "your team members'" : "a team member's"} Table Tennis booking has been ${verb}.\n\n` +
        `${multi ? "Employees" : "Employee"}: ${names}\n` +
        `Booking Date: ${b.date}\nMatch Time: ${b.slotLabel}\n` +
        `All Players: ${fmtPlayers(b)}\n` +
        `Booking Owner: ${b.ownerName}\nBooking ID: ${b.bookingId}`,
    });
  }

  // 11.3 — HR Admin
  if (hr.email) {
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "hr_admin",
      "Recipient Name": hr.name,
      "Recipient Email": hr.email,
      Subject: `[HR] Table Tennis booking ${verb} — ${b.date} ${b.slotLabel}`,
      Body:
        `A Table Tennis booking has been ${verb}.\n\n` +
        `Booking Owner: ${b.ownerName} (${b.ownerId})\n` +
        `Participating Employees: ${fmtPlayers(b)}\n` +
        `Booking Date: ${b.date}\nBooking Slot: ${b.slotLabel}\nBooking ID: ${b.bookingId}` +
        (type === "booking_cancelled" && b.cancelledBy ? `\nCancelled by: ${b.cancelledBy}` : ""),
    });
  }

  if (rows.length) await appendRows(TAB.Notifications, rows);
}
