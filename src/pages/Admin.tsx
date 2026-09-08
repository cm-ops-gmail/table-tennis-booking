import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, getAdminToken, setAdminToken } from "../lib/api";
import { useEmployee } from "../lib/session";
import type {
  AdminStats,
  Booking,
  BlockedDate,
  BlockedSlot,
  DayAvailability,
  EmployeeLite,
  RatingQuestion,
} from "../shared/types";
import { SLOTS } from "../shared/slots";
import { EmployeePicker } from "../components/EmployeePicker";
import { toast } from "../components/Toaster";
import { burstConfetti } from "../lib/confetti";

interface PlayerRow {
  employeeId: string;
  name: string;
  department: string;
  total: number;
  owned: number;
  cancelled: number;
  lastPlayed: string;
}
interface Overview {
  stats: AdminStats;
  recent: Booking[];
  participation: PlayerRow[];
  recentRaters: { employeeId: string; name: string; bookingId: string; submittedAt: string }[];
}
import {
  Alert,
  AnimatedNumber,
  BallLoader,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cx,
} from "../components/ui";

export default function Admin() {
  const [authed, setAuthed] = useState<boolean>(!!getAdminToken());
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("dashboard");

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { token } = await api<{ token: string }>("/auth/admin", { body: { password } });
      setAdminToken(token);
      setAuthed(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl text-primary-foreground shadow-md">
            🛠️
          </span>
          <h1 className="text-lg font-semibold">Admin sign-in</h1>
          <p className="text-sm text-muted-foreground">
            This is a separate sign-in from the employee booking portal — just the shared admin
            password, no office email needed.
          </p>
        </div>
        <Card className="shadow-lg">
          <CardContent className="pt-5">
            <form onSubmit={login} className="flex flex-col gap-3">
              <Input
                type="password"
                autoFocus
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {err && <Alert tone="error">{err}</Alert>}
              <Button type="submit" loading={loading} className="w-full">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <span>🛠️</span> Admin panel
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAdminToken(null);
            setAuthed(false);
          }}
        >
          Sign out
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">📊 Dashboard</TabsTrigger>
          <TabsTrigger value="players">🏆 Players</TabsTrigger>
          <TabsTrigger value="bookings">📒 Bookings</TabsTrigger>
          <TabsTrigger value="slots">⛔ Slot blocking</TabsTrigger>
          <TabsTrigger value="dates">🚧 Date blocking</TabsTrigger>
          <TabsTrigger value="questions">❓ Rating questions</TabsTrigger>
          <TabsTrigger value="reports">⭐ Feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <Dashboard onJump={setTab} />
        </TabsContent>
        <TabsContent value="players">
          <PlayersAdmin />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsAdmin />
        </TabsContent>
        <TabsContent value="slots">
          <SlotBlocking />
        </TabsContent>
        <TabsContent value="dates">
          <DateBlocking />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsAdmin />
        </TabsContent>
        <TabsContent value="reports">
          <RatingReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { data, loading, error, reload: run };
}

function Loader() {
  return <BallLoader label="Loading…" />;
}

function prettyDate(ymd: string) {
  return new Date(ymd + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const MEDAL = ["🥇", "🥈", "🥉"];

const SLOT_DOT: Record<string, string> = {
  available: "bg-[color:var(--success)]",
  booked: "bg-[color:var(--info)]",
  blocked: "bg-[color:var(--warning)]",
  fullday: "bg-muted-foreground",
};

/* ---------------- Today's schedule ---------------- */
function TodaySchedule() {
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api<{ today: string }>("/config");
        const av = await api<DayAvailability>("/availability", { query: { date: cfg.today } });
        setDay(av);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load today's schedule.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            🗓️ Today&apos;s schedule{day ? <span className="text-muted-foreground"> · {prettyDate(day.date)}</span> : ""}
          </h3>
        </div>
        {loading ? (
          <Loader />
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : day?.fullDayBlocked ? (
          <Alert tone="warning">
            The facility is closed today{day.fullDayReason ? ` — ${day.fullDayReason}` : ""}.
          </Alert>
        ) : (
          <div className="tt-stagger grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {day?.slots.map((slot) => (
              <div key={slot.id} className="rounded-lg border border-border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium tabular-nums">{slot.label}</span>
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", SLOT_DOT[slot.status])} />
                </div>
                <div className="mt-1 truncate text-muted-foreground">
                  {slot.status === "available" && "Open"}
                  {slot.status === "booked" &&
                    slot.booking &&
                    `${slot.booking.ownerName}${slot.booking.players.length > 1 ? ` +${slot.booking.players.length - 1}` : ""}`}
                  {slot.status === "blocked" && (slot.blockReason || "Blocked")}
                  {slot.status === "fullday" && "Unavailable"}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ onJump }: { onJump: (t: string) => void }) {
  const { data, loading, error } = useAsync(
    () => api<Overview>("/admin/overview", { admin: true }),
    []
  );
  if (loading) return <Loader />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;
  const s = data.stats;
  const cards = [
    ["Total bookings", s.totalBookings, "📒", "var(--chart-3)"],
    ["Today", s.todayBookings, "🏓", "var(--success)"],
    ["Upcoming", s.upcomingBookings, "⏭️", "var(--chart-2)"],
    ["Cancelled", s.cancelledBookings, "✖️", "var(--destructive)"],
    ["Blocked slots", s.blockedSlots, "⛔", "var(--warning)"],
    ["Blocked days", s.blockedDates, "🚧", "var(--warning)"],
    ["Ratings submitted", s.totalRatings, "⭐", "var(--chart-4)"],
  ] as const;
  const top = data.participation.slice(0, 5);
  return (
    <div className="flex flex-col gap-5">
      <TodaySchedule />

      <div className="tt-stagger grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map(([label, value, emoji, color]) => (
          <Card key={label} hover className="relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: color as string }} />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-semibold tabular-nums">
                  <AnimatedNumber value={value as number} />
                </div>
                <span className="text-lg opacity-80">{emoji}</span>
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">🏆 Top players</h3>
              <button
                className="text-xs font-medium text-[color:var(--chart-3)] hover:underline"
                onClick={() => onJump("players")}
              >
                View leaderboard →
              </button>
            </div>
            {top.length === 0 ? (
              <EmptyState title="No matches played yet" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {top.map((p, i) => (
                  <div key={p.employeeId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/60">
                    <span className="w-6 text-center">{MEDAL[i] || i + 1}</span>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.department || "—"}</span>
                    <span className="tabular-nums font-semibold">{p.total}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">⭐ Recent feedback</h3>
              <button
                className="text-xs font-medium text-[color:var(--chart-3)] hover:underline"
                onClick={() => onJump("reports")}
              >
                Open feedback →
              </button>
            </div>
            {data.recentRaters.length === 0 ? (
              <EmptyState title="No feedback submitted yet" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.recentRaters.map((r) => (
                  <div key={r.bookingId + r.employeeId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/60">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-[10px] font-semibold">
                      {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 text-sm font-semibold">Recent bookings</h3>
          <BookingTable rows={data.recent} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Players / leaderboard ---------------- */
function PlayersAdmin() {
  const { data, loading, error } = useAsync(
    () => api<Overview>("/admin/overview", { admin: true }),
    []
  );
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const all = data?.participation ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.employeeId.toLowerCase().includes(needle) ||
            p.department.toLowerCase().includes(needle)
        )
      : all;
    return needle || showAll ? filtered : filtered.slice(0, 20);
  }, [data, q, showAll]);

  if (loading) return <Loader />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const total = data.participation.length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            🏆 Leaderboard <span className="text-muted-foreground">· {total} players</span>
          </h3>
          <Input
            className="max-w-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a player by name / team…"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState title={q ? "No player matches that search" : "No matches played yet"} />
        ) : (
          <>
            {/* Mobile: one card per player. Desktop: a real table. */}
            <div className="flex flex-col gap-2 sm:hidden">
              {rows.map((p) => {
                const rank = data.participation.indexOf(p) + 1;
                return (
                  <div key={p.employeeId} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center">{MEDAL[rank - 1] || rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.employeeId} · {p.department || "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold tabular-nums">{p.total}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">matches</div>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>As owner: {p.owned}</span>
                      <span>Cancelled: {p.cancelled}</span>
                      <span>{p.lastPlayed ? prettyDate(p.lastPlayed) : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 w-10">#</th>
                    <th className="py-1.5 pr-4">Player</th>
                    <th className="py-1.5 pr-4">Team</th>
                    <th className="py-1.5 pr-4 text-right">Matches</th>
                    <th className="py-1.5 pr-4 text-right">As owner</th>
                    <th className="py-1.5 pr-4 text-right">Cancelled</th>
                    <th className="py-1.5 pr-4">Last played</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const rank = data.participation.indexOf(p) + 1;
                    return (
                      <tr key={p.employeeId} className="border-t border-border">
                        <td className="py-1.5 pr-3 tabular-nums">{MEDAL[rank - 1] || rank}</td>
                        <td className="py-1.5 pr-4">
                          <span className="font-medium">{p.name}</span>{" "}
                          <span className="text-xs text-muted-foreground">· {p.employeeId}</span>
                        </td>
                        <td className="py-1.5 pr-4">{p.department || "—"}</td>
                        <td className="py-1.5 pr-4 text-right font-semibold tabular-nums">{p.total}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{p.owned}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{p.cancelled}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">
                          {p.lastPlayed ? prettyDate(p.lastPlayed) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!q && total > 20 && (
          <button
            className="self-start text-xs font-medium text-[color:var(--chart-3)] hover:underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 20 only" : `Show all ${total} players`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function BookingTable({ rows }: { rows: Booking[] }) {
  if (rows.length === 0) return <EmptyState title="No bookings" />;
  return (
    <>
      {/* Mobile: one card per booking. Desktop: a real table. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((b) => (
          <div key={b.bookingId} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{prettyDate(b.date)}</div>
                <div className="text-xs text-muted-foreground">{b.slotLabel}</div>
              </div>
              <Badge tone={b.status === "Cancelled" ? "destructive" : "success"}>{b.status}</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Owner: {b.ownerName}</div>
            <div className="text-xs text-muted-foreground">
              Players: {b.participants.map((p) => p.name).join(", ")}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-4">Date</th>
              <th className="py-1.5 pr-4">Slot</th>
              <th className="py-1.5 pr-4">Owner</th>
              <th className="py-1.5 pr-4">Players</th>
              <th className="py-1.5 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.bookingId} className="border-t border-border align-top">
                <td className="py-1.5 pr-4 whitespace-nowrap">{prettyDate(b.date)}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">{b.slotLabel}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">{b.ownerName}</td>
                <td className="py-1.5 pr-4">{b.participants.map((p) => p.name).join(", ")}</td>
                <td className="py-1.5 pr-4">
                  <Badge tone={b.status === "Cancelled" ? "destructive" : "success"}>{b.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- Bookings admin ---------------- */
function BookingsAdmin() {
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { bookings } = await api<{ bookings: Booking[] }>("/admin/bookings", {
        admin: true,
        query: { date, employee, status },
      });
      setRows(bookings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [date, employee, status]);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">All bookings</h3>
          <Button onClick={() => setCreating(true)}>+ New booking</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Employee (name / ID / email)">
            <Input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Search…" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={search} loading={loading}>
              Apply
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDate("");
                setEmployee("");
                setStatus("");
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <BookingTable rows={rows} />
      </CardContent>

      {creating && (
        <AdminBookingDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            search();
          }}
        />
      )}
    </Card>
  );
}

function AdminBookingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [today, setToday] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState(String(SLOTS[0].id));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [e, c] = await Promise.all([
        api<{ employees: EmployeeLite[] }>("/employees"),
        api<{ today: string }>("/config"),
      ]);
      setEmployees(e.employees);
      setToday(c.today);
      setDate(c.today);
    })();
  }, []);

  const owner = employees.find((e) => e.employeeId === ownerId);
  const totalPlayers = participants.length + (ownerId ? 1 : 0);
  const valid = ownerId && date && totalPlayers >= 2 && totalPlayers <= 4;

  async function create() {
    setBusy(true);
    setErr("");
    try {
      await api("/admin/bookings", {
        admin: true,
        body: { ownerId, participantIds: participants, date, slotId: Number(slotId), notes },
      });
      burstConfetti({ count: 60 });
      toast("Booking created", { tone: "success", desc: `${owner?.name} · ${date}` });
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New booking (as admin)"
      description="Same rules apply — 2–4 players, one match per person that day."
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} loading={busy} disabled={!valid}>
            Create booking
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Booking owner">
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.name} · {e.department || e.employeeId}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Slot">
            <Select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              {SLOTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Other players" hint={`${totalPlayers}/4 selected`}>
          {ownerId ? (
            <EmployeePicker
              all={employees}
              selected={participants}
              ownerId={ownerId}
              max={4}
              onChange={setParticipants}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Choose an owner first.</p>
          )}
        </Field>

        <Field label="Notes (optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. inter-team friendly" />
        </Field>

        {err && <Alert tone="error">{err}</Alert>}
      </div>
    </Dialog>
  );
}

/* ---------------- Slot blocking ---------------- */
function SlotBlocking() {
  const { data, loading, error, reload } = useAsync(
    () => api<{ slots: BlockedSlot[]; dates: BlockedDate[] }>("/admin/blocks", { admin: true }),
    []
  );
  const employee = useEmployee();
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState(String(SLOTS[0].id));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [edit, setEdit] = useState<BlockedSlot | null>(null);

  async function submit() {
    setBusy(true);
    setFormErr("");
    try {
      await api("/admin/blocks/slot", {
        admin: true,
        body: { date, slotId: Number(slotId), reason, by: employee?.name || "admin" },
      });
      setReason("");
      setDate("");
      reload();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Slot">
            <Select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              {SLOTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Table maintenance" />
          </Field>
          <div className="flex items-end">
            <Button onClick={submit} loading={busy} disabled={!date}>
              Block slot
            </Button>
          </div>
          {formErr && (
            <div className="sm:col-span-4">
              <Alert tone="error">{formErr}</Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 text-sm font-semibold">Blocked slots</h3>
          {loading ? (
            <Loader />
          ) : error ? (
            <Alert tone="error">{error}</Alert>
          ) : !data?.slots.length ? (
            <EmptyState title="No slots blocked" />
          ) : (
            <div className="flex flex-col gap-2">
              {data.slots.map((b) => (
                <div
                  key={b.blockId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{prettyDate(b.date)}</span>
                  <span>{b.slotLabel}</span>
                  <span className="text-muted-foreground">{b.reason || "—"}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEdit(b)}>
                      Edit note
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await api(`/admin/blocks/slot/${b.blockId}`, { admin: true, method: "DELETE" });
                        reload();
                      }}
                    >
                      Unblock
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditNoteDialog
        open={!!edit}
        initial={edit?.reason || ""}
        onClose={() => setEdit(null)}
        onSave={async (r) => {
          await api("/admin/blocks/note", { admin: true, body: { kind: "slot", blockId: edit!.blockId, reason: r } });
          setEdit(null);
          reload();
        }}
      />
    </div>
  );
}

/* ---------------- Date blocking ---------------- */
function DateBlocking() {
  const { data, loading, error, reload } = useAsync(
    () => api<{ slots: BlockedSlot[]; dates: BlockedDate[] }>("/admin/blocks", { admin: true }),
    []
  );
  const employee = useEmployee();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [edit, setEdit] = useState<BlockedDate | null>(null);

  async function submit() {
    setBusy(true);
    setFormErr("");
    try {
      await api("/admin/blocks/date", {
        admin: true,
        body: { date, reason, by: employee?.name || "admin" },
      });
      setReason("");
      setDate("");
      reload();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Office event" />
          </Field>
          <div className="flex items-end">
            <Button onClick={submit} loading={busy} disabled={!date}>
              Block whole day
            </Button>
          </div>
          {formErr && (
            <div className="sm:col-span-3">
              <Alert tone="error">{formErr}</Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 text-sm font-semibold">Blocked days</h3>
          {loading ? (
            <Loader />
          ) : error ? (
            <Alert tone="error">{error}</Alert>
          ) : !data?.dates.length ? (
            <EmptyState title="No full-day blocks" />
          ) : (
            <div className="flex flex-col gap-2">
              {data.dates.map((b) => (
                <div
                  key={b.blockId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{prettyDate(b.date)}</span>
                  <span className="text-muted-foreground">{b.reason || "—"}</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEdit(b)}>
                      Edit note
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await api(`/admin/blocks/date/${b.blockId}`, { admin: true, method: "DELETE" });
                        reload();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditNoteDialog
        open={!!edit}
        initial={edit?.reason || ""}
        onClose={() => setEdit(null)}
        onSave={async (r) => {
          await api("/admin/blocks/note", { admin: true, body: { kind: "date", blockId: edit!.blockId, reason: r } });
          setEdit(null);
          reload();
        }}
      />
    </div>
  );
}

function EditNoteDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (r: string) => Promise<void>;
}) {
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(initial), [initial, open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Update block note"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(val);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Textarea value={val} onChange={(e) => setVal(e.target.value)} />
    </Dialog>
  );
}

/* ---------------- Questions admin ---------------- */
const Q_TYPES = [
  { value: "star", label: "Star rating" },
  { value: "scale", label: "Scale 1–5" },
  { value: "yesno", label: "Yes / No" },
  { value: "choice", label: "Multiple choice" },
  { value: "text", label: "Open text" },
];

function QuestionsAdmin() {
  const { data, loading, error, reload } = useAsync(
    () => api<{ questions: RatingQuestion[] }>("/admin/questions", { admin: true }),
    []
  );
  const [modal, setModal] = useState<null | RatingQuestion | "new">(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setModal("new")}>Add question</Button>
      </div>
      {loading ? (
        <Loader />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !data?.questions.length ? (
        <EmptyState title="No questions yet" hint="Add your first rating question." />
      ) : (
        <div className="flex flex-col gap-2">
          {data.questions.map((q) => (
            <Card key={q.questionId}>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
                <div className="flex items-start gap-2 sm:flex-1 sm:items-center">
                  <span className="shrink-0 text-xs text-muted-foreground">#{q.order}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{q.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {Q_TYPES.find((t) => t.value === q.type)?.label}
                      {q.type === "choice" && q.options.length ? ` · ${q.options.join(", ")}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={q.active ? "success" : "muted"}>{q.active ? "Active" : "Inactive"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await api(`/admin/questions/${q.questionId}`, { admin: true, method: "PUT", body: { active: !q.active } });
                      reload();
                    }}
                  >
                    {q.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal(q)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm("Delete this question? Existing responses are kept.")) return;
                      await api(`/admin/questions/${q.questionId}`, { admin: true, method: "DELETE" });
                      reload();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <QuestionDialog
          question={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function QuestionDialog({
  question,
  onClose,
  onSaved,
}: {
  question: RatingQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(question?.text ?? "");
  const [type, setType] = useState(question?.type ?? "star");
  const [options, setOptions] = useState((question?.options ?? []).join(", "));
  const [order, setOrder] = useState(String(question?.order ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    const payload = {
      text,
      type,
      options: options.split(",").map((s) => s.trim()).filter(Boolean),
      order: order ? Number(order) : undefined,
    };
    try {
      if (question) {
        await api(`/admin/questions/${question.questionId}`, { admin: true, method: "PUT", body: payload });
      } else {
        await api("/admin/questions", { admin: true, body: payload });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={question ? "Edit question" : "New rating question"}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!text.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Question text">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as RatingQuestion["type"])}>
              {Q_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order">
            <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="auto" />
          </Field>
        </div>
        {type === "choice" && (
          <Field label="Options (comma separated)">
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Good, Average, Poor" />
          </Field>
        )}
        {err && <Alert tone="error">{err}</Alert>}
      </div>
    </Dialog>
  );
}

/* ---------------- Rating reports ---------------- */
interface Report {
  totalResponses: number;
  respondents: number;
  byQuestion: {
    questionId: string;
    text: string;
    type: string;
    responseCount: number;
    average: number | null;
    distribution: Record<string, number>;
  }[];
  respondentsList: {
    employeeId: string;
    name: string;
    answers: number;
    matchesRated: number;
    lastAt: string;
  }[];
  raw: {
    responseId: string;
    submittedAt: string;
    bookingId: string;
    employeeName: string;
    questionText: string;
    answer: string;
  }[];
}

function RatingReports() {
  const { data, loading, error } = useAsync(() => api<Report>("/admin/ratings", { admin: true }), []);
  const [who, setWho] = useState("");
  if (loading) return <Loader />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const avgStars = data.byQuestion
    .filter((q) => q.average != null)
    .reduce((acc, q, _i, arr) => acc + (q.average as number) / arr.length, 0);
  const respondents = data.respondentsList.filter(
    (r) => !who || r.name.toLowerCase().includes(who.trim().toLowerCase())
  );
  const feedback = data.raw.filter(
    (r) => !who || r.employeeName.toLowerCase().includes(who.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="tt-stagger grid gap-3 sm:grid-cols-3">
        <Card hover>
          <CardContent className="pt-5">
            <div className="text-2xl font-semibold tabular-nums">
              <AnimatedNumber value={data.totalResponses} />
            </div>
            <div className="text-xs text-muted-foreground">Total answers</div>
          </CardContent>
        </Card>
        <Card hover>
          <CardContent className="pt-5">
            <div className="text-2xl font-semibold tabular-nums">
              <AnimatedNumber value={data.respondents} />
            </div>
            <div className="text-xs text-muted-foreground">People who gave feedback</div>
          </CardContent>
        </Card>
        <Card hover>
          <CardContent className="pt-5">
            <div className="text-2xl font-semibold tabular-nums">
              {avgStars ? avgStars.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Avg rating (star + scale)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Who reviewed</h3>
            <Input
              className="max-w-xs"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Filter by name…"
            />
          </div>
          {respondents.length === 0 ? (
            <EmptyState title="No feedback yet" />
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:hidden">
                {respondents.map((r) => (
                  <div key={r.employeeId} className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.employeeId}</div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{r.answers} answers</span>
                      <span>{r.matchesRated} matches rated</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last: {r.lastAt ? new Date(r.lastAt).toLocaleString() : "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-4">Employee</th>
                      <th className="py-1.5 pr-4 text-right">Answers</th>
                      <th className="py-1.5 pr-4 text-right">Matches rated</th>
                      <th className="py-1.5 pr-4">Last submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {respondents.map((r) => (
                      <tr key={r.employeeId} className="border-t border-border">
                        <td className="py-1.5 pr-4">
                          <span className="font-medium">{r.name}</span>{" "}
                          <span className="text-xs text-muted-foreground">· {r.employeeId}</span>
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{r.answers}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{r.matchesRated}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">
                          {r.lastAt ? new Date(r.lastAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {data.byQuestion.map((q) => (
        <Card key={q.questionId}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{q.text}</h3>
              <span className="text-xs text-muted-foreground">{q.responseCount} responses</span>
            </div>
            {q.average != null && (
              <div className="mt-2 text-lg font-semibold">
                {q.average}
                <span className="text-sm font-normal text-muted-foreground"> / 5 average</span>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-1.5">
              {Object.entries(q.distribution).map(([answer, count]) => {
                const pct = q.responseCount ? Math.round((count / q.responseCount) * 100) : 0;
                return (
                  <div key={answer} className="flex items-center gap-2 text-xs">
                    <span className="w-40 truncate text-muted-foreground">{answer || "(blank)"}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-[color:var(--chart-3)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">{count}</span>
                  </div>
                );
              })}
              {Object.keys(q.distribution).length === 0 && (
                <span className="text-xs text-muted-foreground">No responses yet.</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 text-sm font-semibold">
            All feedback {who && <span className="text-muted-foreground">· “{who}”</span>}
          </h3>
          {feedback.length === 0 ? (
            <EmptyState title="No feedback yet" />
          ) : (
            <>
              <div className="flex max-h-[32rem] flex-col gap-2 overflow-auto sm:hidden">
                {feedback.slice(0, 300).map((r) => (
                  <div key={r.responseId} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.employeeName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(r.submittedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.questionText}</div>
                    <div className="mt-1">{r.answer}</div>
                  </div>
                ))}
              </div>
              <div className="hidden max-h-[32rem] overflow-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-4">When</th>
                      <th className="py-1.5 pr-4">Employee</th>
                      <th className="py-1.5 pr-4">Question</th>
                      <th className="py-1.5 pr-4">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.slice(0, 300).map((r) => (
                      <tr key={r.responseId} className="border-t border-border align-top">
                        <td className="py-1.5 pr-4 whitespace-nowrap">
                          {new Date(r.submittedAt).toLocaleString()}
                        </td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{r.employeeName}</td>
                        <td className="py-1.5 pr-4">{r.questionText}</td>
                        <td className="py-1.5 pr-4">{r.answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
