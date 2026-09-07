/**
 * Runtime settings. Previously a sheet tab; now plain environment variables
 * with sensible fallbacks so the app runs with none of them set.
 *
 *   HR_ADMIN_EMAIL      recipient for the [HR] booking notifications
 *   HR_ADMIN_NAME       display name for that recipient (default "HR Admin")
 *   BOOKING_HORIZON_DAYS how many days ahead bookings open (default 14)
 *   ALLOW_RATING_EDIT   "true" (default) lets an employee re-submit a rating
 *   FACILITY_START / FACILITY_END  display-only strings for the UI
 */

export interface AppConfig {
  hrEmail: string;
  hrName: string;
  horizonDays: number;
  allowRatingEdit: boolean;
  facilityStart: string;
  facilityEnd: string;
}

export function getConfig(): AppConfig {
  const horizon = Number(process.env.BOOKING_HORIZON_DAYS);
  return {
    hrEmail: (process.env.HR_ADMIN_EMAIL || "").trim(),
    hrName: (process.env.HR_ADMIN_NAME || "HR Admin").trim(),
    horizonDays: Number.isFinite(horizon) && horizon > 0 ? horizon : 14,
    allowRatingEdit: (process.env.ALLOW_RATING_EDIT ?? "true").toLowerCase() !== "false",
    facilityStart: process.env.FACILITY_START || "1:00 PM",
    facilityEnd: process.env.FACILITY_END || "5:30 PM",
  };
}

export function getHrRecipient(): { name: string; email: string } {
  const c = getConfig();
  return { name: c.hrName, email: c.hrEmail };
}
