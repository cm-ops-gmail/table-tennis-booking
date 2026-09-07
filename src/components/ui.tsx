import React, { createContext, useContext, useEffect, useRef, useState } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- Button ---------------- */
type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type BtnSize = "sm" | "md" | "lg" | "icon";

const BTN_BASE =
  "tt-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,opacity,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:opacity-90 hover:shadow-md",
  secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-primary-foreground shadow-sm hover:opacity-90 hover:shadow-md",
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4",
  lg: "h-10 px-6",
  icon: "h-9 w-9",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({
  className,
  hover,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        hover && "tt-hover-lift hover:border-foreground/20",
        className
      )}
      {...rest}
    />
  );
}
export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("flex flex-col gap-1 p-5 pb-3", className)} {...rest} />;
}
export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx("text-base font-semibold leading-none tracking-tight", className)} {...rest} />;
}
export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("text-sm text-muted-foreground", className)} {...rest} />;
}
export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-5 pt-0", className)} {...rest} />;
}

/* ---------------- Badge ---------------- */
type BadgeTone = "neutral" | "success" | "warning" | "destructive" | "info" | "muted";
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-transparent bg-primary text-primary-foreground",
  success: "border-transparent bg-[color:var(--success)] text-primary-foreground",
  warning: "border-transparent bg-[color:var(--warning)] text-primary-foreground",
  destructive: "border-transparent bg-destructive text-primary-foreground",
  info: "border-transparent bg-[color:var(--chart-3)] text-white",
  muted: "border border-border bg-secondary text-secondary-foreground",
};
export function Badge({
  tone = "neutral",
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
        className
      )}
      {...rest}
    />
  );
}

/* ---------------- Input / Label / Field ---------------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cx(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...rest}
    />
  )
);
Input.displayName = "Input";

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...rest}
    />
  );
}

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("text-sm font-medium leading-none", className)} {...rest} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------------- Spinner ---------------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin text-current", className || "h-5 w-5")} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

/* ---------------- BallLoader — a bouncing ping-pong ball ---------------- */
export function BallLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-14">
      <div className="relative h-16 w-16">
        <div
          className="absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 rounded-full bg-[color:var(--chart-4)] shadow-md"
          style={{ animation: "tt-bounce-ball 0.75s cubic-bezier(0.5,0.05,0.5,0.95) infinite" }}
        />
        <div className="absolute bottom-0 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-foreground/10 blur-[1px]" />
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

/* ---------------- AnimatedNumber — counts up on mount ---------------- */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
}

/* ---------------- Dialog ---------------- */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Lock scroll AND compensate for the vanishing scrollbar so the page
    // behind the modal doesn't visibly jump sideways.
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="tt-overlay-in fixed inset-0 z-50 flex min-h-full items-center justify-center overflow-y-auto bg-black/45 p-4 py-8 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cx(
          "tt-modal-in relative my-auto w-full rounded-2xl border border-border bg-card p-5 shadow-2xl",
          wide ? "max-w-2xl" : "max-w-md"
        )}
        role="dialog"
        aria-modal="true"
        style={{ willChange: "transform, opacity" }}
      >
        <button
          onClick={onClose}
          className="tt-press absolute right-3.5 top-3.5 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="pr-8 text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */
const TabsCtx = createContext<{ value: string; setValue: (v: string) => void } | null>(null);
export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsCtx.Provider value={{ value, setValue: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "inline-flex flex-wrap items-center gap-1 rounded-lg bg-secondary p-1 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsCtx)!;
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cx(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsCtx)!;
  if (ctx.value !== value) return null;
  return <div className="mt-4">{children}</div>;
}

/* ---------------- misc ---------------- */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warning";
  children: React.ReactNode;
}) {
  const map = {
    info: "border-border bg-secondary text-secondary-foreground",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]",
    warning: "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]",
  };
  return <div className={cx("rounded-md border px-3 py-2 text-sm", map[tone])}>{children}</div>;
}
