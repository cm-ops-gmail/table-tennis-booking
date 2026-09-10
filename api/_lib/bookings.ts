import { readTable, appendRows, patchCells } from "./sheets.js";
import { TAB } from "./schema.js";
import { genId, nowIso, ymd, hhmmNow, isValidYmd, splitList, normDate, normTime, HttpError } from "./util.js";
import { MIN_PLAYERS, MAX_PLAYERS } from "../../src/shared/slots.js";
import type { Booking, BookingStatus, Participant } from "../../src/shared/types.js";
import { resolveIds, findById, listEmployees } from "./employees.js";
import { listBlockedSlots, listBlockedDates, listBlockedUsers } from "./blocks.js";
import { queueBookingNotifications } from "./notify.js";
import { getConfig, getSlots } from "./config.js";

function parseBooking(r: Record<string, string>): Booking {
  const ids = splitList(r["Participant IDs"]);
  const names = splitList(r["Participant Names"]);
  const emails = splitList(r["Participant Emails"]);
  const ownerId = r["Owner ID"];
  const participants: Participant[] = ids.map((id, i) => ({
    employeeId: id,
    name: names[i] || id,
    email: (emails[i] || "").toLowerCase(),
    isOwner: id === ownerId,
  }));
  return {
    bookingId: r["Booking ID"],
    createdAt: r["Created At"],
    date: normDate(r["Date"]),
    slotId: Number(r["Slot ID"]),
    slotLabel: r["Slot Label"],
    startTime: normTime(r["Start Time"]),
    endTime: normTime(r["End Time"]),
    status: (r["Status"] as BookingStatus) || "Confirmed",
    ownerId,
    ownerName: r["Owner Name"],
    ownerEmail: (r["Owner Email"] || "").toLowerCase(),
    participants,
    playerCount: Number(r["Player Count"]) || participants.length,
    cancelledAt: r["Cancelled At"] || undefined,
    cancelledBy: r["Cancelled By"] || undefined,
    notes: r["Notes"] || undefined,
  };
}

export async function listBookings(): Promise<Booking[]> {
  const t = await readTable(TAB.Bookings);
  return t.rows.map(parseBooking);
}

export async function bookingsForDate(date: string, fresh = false): Promise<Booking[]> {
  const t = await readTable(TAB.Bookings, { fresh });
  return t.rows.filter((r) => normDate(r["Date"]) === date).map(parseBooking);
}

export async function getBooking(bookingId: string, fresh = false): Promise<{ booking: Booking; rowNumber: number } | null> {
  const t = await readTable(TAB.Bookings, { fresh });
  const idx = t.rows.findIndex((r) => r["Booking ID"] === bookingId);
  if (idx === -1) return null;
  return { booking: parseBooking(t.rows[idx]), rowNumber: t.rowNumbers[idx] };
}

/** Has this slot's start time already come and gone? True for any date before
 *  today, or for today once the clock has passed the slot's start time. */
function hasSlotStarted(date: string, startTime: string): boolean {
  const today = ymd();
  return date < today || (date === today && hhmmNow() >= startTime);
}

/**
 * Every past, played match still waiting on this person's own feedback.
 * "Played" mirrors the app's existing "past slot" definition (start time
 * has come and gone) so this lines up with what the booking grid already
 * shows as time-passed.
 */
async function unratedPastMatches(employeeId: string): Promise<Booking[]> {
  const id = employeeId.trim().toLowerCase();
  const all = await listBookings();
  const played = all.filter(
    (b) =>
      b.status === "Confirmed" &&
      hasSlotStarted(b.date, b.startTime) &&
      b.participants.some((p) => p.employeeId.toLowerCase() === id)
  );
  if (!played.length) return [];
  const responses = await readTable(TAB.RatingResponses);
  const rated = new Set(
    responses.rows
      .filter((r) => (r["Employee ID"] || "").trim().toLowerCase() === id)
      .map((r) => r["Booking ID"])
  );
  return played.filter((b) => !rated.has(b.bookingId));
}

/** Every employee id that currently has at least one played-but-unrated
 *  match. The Book page uses this to grey out the booking buttons and mark
 *  teammates in the picker, before anyone hits Confirm. */
export async function employeesOwingFeedback(): Promise<string[]> {
  const all = await listBookings();
  const played = all.filter((b) => b.status === "Confirmed" && hasSlotStarted(b.date, b.startTime));
  if (!played.length) return [];
  const responses = await readTable(TAB.RatingResponses);
  const rated = new Set(
    responses.rows.map(
      (r) => `${(r["Booking ID"] || "").trim()}::${(r["Employee ID"] || "").trim().toLowerCase()}`
    )
  );
  const owing = new Set<string>();
  for (const b of played) {
    for (const p of b.participants) {
      if (!rated.has(`${b.bookingId}::${p.employeeId.toLowerCase()}`)) owing.add(p.employeeId);
    }
  }
  return [...owing];
}

/**
 * Blocks a new booking when the owner, or any teammate being added, still
 * owes feedback on a past match. The message names who and says whether
 * that's the person booking (can't book) or a teammate (can't be added).
 */
async function assertNoOwedFeedback(
  ownerId: string,
  people: { employeeId: string; name: string }[]
): Promise<void> {
  const owner = ownerId.trim().toLowerCase();
  let ownerOwes = false;
  const teammates: string[] = [];
  for (const p of people) {
    if (!(await unratedPastMatches(p.employeeId)).length) continue;
    if (p.employeeId.toLowerCase() === owner) ownerOwes = true;
    else teammates.push(p.name);
  }
  if (!ownerOwes && !teammates.length) return;

  const parts: string[] = [];
  if (ownerOwes) {
    parts.push("You haven't rated your last match yet — submit that feedback before booking again.");
  }
  if (teammates.length) {
    const verb = teammates.length > 1 ? "haven't" : "hasn't";
    parts.push(
      `${teammates.join(", ")} ${verb} rated their last match, so they can't be added until they do.`
    );
  }
  throw new HttpError(409, parts.join(" "));
}

/** All bookings an employee (by id) is part of, most recent first. */
export async function bookingsForEmployee(employeeId: string): Promise<Booking[]> {
  const id = employeeId.trim().toLowerCase();
  const all = await listBookings();
  return all
    .filter((b) => b.participants.some((p) => p.employeeId.toLowerCase() === id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.slotId - a.slotId))
    .map((b) => ({
      ...b,
      canCancel:
        b.status === "Confirmed" && b.ownerId.toLowerCase() === id && !hasSlotStarted(b.date, b.startTime),
    }));
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

export interface CreateBookingInput {
  ownerId: string;
  participantIds: string[]; // may or may not include the owner; owner is forced in
  date: string;
  slotId: number;
  notes?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { ownerId, date, notes } = input;
  const slotId = Number(input.slotId);

  // --- basic shape -------------------------------------------------
  if (!isValidYmd(date)) throw new HttpError(400, "Invalid date.");
  const slots = await getSlots();
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new HttpError(400, "Invalid slot.");

  const today = ymd();
  if (date < today) throw new HttpError(400, "Cannot book a date in the past.");
  if (date === today && hhmmNow() >= slot.start) {
    throw new HttpError(409, `${slot.label} has already started or passed. Pick a later slot.`);
  }
  const horizon = (await getConfig()).horizonDays;
  const maxDate = ymd(new Date(Date.now() + horizon * 86400000));
  if (date > maxDate) throw new HttpError(400, `Bookings open only ${horizon} days ahead.`);

  const owner = await findById(ownerId);
  if (!owner) throw new HttpError(401, "Unknown booking owner. Please sign in again.");

  // --- participants (Rules 2,3,4,9) ------------------------------
  const wantIds = Array.from(
    new Set([ownerId, ...input.participantIds].map((s) => s.trim()).filter(Boolean))
  );
  const dedupLower = new Set(wantIds.map((s) => s.toLowerCase()));
  if (dedupLower.size !== wantIds.length) {
    throw new HttpError(400, "The same employee cannot be added twice.");
  }
  const people = await resolveIds(wantIds); // throws on unknown id
  if (people.length < MIN_PLAYERS) throw new HttpError(400, `A booking needs at least ${MIN_PLAYERS} players.`);
  if (people.length > MAX_PLAYERS) throw new HttpError(400, `A booking allows at most ${MAX_PLAYERS} players.`);
  for (const p of people) {
    if (!p.name || !p.employeeId) throw new HttpError(400, `Missing name or ID for ${p.email || "a participant"}.`);
  }

  // --- admin block list ------------------------------------------
  // A blocked email can't book, and can't be added to someone else's
  // booking either, until HR unblocks it.
  const blockedEmails = new Set((await listBlockedUsers()).map((b) => b.email.toLowerCase()));
  const blockedPeople = people.filter((p) => p.email && blockedEmails.has(p.email.toLowerCase()));
  if (blockedPeople.length) {
    const who = blockedPeople.map((p) => p.name).join(", ");
    throw new HttpError(
      403,
      `${who} ${blockedPeople.length > 1 ? "are" : "is"} blocked from booking by an administrator. Contact HR to be unblocked.`
    );
  }

  // --- outstanding feedback gate ----------------------------------
  // Nobody on this booking — owner or teammate — may start a new match
  // while a past one still owes them a rating.
  await assertNoOwedFeedback(ownerId, people);

  // --- date / slot availability (Rules 1,7,8) --------------------
  if ((await listBlockedDates()).some((b) => b.date === date)) {
    throw new HttpError(409, "That entire day is blocked by an administrator.");
  }
  if ((await listBlockedSlots()).some((b) => b.date === date && b.slotId === slotId)) {
    throw new HttpError(409, "That slot is blocked by an administrator.");
  }

  // Read the day's bookings fresh to minimise the race window.
  const dayBookings = (await bookingsForDate(date, true)).filter((b) => b.status === "Confirmed");
  if (dayBookings.some((b) => b.slotId === slotId)) {
    throw new HttpError(409, "That slot was just booked by someone else. Pick another.");
  }

  // --- daily one-booking-per-employee (Rules 5,6 / §9 / §19) -----
  const busy = new Set<string>();
  for (const b of dayBookings) for (const p of b.participants) busy.add(p.employeeId.toLowerCase());
  const clashes = people.filter((p) => busy.has(p.employeeId.toLowerCase()));
  if (clashes.length) {
    const who = clashes.map((c) => c.name).join(", ");
    throw new HttpError(
      409,
      `${who} ${clashes.length > 1 ? "have" : "has"} already participated in a Table Tennis booking on ${date}.`
    );
  }

  // --- persist --------------------------------------------------
  const bookingId = genId("TTB");
  const createdAt = nowIso();
  const participants: Participant[] = people.map((p) => ({
    employeeId: p.employeeId,
    name: p.name,
    email: p.email,
    isOwner: p.employeeId === owner.employeeId,
  }));

  const bookingRow = {
    "Booking ID": bookingId,
    "Created At": createdAt,
    Date: date,
    "Slot ID": slotId,
    "Slot Label": slot.label,
    "Start Time": slot.start,
    "End Time": slot.end,
    Status: "Confirmed",
    "Owner ID": owner.employeeId,
    "Owner Name": owner.name,
    "Owner Email": owner.email,
    "Player Count": participants.length,
    "Participant IDs": participants.map((p) => p.employeeId).join(", "),
    "Participant Names": participants.map((p) => p.name).join(", "),
    "Participant Emails": participants.map((p) => p.email).join(", "),
    "Line Manager Emails": Array.from(new Set(people.map((p) => p.lineManagerEmail).filter(Boolean))).join(", "),
    "Cancelled At": "",
    "Cancelled By": "",
    Notes: notes || "",
  };
  await appendRows(TAB.Bookings, [bookingRow], { raw: true });

  const booking: Booking = {
    bookingId,
    createdAt,
    date,
    slotId,
    slotLabel: slot.label,
    startTime: slot.start,
    endTime: slot.end,
    status: "Confirmed",
    ownerId: owner.employeeId,
    ownerName: owner.name,
    ownerEmail: owner.email,
    participants,
    playerCount: participants.length,
    notes: notes || undefined,
  };

  await queueBookingNotifications(booking, "booking_created", people);

  return booking;
}

/* ------------------------------------------------------------------ *
 * Cancel  (§10 — owner only)
 * ------------------------------------------------------------------ */

export async function cancelBooking(bookingId: string, requesterId: string): Promise<Booking> {
  const found = await getBooking(bookingId, true);
  if (!found) throw new HttpError(404, "Booking not found.");
  const { booking, rowNumber } = found;

  if (booking.status === "Cancelled") throw new HttpError(409, "This booking is already cancelled.");
  if (booking.ownerId.toLowerCase() !== requesterId.trim().toLowerCase()) {
    throw new HttpError(403, "Only the employee who created the booking can cancel it.");
  }
  if (hasSlotStarted(booking.date, booking.startTime)) {
    throw new HttpError(409, `${booking.slotLabel} has already started or passed and can no longer be cancelled.`);
  }

  const cancelledAt = nowIso();
  const requester = await findById(requesterId);
  const cancelledBy = requester ? `${requester.name} (${requester.employeeId})` : requesterId;

  await patchCells(TAB.Bookings, rowNumber, {
    Status: "Cancelled",
    "Cancelled At": cancelledAt,
    "Cancelled By": cancelledBy,
  });

  const cancelled: Booking = { ...booking, status: "Cancelled", cancelledAt, cancelledBy };

  // Look up managers for notification.
  const all = await listEmployees();
  const managers = booking.participants.map((p) => {
    const e = all.find((x) => x.employeeId.toLowerCase() === p.employeeId.toLowerCase());
    return {
      employeeId: p.employeeId,
      name: p.name,
      lineManagerName: e?.lineManagerName || "",
      lineManagerEmail: e?.lineManagerEmail || "",
    };
  });
  await queueBookingNotifications(cancelled, "booking_cancelled", managers);

  return cancelled;
}

export { hasSlotStarted };
