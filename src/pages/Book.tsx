import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useEmployee } from "../lib/session";
import type { DayAvailability, EmployeeLite, SlotView } from "../shared/types";
import {
  Alert,
  BallLoader,
  Button,
  Card,
  CardContent,
  Dialog,
  Field,
  Textarea,
  cx,
} from "../components/ui";
import { EmployeePicker } from "../components/EmployeePicker";
import { toast } from "../components/Toaster";
import { burstConfetti } from "../lib/confetti";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

const HYPE = [
  "Grab a paddle and a partner. 🏓",
  "Best of three?",
  "Winner stays on. 😎",
  "First serve is yours.",
  "Loser buys chai. ☕",
  "Spin it like you mean it.",
];

function WelcomeHero({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % HYPE.length), 2800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="tt-brand-gradient pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-20 blur-2xl" />
      <div className="tt-brand-gradient pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full opacity-15 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <span className="tt-float shrink-0 text-4xl sm:text-5xl">🏓</span>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            10 Minute School · Table Tennis
          </div>
          <h1 className="mt-0.5 text-xl font-semibold sm:text-2xl">
            Hey {name}, ready to play?
          </h1>
          <p key={i} className="tt-rise mt-1 text-sm text-muted-foreground">
            {HYPE[i]}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Pure calendar-date arithmetic, entirely in UTC so the result never
 *  depends on the visitor's browser timezone. Parsing "YYYY-MM-DDT00:00:00"
 *  as local time and then re-serializing via toISOString() (UTC) used to
 *  silently cancel out a +1 day in any timezone ahead of UTC (Asia/Dhaka
 *  included, where this tool actually runs) — the Next button looked like
 *  it did nothing. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function prettyDate(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function relativeLabel(ymd: string, today: string): string {
  if (ymd === today) return "Today";
  if (ymd === addDays(today, 1)) return "Tomorrow";
  return "";
}

const STATUS_META: Record<
  SlotView["status"],
  { label: string; dot: string; chip: string }
> = {
  available: {
    label: "Available",
    dot: "bg-[color:var(--success)]",
    chip: "bg-[color:var(--success)]/12 text-[color:var(--success)]",
  },
  booked: {
    label: "Booked",
    dot: "bg-[color:var(--info)]",
    chip: "bg-[color:var(--info)]/12 text-[color:var(--info)]",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-[color:var(--warning)]",
    chip: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  },
  fullday: { label: "Unavailable", dot: "bg-muted-foreground", chip: "bg-secondary text-muted-foreground" },
  past: { label: "Time passed", dot: "bg-muted-foreground/60", chip: "bg-secondary text-muted-foreground" },
};

export default function Book() {
  const employee = useEmployee()!;
  const [cfg, setCfg] = useState<{ today: string; horizonDays: number } | null>(null);
  const [date, setDate] = useState<string>("");
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalSlot, setModalSlot] = useState<SlotView | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [justBooked, setJustBooked] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api<{ today: string; horizonDays: number }>("/config");
        setCfg(c);
        setDate(c.today);
        const e = await api<{ employees: EmployeeLite[] }>("/employees");
        setEmployees(e.employees);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load.");
      }
    })();
  }, []);

  const loadDay = useCallback(
    async (d: string) => {
      setLoading(true);
      setError("");
      try {
        const av = await api<DayAvailability>("/availability", {
          query: { date: d, viewerId: employee.employeeId },
        });
        setDay(av);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load availability.");
      } finally {
        setLoading(false);
      }
    },
    [employee.employeeId]
  );

  useEffect(() => {
    if (date) loadDay(date);
  }, [date, loadDay]);

  const maxDate = cfg ? addDays(cfg.today, cfg.horizonDays) : "";
  const canPrev = cfg ? date > cfg.today : false;
  const canNext = cfg ? date < maxDate : false;
  const openCount = day?.slots.filter((s) => s.status === "available").length ?? 0;

  function openBooking(slot: SlotView) {
    setModalSlot(slot);
    setParticipants([]);
    setNotes("");
    setModalError("");
  }

  async function confirmBooking() {
    if (!modalSlot) return;
    const slotId = modalSlot.id;
    const label = modalSlot.label;
    setSubmitting(true);
    setModalError("");
    try {
      await api("/bookings", {
        body: { ownerId: employee.employeeId, participantIds: participants, date, slotId, notes },
      });
      setModalSlot(null);
      setJustBooked(slotId);
      burstConfetti();
      toast("You're on the table! 🏓", {
        tone: "success",
        desc: `${label} · ${prettyDate(date)}. Everyone's been notified.`,
      });
      await loadDay(date);
      setTimeout(() => setJustBooked(null), 1400);
    } catch (e) {
      setModalError(e instanceof ApiError ? e.message : "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelSlot(slot: SlotView) {
    if (!slot.booking) return;
    if (!confirm(`Cancel your booking for ${slot.label}? This frees the slot and notifies everyone.`)) return;
    try {
      await api("/bookings/cancel", {
        body: { bookingId: slot.booking.bookingId, requesterId: employee.employeeId },
      });
      toast("Booking cancelled", { tone: "info", desc: `${slot.label} is open again.` });
      loadDay(date);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cancel failed.");
    }
  }

  const totalPlayers = participants.length + 1;
  const playerValid = totalPlayers >= MIN_PLAYERS && totalPlayers <= MAX_PLAYERS;
  const rel = cfg ? relativeLabel(date, cfg.today) : "";

  return (
    <div className="flex flex-col gap-5">
      <WelcomeHero name={employee.name} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pick a date, grab an open slot, and add 1–3 teammates.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={!canPrev} onClick={() => setDate(addDays(date, -1))}>
            ‹
          </Button>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={date}
            min={cfg?.today}
            max={maxDate}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <Button variant="outline" size="icon" disabled={!canNext} onClick={() => setDate(addDays(date, 1))}>
            ›
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{date && prettyDate(date)}</span>
              {rel && (
                <span className="tt-pop rounded-full bg-[color:var(--info)]/12 px-2 py-0.5 text-xs font-medium text-[color:var(--info)]">
                  {rel}
                </span>
              )}
              {!loading && !day?.fullDayBlocked && (
                <span className="text-xs text-muted-foreground">
                  · {openCount} open slot{openCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(["available", "booked", "blocked"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </span>
              ))}
              {day?.slots.some((s) => s.status === "past") && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cx("h-2 w-2 rounded-full", STATUS_META.past.dot)} />
                  {STATUS_META.past.label}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <BallLoader label="Loading slots…" />
          ) : day?.fullDayBlocked ? (
            <div className="tt-rise flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-14 text-center">
              <span className="text-4xl">🚧</span>
              <p className="text-sm font-medium">The table is closed on {prettyDate(date)}</p>
              {day.fullDayReason && <p className="text-sm text-muted-foreground">{day.fullDayReason}</p>}
            </div>
          ) : (
            <div key={date} className="tt-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {day?.slots.map((slot, idx) => {
                const meta = STATUS_META[slot.status];
                const mine = slot.booking?.isMine;
                const isNew = justBooked === slot.id;
                const avail = slot.status === "available";
                const booked = slot.status === "booked";
                return (
                  <div
                    key={slot.id}
                    className={cx(
                      "tt-hover-lift group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border p-4",
                      avail &&
                        "border-border bg-gradient-to-br from-card to-[color:var(--success)]/[0.05] hover:border-[color:var(--success)]/60",
                      slot.status === "blocked" &&
                        "border-[color:var(--warning)]/25 bg-[color:var(--warning)]/[0.06]",
                      slot.status === "fullday" && "border-border bg-secondary/40",
                      slot.status === "past" && "border-border bg-secondary/30 opacity-70",
                      booked &&
                        !mine &&
                        "tt-booked-card border-[color:var(--info)]/45 bg-gradient-to-br from-[color:var(--info)]/[0.09] to-[color:var(--info)]/[0.02]",
                      booked &&
                        mine &&
                        "tt-mine-card border-[color:var(--success)]/55 bg-gradient-to-br from-[color:var(--success)]/[0.12] to-[color:var(--success)]/[0.03]",
                      isNew && "tt-pop"
                    )}
                  >
                    {/* status accent strip */}
                    <span
                      className={cx(
                        "absolute inset-x-0 top-0 h-1",
                        mine ? "bg-[color:var(--success)]" : booked ? "bg-[color:var(--info)]" : meta.dot
                      )}
                    />

                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[15px] font-semibold tabular-nums">{slot.label}</div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Slot {idx + 1} · 30 min
                        </div>
                      </div>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          mine ? "bg-[color:var(--info)]/12 text-[color:var(--info)]" : meta.chip
                        )}
                      >
                        {mine ? "Your match" : meta.label}
                      </span>
                    </div>

                    {avail && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="flex gap-1">
                          {[0, 1, 2, 3].map((d) => (
                            <span key={d} className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]/40" />
                          ))}
                        </span>
                        room for up to 4 players
                      </div>
                    )}

                    {booked && slot.booking && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {slot.booking.players.length} player
                          {slot.booking.players.length === 1 ? "" : "s"}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {slot.booking!.players.map((p, k) => {
                            const isOwner =
                              p.employeeId.toLowerCase() === slot.booking!.ownerId.toLowerCase();
                            return (
                              <span
                                key={p.employeeId + k}
                                className={cx(
                                  "tt-chip-pop inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs",
                                  isOwner
                                    ? "border-[color:var(--info)]/40 bg-[color:var(--info)]/10 text-[color:var(--info)]"
                                    : "border-border bg-card text-foreground"
                                )}
                                style={{ animationDelay: `${k * 45}ms` }}
                                title={p.employeeId}
                              >
                                {p.employeeId}
                                {isOwner && <span className="text-[10px]">👑</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {slot.status === "blocked" && (
                      <div className="flex items-center gap-1.5 text-xs text-[color:var(--warning)]">
                        <span>🔧</span>
                        {slot.blockReason || "Blocked by admin"}
                      </div>
                    )}
                    {slot.status === "past" && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>🕓</span>
                        This slot&apos;s time has passed.
                      </div>
                    )}

                    <div className="mt-auto pt-1">
                      {avail && (
                        <Button className="w-full" onClick={() => openBooking(slot)}>
                          Book this slot 🏓
                        </Button>
                      )}
                      {slot.status === "past" && (
                        <div className="h-8 rounded-md bg-secondary/60 text-center text-xs leading-8 text-muted-foreground">
                          No longer bookable
                        </div>
                      )}
                      {slot.status === "booked" && slot.booking?.canCancel && (
                        <Button size="sm" variant="destructive" className="w-full" onClick={() => cancelSlot(slot)}>
                          Cancel booking
                        </Button>
                      )}
                      {slot.status === "booked" && !slot.booking?.canCancel && (
                        <div className="h-8 rounded-md bg-secondary/60 text-center text-xs leading-8 text-muted-foreground">
                          {mine ? "You're in this match" : "Booked"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consolation: play the computer while you wait for a free slot */}
      <Link
        to="/play"
        className="tt-hover-lift group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 no-underline"
      >
        <div className="tt-brand-gradient pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl" />
        <span className="tt-float shrink-0 text-3xl">🕹️</span>
        <div className="relative min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            Didn&apos;t get a slot? No worries.
          </div>
          <div className="text-xs text-muted-foreground">
            Play a quick game of table tennis against the computer, right here.
          </div>
        </div>
        <span className="relative shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform group-hover:translate-x-0.5">
          Play now 🏓
        </span>
      </Link>

      <Dialog
        open={!!modalSlot}
        onClose={() => setModalSlot(null)}
        title={`Book ${modalSlot?.label ?? ""}`}
        description={`${prettyDate(date)} · you're the booking owner and can cancel later.`}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setModalSlot(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={confirmBooking} loading={submitting} disabled={!playerValid}>
              {submitting ? "Booking…" : `Confirm · ${totalPlayers} ${totalPlayers === 1 ? "player" : "players"}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
            <span className="tt-brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-primary-foreground">
              {employee.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span>
              <span className="font-medium">{employee.name}</span> · {employee.employeeId}
              <span className="text-muted-foreground"> — booking owner</span>
            </span>
          </div>

          <Field
            label="Add teammates / opponents"
            hint={`${MIN_PLAYERS}–${MAX_PLAYERS} players total. Anyone already booked that day can't be added.`}
          >
            <EmployeePicker
              all={employees}
              selected={participants}
              ownerId={employee.employeeId}
              max={MAX_PLAYERS}
              onChange={setParticipants}
            />
          </Field>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: MAX_PLAYERS }).map((_, i) => (
              <span
                key={i}
                className={cx(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i < totalPlayers ? "bg-[color:var(--success)]" : "bg-secondary"
                )}
              />
            ))}
            <span className="ml-2 text-xs tabular-nums text-muted-foreground">{totalPlayers}/{MAX_PLAYERS}</span>
          </div>

          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. doubles practice" />
          </Field>

          {!playerValid && (
            <p className="text-xs text-muted-foreground">
              {totalPlayers < MIN_PLAYERS
                ? `Add at least ${MIN_PLAYERS - totalPlayers} more player.`
                : `Remove ${totalPlayers - MAX_PLAYERS} player.`}
            </p>
          )}
          {modalError && (
            <Alert tone="error">
              {modalError}
              {/rated their last match/i.test(modalError) && (
                <>
                  {" "}
                  <Link to="/rate" className="font-medium underline underline-offset-2">
                    Go rate it →
                  </Link>
                </>
              )}
            </Alert>
          )}
        </div>
      </Dialog>
    </div>
  );
}
