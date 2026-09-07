import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useEmployee } from "../lib/session";
import type { RatingQuestion } from "../shared/types";
import {
  Alert,
  BallLoader,
  Button,
  Card,
  CardContent,
  Field,
  Select,
  Textarea,
  cx,
} from "../components/ui";
import { toast } from "../components/Toaster";
import { burstConfetti } from "../lib/confetti";

interface Ratable {
  bookingId: string;
  date: string;
  slotLabel: string;
  players: string[];
  alreadyRated: boolean;
}

export default function Rate() {
  const employee = useEmployee()!;
  const [questions, setQuestions] = useState<RatingQuestion[]>([]);
  const [bookings, setBookings] = useState<Ratable[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [q, b] = await Promise.all([
          api<{ questions: RatingQuestion[] }>("/ratings/questions"),
          api<{ bookings: Ratable[] }>("/ratings/mine", { query: { employeeId: employee.employeeId } }),
        ]);
        setQuestions(q.questions);
        setBookings(b.bookings);
        const firstUnrated = b.bookings.find((x) => !x.alreadyRated) || b.bookings[0];
        if (firstUnrated) setBookingId(firstUnrated.bookingId);
      } catch (e) {
        setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Failed to load." });
      } finally {
        setLoading(false);
      }
    })();
  }, [employee.employeeId]);

  const selected = useMemo(() => bookings.find((b) => b.bookingId === bookingId), [bookings, bookingId]);

  useEffect(() => {
    setDone(false);
    setAnswers({});
  }, [bookingId]);

  function setAnswer(qid: string, v: string) {
    setAnswers((a) => ({ ...a, [qid]: v }));
  }

  async function submit() {
    setSubmitting(true);
    setMsg(null);
    try {
      await api("/ratings/submit", {
        body: {
          employeeId: employee.employeeId,
          employeeName: employee.name,
          bookingId,
          answers: Object.entries(answers)
            .filter(([, v]) => v !== "" && v != null)
            .map(([questionId, answer]) => ({ questionId, answer })),
        },
      });
      setMsg(null);
      setDone(true);
      burstConfetti({ count: 70 });
      toast("Feedback sent — thank you! 🙌", { tone: "success", desc: "HR can see your responses." });
      setBookings((bs) => bs.map((b) => (b.bookingId === bookingId ? { ...b, alreadyRated: true } : b)));
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Submit failed." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <BallLoader label="Loading your matches…" />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <span>⭐</span> Rate &amp; feedback
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell HR how the Table Tennis facility is working for you.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="tt-rise flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <span className="tt-float text-4xl">🏓</span>
          <p className="text-sm font-medium">No matches to rate yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Once you take part in a match it shows up here for feedback.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-5 pt-5">
            <Field label="Which match?">
              <Select value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
                {bookings.map((b) => (
                  <option key={b.bookingId} value={b.bookingId}>
                    {b.date} · {b.slotLabel} {b.alreadyRated ? "· (rated)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {selected && (
              <p className="text-xs text-muted-foreground">Players: {selected.players.join(", ")}</p>
            )}

            {done ? (
              <div className="tt-pop flex flex-col items-center gap-2 rounded-xl bg-[color:var(--success)]/10 py-10 text-center">
                <span className="text-4xl">🎉</span>
                <p className="text-sm font-semibold text-[color:var(--success)]">Feedback recorded</p>
                <p className="text-xs text-muted-foreground">Pick another match above to rate it too.</p>
              </div>
            ) : (
              <>
                {questions.length === 0 && <Alert tone="info">No active rating questions right now.</Alert>}

                {questions.map((q) => (
                  <Field key={q.questionId} label={q.text}>
                    <QuestionInput
                      q={q}
                      value={answers[q.questionId] ?? ""}
                      onChange={(v) => setAnswer(q.questionId, v)}
                    />
                  </Field>
                ))}

                {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

                <div className="flex justify-end">
                  <Button
                    onClick={submit}
                    loading={submitting}
                    disabled={!bookingId || questions.length === 0}
                  >
                    {submitting ? "Sending…" : "Submit feedback"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: RatingQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (q.type === "star") {
    const cur = Number(value);
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={cx(
              "tt-press text-3xl leading-none transition-transform hover:scale-125",
              cur >= n ? "text-[color:var(--chart-4)] drop-shadow-sm" : "text-muted-foreground/30"
            )}
            aria-label={`${n} star`}
          >
            <span key={cur >= n ? "on" : "off"} className={cur === n ? "tt-pop inline-block" : ""}>
              ★
            </span>
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "scale") {
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={cx(
              "h-9 w-9 rounded-md border text-sm font-medium transition-colors",
              value === String(n)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "yesno") {
    return (
      <div className="flex gap-2">
        {["Yes", "No"].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cx(
              "h-9 rounded-md border px-4 text-sm font-medium transition-colors",
              value === opt ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "choice") {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {q.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  }
  return <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your feedback…" />;
}
