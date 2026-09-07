import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useEmployee } from "../lib/session";
import type { Booking } from "../shared/types";
import { Alert, BallLoader, Badge, Button, Card, CardContent, cx } from "../components/ui";
import { toast } from "../components/Toaster";

function prettyDate(ymd: string) {
  return new Date(ymd + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyBookings() {
  const employee = useEmployee()!;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { bookings } = await api<{ bookings: Booking[] }>("/bookings", {
        query: { employeeId: employee.employeeId },
      });
      setBookings(bookings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, [employee.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(b: Booking) {
    if (!confirm(`Cancel your booking on ${prettyDate(b.date)} at ${b.slotLabel}?`)) return;
    setBusy(b.bookingId);
    setError("");
    try {
      await api("/bookings/cancel", { body: { bookingId: b.bookingId, requesterId: employee.employeeId } });
      toast("Booking cancelled", { tone: "info", desc: `${b.slotLabel} on ${prettyDate(b.date)} is free again.` });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cancel failed.");
    } finally {
      setBusy(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.status === "Confirmed" && b.date >= today);
  const past = bookings.filter((b) => !(b.status === "Confirmed" && b.date >= today));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <span>📅</span> My bookings
        </h1>
        <p className="text-sm text-muted-foreground">Matches you own or are part of. Only the owner can cancel.</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <BallLoader label="Fetching your matches…" />
      ) : bookings.length === 0 ? (
        <div className="tt-rise flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <span className="tt-float text-4xl">🏓</span>
          <p className="text-sm font-medium">No bookings yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Head to “Book a slot” to reserve your first match.
          </p>
        </div>
      ) : (
        <>
          <Section title="Upcoming" list={upcoming} employee={employee} onCancel={cancel} busy={busy} />
          <Section title="Past & cancelled" list={past} employee={employee} onCancel={cancel} busy={busy} muted />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  list,
  employee,
  onCancel,
  busy,
  muted,
}: {
  title: string;
  list: Booking[];
  employee: { employeeId: string };
  onCancel: (b: Booking) => void;
  busy: string | null;
  muted?: boolean;
}) {
  if (list.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {title}
        <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums">{list.length}</span>
      </h2>
      <div className="tt-stagger flex flex-col gap-3">
        {list.map((b) => {
          const isOwner = b.ownerId.toLowerCase() === employee.employeeId.toLowerCase();
          const cancellable =
            isOwner && b.status === "Confirmed" && b.date >= new Date().toISOString().slice(0, 10);
          return (
            <Card key={b.bookingId} hover className={muted ? "opacity-80" : ""}>
              <CardContent className="flex flex-wrap items-center gap-4 pt-5">
                <div
                  className={cx(
                    "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-center",
                    b.status === "Cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-[color:var(--chart-3)]/10 text-[color:var(--chart-3)]"
                  )}
                >
                  <span className="text-[10px] font-medium uppercase leading-none">
                    {new Date(b.date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-lg font-semibold leading-tight">
                    {new Date(b.date + "T00:00:00").getDate()}
                  </span>
                </div>
                <div className="min-w-[7rem]">
                  <div className="text-sm font-semibold">{b.slotLabel}</div>
                  <div className="text-xs text-muted-foreground">{prettyDate(b.date)}</div>
                </div>
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Players: </span>
                    {b.participants.map((p) => p.name).join(", ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Owner: {b.ownerName}
                    {isOwner ? " (you)" : ""} · #{b.bookingId}
                  </div>
                </div>
                <Badge tone={b.status === "Cancelled" ? "destructive" : "success"}>{b.status}</Badge>
                {cancellable && (
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={busy === b.bookingId}
                    onClick={() => onCancel(b)}
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
