import { useSyncExternalStore } from "react";
import type { Employee } from "../shared/types";
import { api } from "./api";
import { auth } from "./auth";

const KEY = "tt_employee";
const listeners = new Set<() => void>();

// useSyncExternalStore requires a referentially stable snapshot: cache the
// parsed object and only rebuild it when the underlying string changes.
let _rawCache: string | null = null;
let _valCache: Employee | null = null;

function emit() {
  for (const l of listeners) l();
}

export function getEmployee(): Employee | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === _rawCache) return _valCache;
  _rawCache = raw;
  try {
    _valCache = raw ? (JSON.parse(raw) as Employee) : null;
  } catch {
    _valCache = null;
  }
  return _valCache;
}

export function setEmployee(e: Employee | null) {
  try {
    if (e) localStorage.setItem(KEY, JSON.stringify(e));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  _rawCache = e ? JSON.stringify(e) : null;
  _valCache = e;
  emit();
}

export function useEmployee(): Employee | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getEmployee,
    () => null
  );
}

/* ---- admin flag (from /auth/sso, alongside the employee record) ---- */
const ADMIN_KEY = "tt_is_admin";

export function getIsAdmin(): boolean {
  try {
    return localStorage.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setIsAdmin(v: boolean) {
  try {
    if (v) localStorage.setItem(ADMIN_KEY, "1");
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function useIsAdmin(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getIsAdmin,
    () => false
  );
}

/** Clear the resolved roster identity (does NOT touch the 10MS SSO session). */
export function clearSession() {
  setEmployee(null);
  setIsAdmin(false);
}

/** Full sign-out: end the 10MS SSO session and drop the roster identity.
 *  Callers should call the provider's refresh() right after. */
export async function signOut() {
  try {
    await auth.logout();
  } catch {
    /* revoke can fail offline / for an adopted token — clear locally anyway */
  }
  clearSession();
}

/**
 * Exchange the current 10MS SSO session for a roster identity: POST
 * /auth/sso (Bearer attached by api()), which matches the verified email
 * against the TT sheet and reports whether the person is an admin. Stores
 * the result; returns an error string if the account isn't on the roster.
 */
export async function resolveIdentity(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { employee, isAdmin } = await api<{ employee: Employee; isAdmin: boolean }>("/auth/sso", {
      method: "POST",
      auth: true,
    });
    setEmployee(employee);
    setIsAdmin(isAdmin);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sign-in failed." };
  }
}

/* ---- theme ---- */
const THEME_KEY = "tt_theme";
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}
export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}
export function isDark() {
  return document.documentElement.classList.contains("dark");
}
