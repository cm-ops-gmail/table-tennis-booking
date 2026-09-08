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

  // 11.2 — line manager of each participant
  const seenMgr = new Set<string>();
  for (const p of b.participants) {
    const mgr = managers.find((m) => m.employeeId === p.employeeId);
    if (!mgr?.lineManagerEmail) continue;
    const key = `${mgr.lineManagerEmail}::${p.employeeId}`;
    if (seenMgr.has(key)) continue;
    seenMgr.add(key);
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "line_manager",
      "Recipient Name": mgr.lineManagerName || "Line Manager",
      "Recipient Email": mgr.lineManagerEmail,
      Subject: `Team member Table Tennis booking ${verb} — ${p.name}`,
      Body:
        `This is to inform you that a team member's Table Tennis booking has been ${verb}.\n\n` +
        `Employee: ${p.name}\nEmployee ID: ${p.employeeId}\n` +
        `Booking Date: ${b.date}\nMatch Time: ${b.slotLabel}\n` +
        `Other Participants: ${b.participants.filter((x) => x.employeeId !== p.employeeId).map((x) => x.name).join(", ") || "—"}\n` +
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
