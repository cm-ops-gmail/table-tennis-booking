import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  desc?: string;
  emoji?: string;
}

let toasts: Toast[] = [];
const subs = new Set<() => void>();
let seq = 0;

function emit() {
  for (const s of subs) s();
}

export function toast(
  title: string,
  opts: { tone?: ToastTone; desc?: string; emoji?: string; duration?: number } = {}
) {
  const id = ++seq;
  const t: Toast = {
    id,
    title,
    tone: opts.tone ?? "info",
    desc: opts.desc,
    emoji: opts.emoji ?? (opts.tone === "success" ? "🏓" : opts.tone === "error" ? "⚠️" : "•"),
  };
  toasts = [...toasts, t];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    emit();
  }, opts.duration ?? 4200);
}

const TONE: Record<ToastTone, string> = {
  success: "border-[color:var(--success)]/40",
  error: "border-destructive/40",
  info: "border-border",
};

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => toasts,
    () => toasts
  );

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9998] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${TONE[t.tone]} bg-card/95 p-3 shadow-lg backdrop-blur`}
          style={{ animation: "tt-toast-in 0.32s cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <span className="text-lg leading-none">{t.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.desc && <div className="mt-0.5 text-xs text-muted-foreground">{t.desc}</div>}
          </div>
          <button
            onClick={() => {
              toasts = toasts.filter((x) => x.id !== t.id);
              emit();
            }}
            className="text-muted-foreground/70 transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
