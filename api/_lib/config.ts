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
import { readTable } from "./sheets.js";
import { TAB } from "./schema.js";
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
  const fromSheet = sheet.get(key);
  if (fromSheet) return fromSheet;
  if (envFallback) return envFallback;
  return hardDefault;
}

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
    facilityStart: pick(sheet, "FACILITY_START", process.env.FACILITY_START, "13:00"),
    facilityEnd: pick(sheet, "FACILITY_END", process.env.FACILITY_END, "17:30"),
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
