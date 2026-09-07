import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./_lib/app";

// Single Vercel serverless function. vercel.json rewrites /api/* here so the
// whole Express router (including nested /api/admin/*) resolves correctly.
const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
