import { useState } from "react";
import { LoginButton, useTenMSAuth } from "@tenminuteschool/auth-admin-react";
import { auth, CLIENT_ID, AUTH_CONFIGURED } from "../lib/auth";
import { Alert, Card, CardContent } from "../components/ui";

/**
 * Sign-in screen. Rendered by <AuthGate> whenever there's no 10MS SSO
 * session. On success it just hands the response to the SDK and calls
 * refresh() — <AuthGate> then does the roster match via /auth/sso.
 */
export default function Login({ handoffError }: { handoffError?: Error | null }) {
  const { refresh } = useTenMSAuth();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-main-gray p-4">
      <div
        aria-hidden
        className="tt-brand-gradient pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
      />
      <div
        aria-hidden
        className="tt-brand-gradient pointer-events-none absolute -bottom-48 -right-40 h-[32rem] w-[32rem] rounded-full opacity-20 blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
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
              Sign in with your 10 Minute School account to grab a table.
            </p>

            {(err || handoffError) && (
              <div className="mb-3">
                <Alert tone="error">{err || handoffError?.message}</Alert>
              </div>
            )}

            {AUTH_CONFIGURED ? (
              <LoginButton
                clientId={CLIENT_ID}
                size="large"
                className="w-full"
                onSuccess={async (response) => {
                  setErr("");
                  setBusy(true);
                  try {
                    await auth.handleLoginSuccess(response);
                    refresh(); // AuthGate takes over from here (/auth/sso)
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Sign-in failed. Try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
                onError={(e) => setErr(e.message || "Sign-in failed. Try again.")}
              />
            ) : (
              <Alert tone="error">
                Sign-in isn’t configured — set <code>VITE_TENMS_CLIENT_ID</code> in the environment.
              </Alert>
            )}
            {busy && <p className="mt-3 text-center text-xs text-muted-foreground">Signing you in…</p>}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          1:00 PM – 5:30 PM · 30-minute matches · 2–4 players · one match per person per day
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Only accounts on the Table Tennis roster can sign in. Contact HR if yours isn’t.
        </p>
      </div>
    </div>
  );
}
