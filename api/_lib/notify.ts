import { appendRows } from "./sheets.js";
import { TAB } from "./schema.js";
import { genId, nowIso } from "./util.js";
import { getHrRecipient } from "./config.js";
import { listEmployees } from "./employees.js";
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-10" → "10 Sep" for the cancellation subject lines. */
function shortDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || m[2]}`;
}

/** The shared "Date / Time / Players / Owner / ID" block. */
function detailsBlock(b: Booking, opts: { employeeLine?: string } = {}): string {
  return [
    opts.employeeLine ? `Employee: ${opts.employeeLine}` : "",
    `Booking Date: ${b.date}`,
    `Match Time: ${b.slotLabel}`,
    `All Players: ${fmtPlayers(b)}`,
    `Booking Owner: ${b.ownerName}`,
    `Booking ID: ${b.bookingId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * Per-recipient copy. Each returns { subject, body }. The Apps Script
 * wraps the body in the branded HTML shell (Subject becomes the heading).
 * ------------------------------------------------------------------ */

function participantConfirmed(b: Booking, name: string) {
  return {
    subject: "🏓 Game On! Your Table Tennis Match Is Confirmed",
    body:
      `Hi ${name},\n\n` +
      `Your Table Tennis match is officially booked! 🏓🔥\n\n` +
      `Booking Date: ${b.date}\n` +
      `Match Time: ${b.slotLabel}\n` +
      `All Players: ${fmtPlayers(b)}\n` +
      `Booking ID: ${b.bookingId}\n\n` +
      `Time to bring your A-game. 😎\n\n` +
      `Happy playing!`,
  };
}

function participantCancelled(b: Booking, name: string) {
  return {
    subject: `🏓 Table Tennis Booking Cancelled — ${shortDate(b.date)}, ${b.slotLabel}`,
    body:
      `Hi ${name},\n\n` +
      `Just a quick heads-up — your Table Tennis match has been cancelled. 🏓\n\n` +
      `${detailsBlock(b)}\n\n` +
      `Catch you on the next game! 😎`,
  };
}

function managerConfirmed(b: Booking, managerName: string, employees: string, multi: boolean) {
  return {
    subject: `🏓 Table Tennis Booking — Your Team Member${multi ? "s Are" : " Is"} In!`,
    body:
      `Hi ${managerName},\n\n` +
      `${multi ? "Some of your team members have" : "One of your team members has"} booked a Table Tennis slot for some recreation time! 🏓✨\n\n` +
      `${detailsBlock(b, { employeeLine: employees })}\n\n` +
      `Just a quick heads-up so you're in the loop. 😊\n\n` +
      `Happy playing!`,
  };
}

function managerCancelled(b: Booking, managerName: string, employees: string, multi: boolean) {
  return {
    subject: `🏓 Table Tennis Booking Cancelled — ${employees}`,
    body:
      `Hi ${managerName},\n\n` +
      `Just a quick heads-up — your team member${multi ? "s'" : "'s"} Table Tennis booking has been cancelled. 🏓\n\n` +
      `${detailsBlock(b, { employeeLine: employees })}\n\n` +
      `You're all set for now.`,
  };
}

function hrCopy(b: Booking, verb: string) {
  return {
    subject: `[HR] Table Tennis booking ${verb} — ${b.date} ${b.slotLabel}`,
    body:
      `A Table Tennis booking has been ${verb}.\n\n` +
      `${detailsBlock(b)}` +
      (verb === "cancelled" && b.cancelledBy ? `\nCancelled by: ${b.cancelledBy}` : ""),
  };
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
  const created = type === "booking_created";
  const rows: OutboxRow[] = [];

  const base = {
    "Notification ID": "",
    "Created At": nowIso(),
    Type: type,
    "Booking ID": b.bookingId,
    Status: "Pending" as const,
  };

  // Participating employees
  for (const p of b.participants) {
    if (!p.email) continue;
    const { subject, body } = created ? participantConfirmed(b, p.name) : participantCancelled(b, p.name);
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "participant",
      "Recipient Name": p.name,
      "Recipient Email": p.email,
      Subject: subject,
      Body: body,
    });
  }

  // Line manager of each participant — grouped by manager email, so two
  // reports on the same booking get ONE email naming both. The roster only
  // has the manager's email (no "Line Manager Name" column), so resolve the
  // manager's own name from their employee record for the greeting.
  const roster = await listEmployees();
  const nameByEmail = new Map(roster.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e.name]));
  const byManager = new Map<
    string,
    { name: string; email: string; people: { name: string; employeeId: string }[] }
  >();
  for (const p of b.participants) {
    const mgr = managers.find((m) => m.employeeId === p.employeeId);
    if (!mgr?.lineManagerEmail) continue;
    const key = mgr.lineManagerEmail.toLowerCase();
    const cur = byManager.get(key) || {
      name: mgr.lineManagerName || nameByEmail.get(key) || "there",
      email: mgr.lineManagerEmail,
      people: [] as { name: string; employeeId: string }[],
    };
    cur.people.push({ name: p.name, employeeId: p.employeeId });
    byManager.set(key, cur);
  }
  for (const mgr of byManager.values()) {
    const multi = mgr.people.length > 1;
    const employees = mgr.people.map((x) => `${x.name} (${x.employeeId})`).join(", ");
    const { subject, body } = created
      ? managerConfirmed(b, mgr.name, employees, multi)
      : managerCancelled(b, mgr.name, employees, multi);
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "line_manager",
      "Recipient Name": mgr.name,
      "Recipient Email": mgr.email,
      Subject: subject,
      Body: body,
    });
  }

  // HR (only if HR_ADMIN_EMAIL is set in the Config tab)
  if (hr.email) {
    const { subject, body } = hrCopy(b, created ? "confirmed" : "cancelled");
    rows.push({
      ...base,
      "Notification ID": genId("NTF"),
      "Recipient Role": "hr_admin",
      "Recipient Name": hr.name,
      "Recipient Email": hr.email,
      Subject: subject,
      Body: body,
    });
  }

  if (rows.length) await appendRows(TAB.Notifications, rows);
}
