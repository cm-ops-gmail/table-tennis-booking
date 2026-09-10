import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useTenMSAuth } from "@tenminuteschool/auth-admin-react";
import { Button, BallLoader, cx } from "./components/ui";
import { Toaster } from "./components/Toaster";
import { api } from "./lib/api";
import { to12h } from "./shared/slots";
import {
  initTheme,
  isDark,
  toggleTheme,
  getEmployee,
  useEmployee,
  useIsAdmin,
  resolveIdentity,
  signOut,
} from "./lib/session";
import Login from "./pages/Login";
import Book from "./pages/Book";
import MyBookings from "./pages/MyBookings";
import Rate from "./pages/Rate";
import Admin from "./pages/Admin";
import Play from "./pages/Play";

initTheme();

const NAV = [
  { to: "/", label: "Book a slot", emoji: "🏓", end: true },
  { to: "/my-bookings", label: "My bookings", emoji: "📅" },
  { to: "/rate", label: "Rate & feedback", emoji: "⭐" },
];

function ThemeToggle() {
  const [, force] = useState(0);
  const dark = isDark();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        toggleTheme();
        force((n) => n + 1);
      }}
      title={dark ? "Switch to light" : "Switch to dark"}
      className="overflow-hidden"
    >
      <span key={dark ? "d" : "l"} className="tt-pop text-base leading-none">
        {dark ? "☀︎" : "☾"}
      </span>
    </Button>
  );
}

/** Sign-out control shared by both shells — clears the 10MS SSO session and
 *  the roster identity, then lets <AuthGate> fall back to the login screen. */
function SignOutButton() {
  const { refresh } = useTenMSAuth();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await signOut();
        refresh();
      }}
    >
      Sign out
    </Button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const employee = useEmployee();
  const isAdmin = useIsAdmin();
  const location = useLocation();
  const { refresh } = useTenMSAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const initials = employee?.name.split(" ").map((w) => w[0]).slice(0, 2).join("") ?? "";
  // Operating hours are set in the sheet's Config tab now, not hardcoded —
  // fetch once so the footer never drifts from the real slot timing.
  const [hours, setHours] = useState<{ start: string; end: string } | null>(null);
  useEffect(() => {
    api<{ facility: { start: string; end: string } }>("/config")
      .then((c) => setHours(c.facility))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <div className="group flex select-none items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg shadow-sm transition-transform duration-300 group-hover:rotate-[8deg]">
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden text-foreground sm:inline">Table Tennis Booking</span>
          </div>

          <nav className="ml-1 flex items-center gap-0.5 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    "tt-press relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute inset-0 -z-10 rounded-lg bg-secondary" />
                    )}
                    <span className="text-xs">{n.emoji}</span>
                    <span className="hidden sm:inline">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/admin"
                className="tt-press hidden rounded-lg border border-input px-2.5 py-1.5 text-sm font-medium no-underline transition-colors hover:bg-accent sm:inline-block"
              >
                🛠️ Admin view
              </Link>
            )}
            <ThemeToggle />

            {/* Desktop: name + avatar + sign out */}
            {employee && (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="text-right">
                  <div className="text-sm font-medium leading-tight">{employee.name}</div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {employee.department || employee.employeeId}
                  </div>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </span>
                <SignOutButton />
              </div>
            )}

            {/* Mobile: hamburger holding what the top bar can't fit */}
            <div className="relative sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="text-lg leading-none">{menuOpen ? "✕" : "☰"}</span>
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-lg">
                    {employee && (
                      <div className="flex items-center gap-2 px-2 py-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium leading-tight">{employee.name}</div>
                          <div className="truncate text-xs leading-tight text-muted-foreground">
                            {employee.department || employee.employeeId}
                          </div>
                        </div>
                      </div>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium no-underline transition-colors hover:bg-accent"
                      >
                        🛠️ Admin view
                      </Link>
                    )}
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await signOut();
                        refresh();
                      }}
                      className="w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-accent"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        key={location.pathname}
        className={cx("tt-rise mx-auto max-w-6xl px-4", location.pathname === "/play" ? "pt-4 pb-2" : "py-6")}
      >
        {children}
      </main>

      {/* The game wants every spare pixel of height, so it skips the standard
          footer disclaimer rather than fight it for vertical space. */}
      {location.pathname !== "/play" && (
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-muted-foreground">
          🏓 Internal facility tool · Operating hours{" "}
          {hours ? `${to12h(hours.start)} – ${to12h(hours.end)}` : "1:00 PM – 5:30 PM"} · one match per person per
          day
          {isAdmin && (
            <>
              {" "}·{" "}
              <Link to="/admin" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                Admin
              </Link>
            </>
          )}
        </footer>
      )}
      <Toaster />
    </div>
  );
}

/** Chrome for the admin view. Reachable only by admins (route-guarded). */
function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/admin" className="group flex select-none items-center gap-2 font-semibold no-underline">
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg shadow-sm transition-transform duration-300 group-hover:rotate-[8deg]">
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden text-foreground sm:inline">Table Tennis · Admin</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/"
              className="tt-press rounded-lg border border-input px-2.5 py-1.5 text-sm font-medium no-underline transition-colors hover:bg-accent"
            >
              ← User view
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="tt-rise mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-muted-foreground">
        🛠️ Admin view · you also have the regular user view via “← User view” above
      </footer>
      <Toaster />
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-main-gray">
      <BallLoader label={label} />
    </div>
  );
}

function RosterError({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-main-gray p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="text-3xl">🚫</div>
        <h1 className="mt-2 text-lg font-semibold">Can’t sign you in</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" className="mt-4 w-full" onClick={onSignOut}>
          Sign out and try another account
        </Button>
      </div>
    </div>
  );
}

/**
 * Gates the whole app on a 10MS SSO session that also maps to a TT-roster
 * employee. Handles the initial session check (including a cross-app
 * `tenms_token` handoff, done by TenMSAuthProvider), then exchanges that
 * session for the roster identity via /auth/sso.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, refresh, error: handoffError } = useTenMSAuth();
  const employee = useEmployee();
  const [phase, setPhase] = useState<"idle" | "resolving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Re-check the identity against /auth/sso once per signed-in account (the
  // primitive `sub` dep means this fires on login, not on every render).
  // If there's already a cached employee we don't block on it — the store
  // update just refreshes name / admin status live — but if the server now
  // rejects us (removed from the roster, token dead) we sign out.
  const userKey = user?.sub ?? null;
  useEffect(() => {
    if (loading || !userKey) return;
    let alive = true;
    const hadCache = !!getEmployee();
    if (!hadCache) setPhase("resolving");
    resolveIdentity().then((r) => {
      if (!alive) return;
      if (r.ok) setPhase("idle");
      else if (!hadCache) {
        setErrorMsg(r.error);
        setPhase("error");
      } else {
        void signOut().then(() => refresh());
      }
    });
    return () => {
      alive = false;
    };
    // `refresh` is only touched in the reject branch; excluded so an
    // unstable identity from the provider can't re-trigger the check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userKey]);

  async function doLogout() {
    await signOut();
    refresh();
    setErrorMsg("");
    setPhase("idle");
  }

  if (loading) return <Splash label="Loading…" />;
  if (!user) return <Login handoffError={handoffError} />;
  if (phase === "error") return <RosterError message={errorMsg} onSignOut={doLogout} />;
  if (!employee) return <Splash label="Signing you in…" />;
  return <>{children}</>;
}

export default function App() {
  const isAdmin = useIsAdmin();
  return (
    <AuthGate>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route
          path="/admin"
          element={
            isAdmin ? (
              <AdminShell>
                <Admin />
              </AdminShell>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/*"
          element={
            <Shell>
              <Routes>
                <Route path="/" element={<Book />} />
                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/rate" element={<Rate />} />
                <Route path="/play" element={<Play />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          }
        />
      </Routes>
    </AuthGate>
  );
}
