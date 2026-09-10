import express, { type Request, type Response, type NextFunction } from "express";
import { HttpError, ymd, isValidYmd } from "./util.js";
import { listEmployees, findByEmail, toLite } from "./employees.js";
import { getConfig, getSlots, listConfigRows, saveConfig } from "./config.js";
import { getDayAvailability } from "./availability.js";
import {
  createBooking,
  cancelBooking,
  bookingsForEmployee,
  bookingsForDate,
} from "./bookings.js";
import {
  listBlockedSlots,
  listBlockedDates,
  listBlockedUsers,
  blockSlot,
  blockDate,
  blockUser,
  unblockSlot,
  unblockDate,
  unblockUser,
  updateBlockNote,
} from "./blocks.js";
import {
  listQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  ratableBookings,
  submitRating,
  ratingReport,
} from "./ratings.js";
import { adminOverview, queryBookings } from "./admin.js";
import { resolveIdentity } from "./auth.js";

function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** Admin routes: a valid 10MS SSO session whose email is in ADMIN_EMAILS. */
function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  resolveIdentity(req)
    .then((id) => {
      if (!id.isAdmin) throw new HttpError(403, "Your account doesn't have admin access.");
      next();
    })
    .catch(next);
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();

  /* ---- meta ------------------------------------------------------ */
  api.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  api.get(
    "/config",
    wrap(async (_req, res) => {
      const [cfg, slots] = await Promise.all([getConfig(), getSlots()]);
      res.json({
        slots,
        today: ymd(),
        horizonDays: cfg.horizonDays,
        facility: { start: cfg.facilityStart, end: cfg.facilityEnd },
        allowRatingEdit: cfg.allowRatingEdit,
      });
    })
  );

  /* ---- auth / identity ----------------------------------------- */
  api.post(
    "/auth/login",
    wrap(async (req, res) => {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) throw new HttpError(400, "Enter your office email.");
      const emp = await findByEmail(email);
      if (!emp) throw new HttpError(404, "That email is not in the Table Tennis employee list. Contact HR.");
      res.json({ employee: emp });
    })
  );

  // After a 10MS SSO login the browser calls this with its Bearer token; we
  // verify it, match the email to the roster, and report back whether this
  // person is an admin. This is the one place the token is checked on the
  // login path — see api/_lib/auth.ts.
  api.post(
    "/auth/sso",
    wrap(async (req, res) => {
      const { employee, isAdmin } = await resolveIdentity(req);
      res.json({ employee, isAdmin });
    })
  );

  api.get(
    "/employees",
    wrap(async (_req, res) => {
      const list = await listEmployees();
      res.json({ employees: list.map(toLite) });
    })
  );

  /* ---- availability ------------------------------------------- */
  api.get(
    "/availability",
    wrap(async (req, res) => {
      const date = String(req.query.date || ymd());
      if (!isValidYmd(date)) throw new HttpError(400, "Invalid date.");
      const viewerId = req.query.viewerId ? String(req.query.viewerId) : undefined;
      res.json(await getDayAvailability(date, viewerId));
    })
  );

  /* ---- bookings --------------------------------------------- */
  api.get(
    "/bookings",
    wrap(async (req, res) => {
      const employeeId = req.query.employeeId ? String(req.query.employeeId) : "";
      const date = req.query.date ? String(req.query.date) : "";
      if (employeeId) return res.json({ bookings: await bookingsForEmployee(employeeId) });
      if (date) return res.json({ bookings: await bookingsForDate(date) });
      throw new HttpError(400, "Provide employeeId or date.");
    })
  );

  api.post(
    "/bookings",
    wrap(async (req, res) => {
      const { ownerId, participantIds, date, slotId, notes } = req.body || {};
      if (!ownerId) throw new HttpError(401, "Sign in first.");
      const booking = await createBooking({
        ownerId: String(ownerId),
        participantIds: Array.isArray(participantIds) ? participantIds.map(String) : [],
        date: String(date || ""),
        slotId: Number(slotId),
        notes: notes ? String(notes) : undefined,
      });
      res.status(201).json({ booking });
    })
  );

  api.post(
    "/bookings/cancel",
    wrap(async (req, res) => {
      const { bookingId, requesterId } = req.body || {};
      if (!bookingId || !requesterId) throw new HttpError(400, "bookingId and requesterId are required.");
      const booking = await cancelBooking(String(bookingId), String(requesterId));
      res.json({ booking });
    })
  );

  /* ---- ratings (employee) ---------------------------------- */
  api.get(
    "/ratings/questions",
    wrap(async (_req, res) => res.json({ questions: await listQuestions(true) }))
  );

  api.get(
    "/ratings/mine",
    wrap(async (req, res) => {
      const employeeId = String(req.query.employeeId || "");
      if (!employeeId) throw new HttpError(400, "employeeId is required.");
      res.json({ bookings: await ratableBookings(employeeId) });
    })
  );

  api.post(
    "/ratings/submit",
    wrap(async (req, res) => {
      const { employeeId, employeeName, bookingId, answers } = req.body || {};
      if (!employeeId) throw new HttpError(401, "Sign in first.");
      await submitRating({
        employeeId: String(employeeId),
        employeeName: String(employeeName || employeeId),
        bookingId: String(bookingId || ""),
        answers: Array.isArray(answers) ? answers : [],
      });
      res.json({ ok: true });
    })
  );

  /* ---- admin ---------------------------------------------- */
  const admin = express.Router();
  admin.use(requireAdmin);

  admin.get("/overview", wrap(async (_req, res) => res.json(await adminOverview())));

  admin.get(
    "/bookings",
    wrap(async (req, res) => {
      res.json({
        bookings: await queryBookings({
          date: req.query.date ? String(req.query.date) : undefined,
          employee: req.query.employee ? String(req.query.employee) : undefined,
          status: req.query.status ? String(req.query.status) : undefined,
        }),
      });
    })
  );

  // Admin creates a booking on behalf of any employee (same validation rules).
  admin.post(
    "/bookings",
    wrap(async (req, res) => {
      const { ownerId, participantIds, date, slotId, notes } = req.body || {};
      if (!ownerId) throw new HttpError(400, "Pick a booking owner.");
      const booking = await createBooking({
        ownerId: String(ownerId),
        participantIds: Array.isArray(participantIds) ? participantIds.map(String) : [],
        date: String(date || ""),
        slotId: Number(slotId),
        notes: notes ? String(notes) : undefined,
      });
      res.status(201).json({ booking });
    })
  );

  admin.get(
    "/blocks",
    wrap(async (_req, res) => {
      const [slots, dates, users] = await Promise.all([listBlockedSlots(), listBlockedDates(), listBlockedUsers()]);
      res.json({ slots, dates, users });
    })
  );

  admin.post(
    "/blocks/slot",
    wrap(async (req, res) => {
      const { date, slotId, reason, by } = req.body || {};
      if (!isValidYmd(String(date || ""))) throw new HttpError(400, "Invalid date.");
      res.status(201).json({ block: await blockSlot(String(date), Number(slotId), String(reason || ""), String(by || "admin")) });
    })
  );

  admin.post(
    "/blocks/date",
    wrap(async (req, res) => {
      const { date, reason, by } = req.body || {};
      if (!isValidYmd(String(date || ""))) throw new HttpError(400, "Invalid date.");
      res.status(201).json({ block: await blockDate(String(date), String(reason || ""), String(by || "admin")) });
    })
  );

  admin.post(
    "/blocks/user",
    wrap(async (req, res) => {
      const { email, reason, by } = req.body || {};
      res.status(201).json({ block: await blockUser(String(email || ""), String(reason || ""), String(by || "admin")) });
    })
  );

  admin.post(
    "/blocks/note",
    wrap(async (req, res) => {
      const { kind, blockId, reason } = req.body || {};
      await updateBlockNote(kind === "date" ? "date" : "slot", String(blockId || ""), String(reason || ""));
      res.json({ ok: true });
    })
  );

  admin.delete(
    "/blocks/slot/:id",
    wrap(async (req, res) => {
      await unblockSlot(req.params.id);
      res.json({ ok: true });
    })
  );

  admin.delete(
    "/blocks/date/:id",
    wrap(async (req, res) => {
      await unblockDate(req.params.id);
      res.json({ ok: true });
    })
  );

  admin.delete(
    "/blocks/user/:id",
    wrap(async (req, res) => {
      await unblockUser(req.params.id);
      res.json({ ok: true });
    })
  );

  admin.get("/questions", wrap(async (_req, res) => res.json({ questions: await listQuestions(false) })));

  admin.post(
    "/questions",
    wrap(async (req, res) => {
      const { text, type, options, order, active } = req.body || {};
      res.status(201).json({
        question: await addQuestion({
          text: String(text || ""),
          type: String(type || "text"),
          options: Array.isArray(options) ? options.map(String) : undefined,
          order: order != null ? Number(order) : undefined,
          active: active !== false,
        }),
      });
    })
  );

  admin.put(
    "/questions/:id",
    wrap(async (req, res) => {
      const { text, type, options, order, active } = req.body || {};
      await updateQuestion(req.params.id, {
        text,
        type,
        options: Array.isArray(options) ? options.map(String) : undefined,
        order: order != null ? Number(order) : undefined,
        active,
      });
      res.json({ ok: true });
    })
  );

  admin.delete(
    "/questions/:id",
    wrap(async (req, res) => {
      await deleteQuestion(req.params.id);
      res.json({ ok: true });
    })
  );

  admin.get("/ratings", wrap(async (_req, res) => res.json(await ratingReport())));

  // Config tab, editable from the admin panel (slot timing, admin list, …).
  admin.get("/config", wrap(async (_req, res) => res.json({ rows: await listConfigRows() })));
  admin.put(
    "/config",
    wrap(async (req, res) => {
      const { email } = await resolveIdentity(req); // cached from requireAdmin
      const body = req.body || {};
      const updates =
        body.updates && typeof body.updates === "object" ? body.updates : (body as Record<string, string>);
      res.json({ rows: await saveConfig(updates, email) });
    })
  );

  api.use("/admin", admin);
  app.use("/api", api);

  // error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    if (status >= 500) console.error(err);
    res.status(status).json({ error: message });
  });

  return app;
}
