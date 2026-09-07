# Table Tennis Booking & Management System

Internal facility booking tool for 10 Minute School, built to the PRD in
`Table Tennis Booking System – Product Requirements Document.md`.

- **Frontend:** Vite + React + TypeScript, Tailwind, styled with the
  [10MS Design System](https://local-design-system.10minuteschool.net) tokens
  (neutral oklch palette, Geist type, `--radius` 0.625rem, light/dark).
- **Backend:** one Express app (`api/_lib/app.ts`) served as a Vercel function
  (`api/index.ts`) and locally via `server.ts`.
- **Database:** Google Sheets via a service account. Every domain object is a tab.
- **Email:** the app never sends mail — it appends rows to the **Notifications**
  tab (`Status = Pending`). A bound Apps Script (`apps-script/Code.gs`) sends them.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in:
   - `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`
   - `ADMIN_PASSWORD` — shared password for the Admin Panel
   - `HR_ADMIN_EMAIL` — who gets the `[HR]` booking notifications
   - optional: `BOOKING_HORIZON_DAYS` (14), `ALLOW_RATING_EDIT` (true), `FACILITY_START`/`FACILITY_END`
3. **Share the spreadsheet** with `GOOGLE_CLIENT_EMAIL` as **Editor**.
4. `npm run provision` — creates the 5 app tabs with the right headers and seeds
   the default rating questions. Safe to re-run (only adds what's missing; never
   touches `TT`).
5. Put real employee data in the **TT** tab (columns below; header wording is
   matched loosely).
6. `npm run dev` — web on :5173, API on :3001.

### TT tab columns

The live sheet uses `Employee Code | Employee Name | Work Email | LM Email` and
that works as-is — headers are matched by loose aliases, and spreadsheet error
values (`#N/A`, …) are treated as blank. Optional extra columns the app will pick
up if present: `Department`, `Designation`, `Line Manager Name`.

## Deploy (Vercel)

- Framework preset: **Vite**. `vercel.json` wires the SPA fallback and routes
  `/api/*` to the single function.
- Add the same env vars in the Vercel project settings.
- `npm run provision` once against the production sheet (or run locally with the
  prod `GOOGLE_SPREADSHEET_ID`).

## Email dispatcher (Apps Script)

Open the spreadsheet ▸ Extensions ▸ Apps Script, paste `apps-script/Code.gs`,
run `installTrigger` once. It then drains the Notifications outbox every minute.

## Sheet tabs (6)

| Tab | Purpose |
|---|---|
| `TT` | Employee master data (source of truth, HR-managed) |
| `Bookings` | One row per booking; participants + line-manager emails stored as delimited columns |
| `Blocks` | Admin blocks — `Type` = `slot` or `date`, `Active` flag |
| `RatingQuestions` | Dynamic questions (`star`/`scale`/`yesno`/`choice`/`text`) |
| `RatingResponses` | One row per answer |
| `Notifications` | Email outbox for the Apps Script |

Settings live in env vars, not a tab. Audit info (who booked/cancelled and when)
is in the `Bookings` row itself.

## Scripts

- `npm run provision` — create/repair tabs, seed defaults
- `npm run typecheck` — `tsc --noEmit`
- `TT_MEMORY_SHEET=1 npx tsx scripts/smoke.ts` — full API end-to-end against an
  in-memory sheet (36 checks: every validation rule in PRD §18, the §19 conflict
  scenario, owner-only cancel, blocking, dynamic questions, ratings)
- `npx tsx scripts/inspect.mjs` — dump the live sheet structure
- `npx tsx scripts/shots.mjs <dir>` — screenshot every screen (needs Chrome)

## Rules enforced (PRD §18/§9/§19)

slot must be available · 2–4 players · every player has name+ID · no duplicates ·
owner free that day · every participant free that day · slot not blocked · day not
blocked · only the booking owner can cancel.
