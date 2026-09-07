import { useSyncExternalStore } from "react";
import type { Employee } from "../shared/types";

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
