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
