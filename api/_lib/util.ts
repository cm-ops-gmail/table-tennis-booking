export function nowIso(): string {
  return new Date().toISOString();
}

export function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`.toUpperCase();
}

/** YYYY-MM-DD for a Date, in the given IANA tz (default Asia/Dhaka). */
export function ymd(d: Date = new Date(), tz = "Asia/Dhaka"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/** "HH:MM" (24h) for right now, in the given IANA tz (default Asia/Dhaka). */
export function hhmmNow(tz = "Asia/Dhaka"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${hour}:${get("minute")}`;
}

/**
 * Coerce whatever the Bookings/Blocks "Date" cell hands back to `YYYY-MM-DD`.
 * If the column ends up formatted as a Date in the sheet, a USER_ENTERED
 * write turns "2026-09-10" into a date and FORMATTED_VALUE reads it back as
 * "9/10/2026" / "10-Sep-2026" / a serial number — none of which the app's
 * string comparisons expect. This normalises all of those back.
 */
export function normDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already canonical
  const isoDt = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/); // ISO datetime
  if (isoDt) return `${isoDt[1]}-${isoDt[2]}-${isoDt[3]}`;
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    // Google Sheets serial (days since 1899-12-30); 25569 = 1970-01-01.
    const n = Number(s);
    if (n > 20000 && n < 90000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const d = new Date(s); // "9/10/2026", "Sep 10, 2026", "10-Sep-2026", …
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return s;
}

/** Same idea for a "Start Time"/"End Time" cell → 24h `HH:MM`. */
export function normTime(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const ap = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ap) {
    let h = Number(ap[1]) % 12;
    if (/p/i.test(ap[3])) h += 12;
    return `${String(h).padStart(2, "0")}:${ap[2]}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  if (/^0?\.\d+$/.test(s)) {
    const mins = Math.round(Number(s) * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return s;
}

export function truthy(v: string | undefined | null): boolean {
  if (v == null) return false;
  return ["true", "yes", "y", "1", "active", "x", "✓"].includes(String(v).trim().toLowerCase());
}

export function splitList(v: string | undefined | null): string[] {
  if (!v) return [];
  return String(v)
    .split(/[|,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
