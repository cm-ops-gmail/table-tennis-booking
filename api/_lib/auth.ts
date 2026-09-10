/**
 * SSO identity resolution for "Login with 10MS".
 *
 * The browser signs in with @tenminuteschool/auth-admin-react and sends us
 * its access token as `Authorization: Bearer <token>`. We verify that token
 * against 10MS's own userinfo endpoint (so the email can't be spoofed by a
 * hand-crafted request), then match the verified email against the TT sheet
 * and the ADMIN_EMAILS config to decide what the person may see.
 *
 * Offline test mode (TT_MEMORY_SHEET=1) skips the network hop and trusts an
 * `x-tenms-email` header instead — that's how scripts/smoke.ts drives the
 * admin surface without a real OAuth round-trip.
 */
import type { Request } from "express";
import type { Employee } from "../../src/shared/types.js";
import { findByEmail } from "./employees.js";
import { getConfig } from "./config.js";
import { HttpError } from "./util.js";

const USERINFO_URL = "https://api.10minuteschool.com/auth/v1/oauth/userinfo";

/** token -> { email, at } — a short cache so a burst of admin calls doesn't
 *  hit userinfo once per request. Per serverless instance, 60s. */
const _tokenCache = new Map<string, { email: string; at: number }>();
const TOKEN_TTL_MS = 60_000;

function bearer(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Verify an SSO access token with 10MS and return the account's email. */
export async function emailFromToken(token: string): Promise<string> {
  const cached = _tokenCache.get(token);
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.email;

  let res: Response;
  try {
    res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new HttpError(502, "Could not reach the 10MS sign-in service. Try again.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  if (!res.ok) throw new HttpError(502, "The 10MS sign-in service returned an error. Try again.");

  const info = (await res.json().catch(() => null)) as { email?: string } | null;
  const email = (info?.email || "").trim().toLowerCase();
  if (!email) throw new HttpError(401, "That 10MS account has no email on record.");

  _tokenCache.set(token, { email, at: Date.now() });
  return email;
}

export interface Identity {
  email: string;
  employee: Employee;
  isAdmin: boolean;
}

/**
 * Resolve the caller to a roster employee + admin flag.
 *   - real mode: verifies the Bearer token via userinfo
 *   - TT_MEMORY_SHEET=1: trusts the `x-tenms-email` header (tests only)
 * Throws 401 if unauthenticated, 403 if the email isn't on the TT sheet.
 */
export async function resolveIdentity(req: Request): Promise<Identity> {
  let email: string;
  if (process.env.TT_MEMORY_SHEET === "1") {
    // Offline test/QA backend: no real token to verify. Trust the
    // x-tenms-email header (smoke.ts), or a Bearer value that's just a
    // plain email (scripts/shots.mjs seeds the SDK's token slot with one).
    const bt = bearer(req) || "";
    email = String(req.header("x-tenms-email") || (bt.includes("@") ? bt : "")).trim().toLowerCase();
    if (!email) throw new HttpError(401, "Not signed in.");
  } else {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Not signed in.");
    email = await emailFromToken(token);
  }

  const employee = await findByEmail(email);
  if (!employee) {
    throw new HttpError(403, "Your 10MS account isn't on the Table Tennis roster. Contact HR.");
  }
  const { adminEmails } = await getConfig();
  return { email, employee, isAdmin: adminEmails.includes(email) };
}
