/**
 * Posts a short "booking confirmed / cancelled" line to a Telegram group,
 * the instant a booking request completes — unlike the Notifications tab
 * outbox, this doesn't wait on the spreadsheet's Apps Script trigger.
 *
 * TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are plain env vars (set in .env
 * locally, in the Vercel project's env vars for production) — same as
 * GOOGLE_CLIENT_EMAIL etc. If either is unset, this is a silent no-op so
 * the integration stays optional. A failed Telegram call is logged but
 * never thrown — a booking must still succeed even if Telegram is down.
 */
import type { Booking } from "../../src/shared/types.js";

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-13" → "13 Sep". */
function shortDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || m[2]}`;
}

async function send(text: string): Promise<void> {
  // Same offline-test convention as auth.ts/emailFromToken: never make a
  // real network call in the memory-sheet test/QA backend.
  if (process.env.TT_MEMORY_SHEET === "1") return;
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("Telegram sendMessage failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("Telegram sendMessage error:", e instanceof Error ? e.message : e);
  }
}

function playerNames(b: Booking): string {
  return b.participants.map((p) => p.name).join(", ");
}

export async function notifyTelegramBookingConfirmed(b: Booking): Promise<void> {
  await send(
    `🏓 <b>Booking confirmed</b> — ${escapeHtml(shortDate(b.date))}, ${escapeHtml(b.slotLabel)}\n` +
      `Owner: ${escapeHtml(b.ownerName)} · Players: ${escapeHtml(playerNames(b))}`
  );
}

export async function notifyTelegramBookingCancelled(b: Booking): Promise<void> {
  await send(
    `🏓 <b>Booking cancelled</b> — ${escapeHtml(shortDate(b.date))}, ${escapeHtml(b.slotLabel)}\n` +
      `Owner: ${escapeHtml(b.ownerName)} · Players: ${escapeHtml(playerNames(b))}`
  );
}
