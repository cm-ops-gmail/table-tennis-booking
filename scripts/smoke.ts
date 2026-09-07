/**
 * End-to-end smoke test against the in-memory sheet backend.
 *   TT_MEMORY_SHEET=1 ADMIN_PASSWORD=test npx tsx scripts/smoke.ts
 */
process.env.TT_MEMORY_SHEET = "1";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test";
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

async function call(path: string, opts: { method?: string; body?: unknown; admin?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.admin) headers["x-admin-token"] = process.env.ADMIN_PASSWORD!;
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

    console.log("\nadmin: blocking");
    const noAuth = await call("/admin/overview");
    ok("admin route needs token (401)", noAuth.status === 401);

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
