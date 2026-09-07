import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { getEmployee, setEmployee } from "../lib/session";
import type { Employee } from "../shared/types";
import { Alert, Button, Card, CardContent, Field, Input } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (getEmployee()) navigate("/", { replace: true });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { employee } = await api<{ employee: Employee }>("/auth/login", { body: { email } });
      setEmployee(employee);
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-main-gray p-4">
      {/* animated ambient background */}
      <div
        aria-hidden
        className="tt-brand-gradient pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
      />
      <div
        aria-hidden
        className="tt-brand-gradient pointer-events-none absolute -bottom-48 -right-40 h-[32rem] w-[32rem] rounded-full opacity-20 blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
      {/* floating balls */}
      <span aria-hidden className="tt-float pointer-events-none absolute left-[12%] top-[18%] text-3xl opacity-70">🏓</span>
      <span aria-hidden className="tt-float-slow pointer-events-none absolute right-[14%] top-[26%] text-2xl opacity-60">🏓</span>
      <span aria-hidden className="tt-float pointer-events-none absolute bottom-[16%] left-[20%] text-2xl opacity-50" style={{ animationDelay: "-2s" }}>🏓</span>

      <div className="tt-rise relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="tt-brand-gradient grid h-11 w-11 place-items-center rounded-2xl text-xl text-primary-foreground shadow-lg">
            🏓
          </span>
          <div>
            <div className="font-semibold leading-tight">Table Tennis Booking</div>
            <div className="text-xs leading-tight text-muted-foreground">10 Minute School · internal facility</div>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardContent className="pt-5">
            <h1 className="text-lg font-semibold">Welcome back 👋</h1>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Sign in with your office email to grab a table.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Office email" hint="Use the email HR has on record for you.">
                <Input
                  type="email"
                  autoFocus
                  required
                  placeholder="you@10minuteschool.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {err && <Alert tone="error">{err}</Alert>}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? "Checking…" : "Let's play →"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          1:00 PM – 5:30 PM · 30-minute matches · 2–4 players · one match per person per day
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Administrator?{" "}
          <Link to="/admin" className="font-medium text-foreground underline decoration-dotted underline-offset-2">
            Sign in here →
          </Link>
        </p>
      </div>
    </div>
  );
}
