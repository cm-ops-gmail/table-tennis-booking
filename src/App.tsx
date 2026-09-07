import { useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, Navigate, useLocation } from "react-router-dom";
import { Button, cx } from "./components/ui";
import { Toaster } from "./components/Toaster";
import { getEmployee, initTheme, isDark, setEmployee, toggleTheme, useEmployee } from "./lib/session";
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

function Shell({ children }: { children: React.ReactNode }) {
  const employee = useEmployee();
  const navigate = useNavigate();
  const location = useLocation();

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
            <ThemeToggle />
            {employee && (
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium leading-tight">{employee.name}</div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {employee.department || employee.employeeId}
                  </div>
                </div>
                <span className="tt-brand-gradient hidden h-8 w-8 place-items-center rounded-full text-xs font-semibold text-primary-foreground sm:grid">
                  {employee.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmployee(null);
                    navigate("/login");
                  }}
                >
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main key={location.pathname} className="tt-rise mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-muted-foreground">
        🏓 Internal facility tool · Operating hours 1:00 PM – 5:30 PM · one match per person per day ·{" "}
        <Link to="/admin" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
          Admin
        </Link>
      </footer>
      <Toaster />
    </div>
  );
}

/** Standalone chrome for the admin area — no employee session required. */
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
            <ThemeToggle />
            <Link
              to="/login"
              className="rounded-md border border-input px-3 py-1.5 text-sm font-medium no-underline transition-colors hover:bg-accent"
            >
              Employee login
            </Link>
          </div>
        </div>
      </header>
      <main className="tt-rise mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-muted-foreground">
        🛠️ Admin area · separate sign-in from the employee booking portal
      </footer>
      <Toaster />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getEmployee()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <AdminShell>
            <Admin />
          </AdminShell>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Shell>
              <Routes>
                <Route path="/" element={<Book />} />
                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/rate" element={<Rate />} />
                <Route path="/play" element={<Play />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
