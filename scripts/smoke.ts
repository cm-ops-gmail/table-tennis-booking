/**
 * End-to-end smoke test against the in-memory sheet backend.
 *   TT_MEMORY_SHEET=1 ADMIN_PASSWORD=test npx tsx scripts/smoke.ts
 */
process.env.TT_MEMORY_SHEET = "1";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test";
// In TT_MEMORY_SHEET mode the SSO token check is skipped and the identity
// comes from the x-tenms-email header — E1 (alice) is the test admin.
process.env.ADMIN_EMAILS = "alice@10ms.test";
const ADMIN_EMAIL = "alice@10ms.test";
process.env.HR_ADMIN_EMAIL = process.env.HR_ADMIN_EMAIL || "hr@10ms.test";
process.env.GOOGLE_SPREADSHEET_ID = "memory";
process.env.GOOGLE_CLIENT_EMAIL = "memory@test";
process.env.GOOGLE_PRIVATE_KEY = "memory";

import { createApp } from "../api/_lib/app";
import type { Server } from "node:http";

const PORT = 4599;
const BASE = `http://localhost:${PORT}/api`;
let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function call(
  path: string,
  opts: { method?: string; body?: unknown; admin?: boolean; asEmail?: string } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.admin) headers["x-tenms-email"] = opts.asEmail ?? ADMIN_EMAIL;
  else if (opts.asEmail) headers["x-tenms-email"] = opts.asEmail;
  const res = await fetch(BASE + path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const server: Server = await new Promise((resolve) => {
    const s = createApp().listen(PORT, () => resolve(s));
  });

  try {
    const date = futureDate(2);

    console.log("\nconfig / identity");
    const cfg = await call("/config");
    ok("config returns 7 slots", cfg.body.slots?.length === 7);

    const login = await call("/auth/login", { body: { email: "alice@10ms.test" } });
    ok("login by email works", login.status === 200 && login.body.employee.employeeId === "E1");
    const badLogin = await call("/auth/login", { body: { email: "nobody@10ms.test" } });
    ok("unknown email rejected (404)", badLogin.status === 404);

    const emps = await call("/employees");
    ok("employees list excludes line-manager PII", !("lineManagerEmail" in (emps.body.employees[0] || {})));

    console.log("\navailability + booking");
    let av = await call(`/availability?date=${date}`);
    ok("all slots available initially", av.body.slots.every((s: any) => s.status === "available"));

    const create = await call("/bookings", {
      body: { ownerId: "E1", participantIds: ["E2"], date, slotId: 1 },
    });
    ok("booking with 2 players created (201)", create.status === 201, JSON.stringify(create.body));
    const bookingId = create.body.booking?.bookingId;

    av = await call(`/availability?date=${date}&viewerId=E1`);
    const slot1 = av.body.slots.find((s: any) => s.id === 1);
    ok("slot 1 now shows booked", slot1?.status === "booked");
    ok("owner sees canCancel", slot1?.booking?.canCancel === true);

    console.log("\nvalidation rules");
    const onlyOne = await call("/bookings", { body: { ownerId: "E3", participantIds: [], date, slotId: 2 } });
    ok("min 2 players enforced", onlyOne.status === 400);

    const tooMany = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E4", "E5", "E1", "E2"], date, slotId: 2 },
    });
    ok("max 4 players enforced", tooMany.status === 400);

    const dup = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E3"], date, slotId: 2 },
    });
    ok("duplicate participant rejected", dup.status === 400);

    const dailyClash = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E2"], date, slotId: 2 },
    });
    ok("daily one-booking rule blocks E2 (409)", dailyClash.status === 409, JSON.stringify(dailyClash.body));

    const slotTaken = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E4"], date, slotId: 1 },
    });
    ok("double-booking same slot rejected (409)", slotTaken.status === 409);

    const past = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E4"], date: futureDate(-1), slotId: 2 },
    });
    ok("past date rejected", past.status === 400);

    console.log("\ncancel (owner-only)");
    const wrongCanceller = await call("/bookings/cancel", { body: { bookingId, requesterId: "E2" } });
    ok("non-owner cannot cancel (403)", wrongCanceller.status === 403);

    const cancel = await call("/bookings/cancel", { body: { bookingId, requesterId: "E1" } });
    ok("owner cancels ok", cancel.status === 200 && cancel.body.booking.status === "Cancelled");

    av = await call(`/availability?date=${date}`);
    ok("slot freed after cancel", av.body.slots.find((s: any) => s.id === 1)?.status === "available");

    // now E2 is free again
    const rebook = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E2"], date, slotId: 3 },
    });
    ok("E2 can rebook after cancellation", rebook.status === 201);
    const ratableBookingId = rebook.body.booking.bookingId;

    console.log("\nnotifications outbox");
    // Read notifications tab via admin? not exposed; check via memstore indirectly:
    const { memReadTable } = await import("../api/_lib/memstore");
    const notif = memReadTable("Notifications");
    ok("notifications queued Pending", notif.rows.length > 0 && notif.rows.every((r) => r["Status"] === "Pending"));
    ok("has line_manager + hr_admin + participant rows", new Set(notif.rows.map((r) => r["Recipient Role"])).size >= 2);

    // E1 and E2 (this first booking's players) share the same line manager
    // (mgr1@10ms.test) — that manager must get exactly one email for THIS
    // booking naming both of them, not two separate emails.
    const mgrRows = notif.rows.filter(
      (r) =>
        r["Recipient Role"] === "line_manager" &&
        r["Recipient Email"] === "mgr1@10ms.test" &&
        r["Booking ID"] === bookingId &&
        r["Type"] === "booking_created"
    );
    ok("shared line manager gets exactly one email", mgrRows.length === 1, JSON.stringify(mgrRows));
    ok(
      "that email names both team members",
      mgrRows[0] && /Alice Rahman/.test(mgrRows[0]["Body"]) && /Bob Karim/.test(mgrRows[0]["Body"])
    );

    console.log("\nadmin: create booking + leaderboard");
    const adminBk = await call("/admin/bookings", {
      admin: true,
      body: { ownerId: "E4", participantIds: ["E5"], date, slotId: 6 },
    });
    ok("admin creates a booking on behalf of an employee", adminBk.status === 201, JSON.stringify(adminBk.body));
    const ov = await call("/admin/overview", { admin: true });
    ok("overview has participation leaderboard", Array.isArray(ov.body.participation) && ov.body.participation.length > 0);
    ok("participation rows carry owned + total", typeof ov.body.participation[0].owned === "number");
    ok("overview has recentRaters array", Array.isArray(ov.body.recentRaters));

    console.log("\nsso identity + admin gating");
    const noAuth = await call("/admin/overview");
    ok("admin route rejects an unauthenticated caller (401)", noAuth.status === 401);
    const nonAdmin = await call("/admin/overview", { asEmail: "bob@10ms.test" });
    ok("admin route rejects a non-admin roster user (403)", nonAdmin.status === 403);
    const stranger = await call("/auth/sso", { method: "POST", asEmail: "nobody@nowhere.test" });
    ok("/auth/sso rejects an email not on the roster (403)", stranger.status === 403);
    const meAdmin = await call("/auth/sso", { method: "POST", asEmail: ADMIN_EMAIL });
    ok(
      "/auth/sso returns the employee + isAdmin for a roster admin",
      meAdmin.status === 200 && meAdmin.body.employee?.employeeId === "E1" && meAdmin.body.isAdmin === true,
      JSON.stringify(meAdmin.body)
    );
    const meUser = await call("/auth/sso", { method: "POST", asEmail: "bob@10ms.test" });
    ok(
      "/auth/sso returns isAdmin=false for a non-admin roster user",
      meUser.status === 200 && meUser.body.isAdmin === false
    );

    console.log("\nadmin: blocking");
    const overview = await call("/admin/overview", { admin: true });
    ok("admin overview ok", overview.status === 200 && typeof overview.body.stats.totalBookings === "number");

    const blockSlot = await call("/admin/blocks/slot", {
      admin: true,
      body: { date, slotId: 5, reason: "Maintenance", by: "admin" },
    });
    ok("admin blocks a slot", blockSlot.status === 201);
    av = await call(`/availability?date=${date}`);
    ok("blocked slot reflected", av.body.slots.find((s: any) => s.id === 5)?.status === "blocked");
    const bookBlocked = await call("/bookings", { body: { ownerId: "E4", participantIds: ["E5"], date, slotId: 5 } });
    ok("cannot book a blocked slot (409)", bookBlocked.status === 409);

    const blockDate = await call("/admin/blocks/date", {
      admin: true,
      body: { date: futureDate(4), reason: "Office event", by: "admin" },
    });
    ok("admin blocks a full day", blockDate.status === 201);
    av = await call(`/availability?date=${futureDate(4)}`);
    ok("full-day block reflected", av.body.fullDayBlocked === true);

    const blocks = await call("/admin/blocks", { admin: true });
    const slotBlockId = blocks.body.slots[0]?.blockId;
    const unblock = await call(`/admin/blocks/slot/${slotBlockId}`, { admin: true, method: "DELETE" });
    ok("admin unblocks a slot", unblock.status === 200);

    console.log("\nadmin: rating questions");
    const q = await call("/admin/questions", { admin: true });
    ok("seeded questions present", q.body.questions.length >= 5);
    const addQ = await call("/admin/questions", {
      admin: true,
      body: { text: "New Q?", type: "yesno" },
    });
    ok("admin adds a question", addQ.status === 201);
    const qid = addQ.body.question.questionId;
    const deact = await call(`/admin/questions/${qid}`, { admin: true, method: "PUT", body: { active: false } });
    ok("admin deactivates a question", deact.status === 200);
    const activeQ = await call("/ratings/questions");
    ok("deactivated question hidden from employees", !activeQ.body.questions.some((x: any) => x.questionId === qid));

    console.log("\nratings submission");
    const mine = await call(`/ratings/mine?employeeId=E2`);
    ok("ratable list only returns past matches (none here)", Array.isArray(mine.body.bookings));
    const rbId = ratableBookingId;
    const activeQs = activeQ.body.questions;
    const submit = await call("/ratings/submit", {
      body: {
        employeeId: "E2",
        employeeName: "Bob Karim",
        bookingId: rbId,
        answers: activeQs.map((qq: any) => ({
          questionId: qq.questionId,
          answer: qq.type === "text" ? "great" : qq.type === "yesno" ? "Yes" : "5",
        })),
      },
    });
    ok("rating submitted", submit.status === 200, JSON.stringify(submit.body));
    const notMine = await call("/ratings/submit", {
      body: { employeeId: "E5", employeeName: "Eve", bookingId: rbId, answers: [{ questionId: activeQs[0].questionId, answer: "5" }] },
    });
    ok("cannot rate a match you weren't in (403)", notMine.status === 403);

    const report = await call("/admin/ratings", { admin: true });
    ok("rating report aggregates", report.body.totalResponses > 0 && report.body.byQuestion.length >= 5);
    ok(
      "rating report lists who reviewed",
      Array.isArray(report.body.respondentsList) && report.body.respondentsList.length >= 1
    );

    console.log("\nfeedback gate before a new booking");
    // The API itself refuses to create bookings in the past, so seed one
    // directly — this stands in for a real match that was already played.
    const { memAppendRows: seedRow } = await import("../api/_lib/memstore");
    const gateDate = futureDate(6);
    seedRow("Bookings", [
      {
        "Booking ID": "TTB-PAST-GATE",
        "Created At": new Date().toISOString(),
        Date: futureDate(-1),
        "Slot ID": 1,
        "Slot Label": "1:00 PM - 1:30 PM",
        "Start Time": "13:00",
        "End Time": "13:30",
        Status: "Confirmed",
        "Owner ID": "E1",
        "Owner Name": "Alice Rahman",
        "Owner Email": "alice@10ms.test",
        "Player Count": 2,
        "Participant IDs": "E1, E2",
        "Participant Names": "Alice Rahman, Bob Karim",
        "Participant Emails": "alice@10ms.test, bob@10ms.test",
        "Line Manager Emails": "",
        "Cancelled At": "",
        "Cancelled By": "",
        Notes: "",
      },
    ]);

    const blockedBoth = await call("/bookings", {
      body: { ownerId: "E1", participantIds: ["E2"], date: gateDate, slotId: 4 },
    });
    ok("cannot book while feedback is owed (409)", blockedBoth.status === 409, JSON.stringify(blockedBoth.body));
    ok(
      "feedback-gate message names both owing players",
      /Alice Rahman/.test(blockedBoth.body.error) && /Bob Karim/.test(blockedBoth.body.error)
    );

    const gateQuestions = (await call("/ratings/questions")).body.questions;
    await call("/ratings/submit", {
      body: {
        employeeId: "E1",
        employeeName: "Alice Rahman",
        bookingId: "TTB-PAST-GATE",
        answers: [{ questionId: gateQuestions[0].questionId, answer: "5" }],
      },
    });

    const blockedOne = await call("/bookings", {
      body: { ownerId: "E1", participantIds: ["E2"], date: gateDate, slotId: 4 },
    });
    ok("still blocked once only one of two players has rated (409)", blockedOne.status === 409);
    ok(
      "feedback-gate message now names only the remaining player",
      /Bob Karim/.test(blockedOne.body.error) && !/Alice Rahman/.test(blockedOne.body.error)
    );

    await call("/ratings/submit", {
      body: {
        employeeId: "E2",
        employeeName: "Bob Karim",
        bookingId: "TTB-PAST-GATE",
        answers: [{ questionId: gateQuestions[0].questionId, answer: "4" }],
      },
    });

    const unblocked = await call("/bookings", {
      body: { ownerId: "E1", participantIds: ["E2"], date: gateDate, slotId: 4 },
    });
    ok("booking allowed once everyone has rated their last match", unblocked.status === 201, JSON.stringify(unblocked.body));

    console.log("\nadmin: blocked users");
    const blockUser = await call("/admin/blocks/user", {
      admin: true,
      body: { email: "eve@10ms.test", reason: "policy violation", by: "admin" },
    });
    ok("admin blocks a user by email (201)", blockUser.status === 201, JSON.stringify(blockUser.body));
    const userBlockId = blockUser.body.block?.blockId;

    const dupeBlock = await call("/admin/blocks/user", {
      admin: true,
      body: { email: "EVE@10ms.test", reason: "dup", by: "admin" },
    });
    ok("blocking an already-blocked email is rejected (409)", dupeBlock.status === 409);

    const badEmail = await call("/admin/blocks/user", {
      admin: true,
      body: { email: "not-an-email", reason: "", by: "admin" },
    });
    ok("blocking an invalid email is rejected (400)", badEmail.status === 400);

    const blocksList = await call("/admin/blocks", { admin: true });
    ok(
      "blocked-users list includes the block",
      Array.isArray(blocksList.body.users) && blocksList.body.users.some((u: any) => u.email === "eve@10ms.test")
    );

    const blockedAsParticipant = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E5"], date: futureDate(7), slotId: 1 },
    });
    ok(
      "cannot book with a blocked teammate (403)",
      blockedAsParticipant.status === 403 && /Eve Chowdhury/.test(blockedAsParticipant.body.error)
    );

    const blockedAsOwner = await call("/bookings", {
      body: { ownerId: "E5", participantIds: ["E3"], date: futureDate(7), slotId: 1 },
    });
    ok("cannot book as a blocked owner (403)", blockedAsOwner.status === 403);

    const unblockUser = await call(`/admin/blocks/user/${userBlockId}`, { admin: true, method: "DELETE" });
    ok("admin unblocks the user", unblockUser.status === 200);

    const afterUnblock = await call("/bookings", {
      body: { ownerId: "E3", participantIds: ["E5"], date: futureDate(7), slotId: 1 },
    });
    ok("booking allowed again after unblocking", afterUnblock.status === 201, JSON.stringify(afterUnblock.body));

    console.log("\nconfig: timing lives in the sheet");
    const { memReadTable: readCfg, memPatchCells: patchCfg } = await import("../api/_lib/memstore");
    function setConfigValue(key: string, value: string) {
      const t = readCfg("Config");
      const idx = t.rows.findIndex((r) => r["Key"] === key);
      if (idx === -1) throw new Error(`Config key not seeded: ${key}`);
      patchCfg("Config", t.rowNumbers[idx], { Value: value });
    }
    const defaultCfg = await call("/config");
    ok("config defaults to 7 slots starting 1:00 PM", defaultCfg.body.slots.length === 7 && defaultCfg.body.slots[0].start === "13:00");

    setConfigValue("SLOT_COUNT", "3");
    setConfigValue("FACILITY_START", "09:00");
    const editedCfg = await call("/config");
    ok(
      "editing the Config tab changes slot count and start time",
      editedCfg.body.slots.length === 3 && editedCfg.body.slots[0].start === "09:00",
      JSON.stringify(editedCfg.body.slots)
    );
    // Restore, so nothing downstream (or a re-run) is affected.
    setConfigValue("SLOT_COUNT", "7");
    setConfigValue("FACILITY_START", "13:00");
    const restoredCfg = await call("/config");
    ok("config reverts cleanly once the sheet values are restored", restoredCfg.body.slots.length === 7);

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exitCode = fail === 0 ? 0 : 1;
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
