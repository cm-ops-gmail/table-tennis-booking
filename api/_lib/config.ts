/**
 * Runtime settings, editable by HR straight in the Google Sheet's `Config`
 * tab (Key / Value / Description rows) — see schema.ts's DEFAULT_CONFIG for
 * the full list of keys. Any key missing from the sheet falls back to its
 * environment variable, then a hardcoded default, so the app still runs if
 * the tab is empty or hasn't been provisioned yet.
 *
 *   HR_ADMIN_EMAIL       recipient for the [HR] booking notifications
 *   HR_ADMIN_NAME        display name for that recipient (default "HR Admin")
 *   BOOKING_HORIZON_DAYS how many days ahead bookings open (default 14)
 *   ALLOW_RATING_EDIT    "TRUE" (default) lets an employee re-submit a rating
 *   FACILITY_START       first slot's start time, 24h HH:MM (default 13:00)
 *   FACILITY_END         display-only closing time, 24h HH:MM (default 17:30)
 *   MATCH_MINUTES        length of one match in minutes (default 30)
 *   GAP_MINUTES          gap between matches in minutes (default 10)
 *   SLOT_COUNT           slots generated per day (default 7)
 *   ADMIN_EMAILS         comma-separated emails that get the Admin view
 */
import { readTable, appendRows, patchCells, invalidate } from "./sheets.js";
import { TAB, DEFAULT_CONFIG } from "./schema.js";
import { HttpError } from "./util.js";
import { buildSlots, type SlotDef } from "../../src/shared/slots.js";

export interface AppConfig {
  hrEmail: string;
  hrName: string;
  horizonDays: number;
  allowRatingEdit: boolean;
  facilityStart: string;
  facilityEnd: string;
  matchMinutes: number;
  gapMinutes: number;
  slotCount: number;
  /** Lower-cased emails allowed into the Admin view. */
  adminEmails: string[];
}

async function sheetValues(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const t = await readTable(TAB.Config);
    for (const r of t.rows) {
      const key = (r["Key"] || "").trim();
      if (key) map.set(key, (r["Value"] || "").trim());
    }
  } catch {
    // The Config tab doesn't exist yet (not provisioned) — behave exactly
    // like an empty tab so every setting falls back to its env var / default
    // instead of taking the whole app down.
  }
  return map;
}

function pick(sheet: Map<string, string>, key: string, envFallback: string | undefined, hardDefault: string): string {
  // A key that's present in the Config tab is authoritative — even when
  // blank. Clearing a field in the Settings UI / sheet (e.g. HR_ADMIN_EMAIL
  // to stop the HR notifications) must actually take effect, not silently
  // fall back to an env var. Env vars only fill in keys the sheet lacks.
  if (sheet.has(key)) return sheet.get(key)!;
  if (envFallback) return envFallback;
  return hardDefault;
}

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function getConfig(): Promise<AppConfig> {
  const sheet = await sheetValues();

  const horizon = Number(pick(sheet, "BOOKING_HORIZON_DAYS", process.env.BOOKING_HORIZON_DAYS, "14"));
  const matchMinutes = Number(pick(sheet, "MATCH_MINUTES", process.env.MATCH_MINUTES, "30"));
  const gapMinutes = Number(pick(sheet, "GAP_MINUTES", process.env.GAP_MINUTES, "10"));
  const slotCount = Number(pick(sheet, "SLOT_COUNT", process.env.SLOT_COUNT, "7"));

  return {
    hrEmail: pick(sheet, "HR_ADMIN_EMAIL", process.env.HR_ADMIN_EMAIL, "").trim(),
    hrName: pick(sheet, "HR_ADMIN_NAME", process.env.HR_ADMIN_NAME, "HR Admin").trim(),
    horizonDays: Number.isFinite(horizon) && horizon > 0 ? horizon : 14,
    allowRatingEdit: pick(sheet, "ALLOW_RATING_EDIT", process.env.ALLOW_RATING_EDIT, "TRUE").toLowerCase() !== "false",
    facilityStart: HHMM.test(pick(sheet, "FACILITY_START", process.env.FACILITY_START, "13:00").trim())
      ? pick(sheet, "FACILITY_START", process.env.FACILITY_START, "13:00").trim()
      : "13:00",
    facilityEnd: HHMM.test(pick(sheet, "FACILITY_END", process.env.FACILITY_END, "17:30").trim())
      ? pick(sheet, "FACILITY_END", process.env.FACILITY_END, "17:30").trim()
      : "17:30",
    matchMinutes: Number.isFinite(matchMinutes) && matchMinutes > 0 ? matchMinutes : 30,
    gapMinutes: Number.isFinite(gapMinutes) && gapMinutes >= 0 ? gapMinutes : 10,
    slotCount: Number.isFinite(slotCount) && slotCount > 0 ? slotCount : 7,
    adminEmails: pick(sheet, "ADMIN_EMAILS", process.env.ADMIN_EMAILS, "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

export async function getHrRecipient(): Promise<{ name: string; email: string }> {
  const c = await getConfig();
  return { name: c.hrName, email: c.hrEmail };
}

/** The day's slots, generated from the sheet's timing settings. */
export async function getSlots(): Promise<SlotDef[]> {
  const c = await getConfig();
  return buildSlots({
    facilityStart: c.facilityStart,
    matchMinutes: c.matchMinutes,
    gapMinutes: c.gapMinutes,
    slotCount: c.slotCount,
  });
}

/* ------------------------------------------------------------------ *
 * Admin: read / write the Config tab from the admin panel
 * ------------------------------------------------------------------ */

export interface ConfigRow {
  key: string;
  value: string;
  description: string;
}

/** Every known setting with its current sheet value (or the built-in
 *  default), plus any extra rows someone added to the tab by hand. */
export async function listConfigRows(): Promise<ConfigRow[]> {
  let sheetRows: ConfigRow[] = [];
  try {
    const t = await readTable(TAB.Config);
    sheetRows = t.rows
      .filter((r) => (r["Key"] || "").trim())
      .map((r) => ({
        key: (r["Key"] || "").trim(),
        value: (r["Value"] || "").trim(),
        description: (r["Description"] || "").trim(),
      }));
  } catch {
    /* tab not provisioned — fall through to defaults */
  }
  const bySheet = new Map(sheetRows.map((r) => [r.key, r]));
  const out: ConfigRow[] = DEFAULT_CONFIG.map((d) => {
    const s = bySheet.get(d.key);
    return { key: d.key, value: s ? s.value : d.value, description: (s && s.description) || d.description };
  });
  for (const r of sheetRows) {
    if (!DEFAULT_CONFIG.some((d) => d.key === r.key)) out.push(r);
  }
  return out;
}

const EDITABLE_KEYS = new Set(DEFAULT_CONFIG.map((d) => d.key));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSetting(key: string, raw: string, requesterEmail: string): string {
  const v = String(raw ?? "").trim();
  switch (key) {
    case "FACILITY_START":
    case "FACILITY_END": {
      const m = v.match(/^(\d{1,2}):(\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
        throw new HttpError(400, `${key} must be a 24-hour time like 13:00.`);
      }
      return `${m[1].padStart(2, "0")}:${m[2]}`;
    }
    case "MATCH_MINUTES":
    case "SLOT_COUNT":
    case "BOOKING_HORIZON_DAYS": {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${key} must be a whole number of at least 1.`);
      return String(n);
    }
    case "GAP_MINUTES": {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${key} must be 0 or a positive whole number.`);
      return String(n);
    }
    case "ALLOW_RATING_EDIT": {
      if (/^(true|yes|1|on)$/i.test(v)) return "TRUE";
      if (/^(false|no|0|off)$/i.test(v)) return "FALSE";
      throw new HttpError(400, "ALLOW_RATING_EDIT must be TRUE or FALSE.");
    }
    case "ADMIN_EMAILS": {
      const list = [...new Set(v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
      if (!list.length) throw new HttpError(400, "At least one admin email is required.");
      for (const e of list) if (!EMAIL_RE.test(e)) throw new HttpError(400, `"${e}" isn't a valid email.`);
      if (!list.includes(requesterEmail.toLowerCase())) {
        throw new HttpError(400, "You can't remove your own admin access — keep your email in the list.");
      }
      return list.join(", ");
    }
    case "HR_ADMIN_EMAIL":
      if (v && !EMAIL_RE.test(v)) throw new HttpError(400, "HR_ADMIN_EMAIL must be a valid email or blank.");
      return v;
    default:
      return v;
  }
}

/** Apply admin edits to the Config tab. `updates` is a Key→Value map;
 *  unknown keys are ignored. Returns the fresh row list. */
export async function saveConfig(updates: Record<string, string>, requesterEmail: string): Promise<ConfigRow[]> {
  const keys = Object.keys(updates || {}).filter((k) => EDITABLE_KEYS.has(k));
  if (!keys.length) throw new HttpError(400, "Nothing editable in this request.");

  const clean: Record<string, string> = {};
  for (const k of keys) clean[k] = validateSetting(k, updates[k], requesterEmail);

  const t = await readTable(TAB.Config, { fresh: true });
  const rowByKey = new Map<string, number>();
  t.rows.forEach((r, i) => {
    const k = (r["Key"] || "").trim();
    if (k) rowByKey.set(k, t.rowNumbers[i]);
  });
  const descByKey = new Map(DEFAULT_CONFIG.map((d) => [d.key, d.description]));

  const toAppend: Record<string, unknown>[] = [];
  for (const [k, val] of Object.entries(clean)) {
    const rn = rowByKey.get(k);
    if (rn) await patchCells(TAB.Config, rn, { Value: val });
    else toAppend.push({ Key: k, Value: val, Description: descByKey.get(k) || "" });
  }
  if (toAppend.length) await appendRows(TAB.Config, toAppend);
  invalidate(TAB.Config);
  return listConfigRows();
}
