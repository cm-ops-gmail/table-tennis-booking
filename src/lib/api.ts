import { auth } from "./auth";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  body?: unknown;
  /** Attach the 10MS SSO Bearer token (admin routes + /auth/sso). */
  admin?: boolean;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
};

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.admin || opts.auth) {
    const token = await auth.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url.toString(), {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data as T;
}
