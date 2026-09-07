/**
 * Slot configuration — shared by the API (validation, provisioning) and the
 * web client (rendering). Derived from the PRD:
 *   Operating window 1:00 PM – 5:30 PM, 30-minute matches, 10-minute gaps,
 *   so every booking cycle occupies a 40-minute interval. Seven slots per day.
 */

export const FACILITY_START = "13:00";
export const FACILITY_END = "17:30";
export const MATCH_MINUTES = 30;
export const GAP_MINUTES = 10;
export const SLOT_COUNT = 7;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export interface SlotDef {
  /** 1-based slot number, stable identifier used across the sheet. */
  id: number;
  /** e.g. "1:00 PM – 1:30 PM" */
  label: string;
  /** 24h "HH:MM" */
  start: string;
  /** 24h "HH:MM" */
  end: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}

export const SLOTS: SlotDef[] = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const startMin = toMinutes(FACILITY_START) + i * (MATCH_MINUTES + GAP_MINUTES);
  const endMin = startMin + MATCH_MINUTES;
  const start = fromMinutes(startMin);
  const end = fromMinutes(endMin);
  return {
    id: i + 1,
    start,
    end,
    label: `${to12h(start)} – ${to12h(end)}`,
  };
});

export function getSlot(id: number | string): SlotDef | undefined {
  return SLOTS.find((s) => s.id === Number(id));
}

export type SlotStatus = "available" | "booked" | "blocked" | "fullday";
