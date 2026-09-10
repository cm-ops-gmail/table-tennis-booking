import { TenMSAuth } from "@tenminuteschool/auth-admin-react";

/** From VITE_TENMS_CLIENT_ID — never hardcoded. Set it in .env.local for
 *  dev and in the Vercel project's env vars for production. */
export const CLIENT_ID = (import.meta.env.VITE_TENMS_CLIENT_ID as string | undefined)?.trim() || "";

/** False when VITE_TENMS_CLIENT_ID isn't set — the login page shows a
 *  configuration notice instead of a broken button. */
export const AUTH_CONFIGURED = CLIENT_ID.length > 0;

// TenMSAuth's constructor throws on an empty clientId, which would white-
// screen the whole app before the login page can explain what's wrong.
// Fall back to a placeholder so the app still renders; every real auth call
// is gated on AUTH_CONFIGURED anyway.
export const auth = new TenMSAuth({
  clientId: CLIENT_ID || "unconfigured",
  storage: "localStorage",
});
