import { useMemo, useRef, useState } from "react";
import type { EmployeeLite } from "../shared/types";
import { cx } from "./ui";

export function EmployeePicker({
  all,
  selected,
  ownerId,
  max,
  onChange,
  owing,
}: {
  all: EmployeeLite[];
  selected: string[];
  ownerId: string;
  max: number;
  onChange: (ids: string[]) => void;
  /** lower-cased ids that owe feedback and can't be added */
  owing?: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(all.map((e) => [e.employeeId, e])), [all]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((e) => e.employeeId !== ownerId && !selected.includes(e.employeeId))
      .filter(
        (e) =>
          !needle ||
          e.name.toLowerCase().includes(needle) ||
          e.email.toLowerCase().includes(needle) ||
          e.employeeId.toLowerCase().includes(needle) ||
          e.department.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [all, q, selected, ownerId]);

  const add = (id: string) => {
    onChange([...selected, id]);
    setQ("");
    inputRef.current?.focus();
  };
  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  const atMax = selected.length + 1 >= max;

  return (
    <div className="relative">
      {/* One box: chips + the search field live together, like any tag input */}
      <div
        onMouseDown={(e) => {
          // clicking anywhere in the box focuses the field (but let the chip
          // remove buttons handle their own clicks)
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
        className="flex min-h-[2.5rem] cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring"
      >
        {selected.map((id) => {
          const e = byId.get(id);
          return (
            <span
              key={id}
              className="tt-pop inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {e ? e.name : id}
              <button
                type="button"
                onClick={() => remove(id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${e?.name ?? id}`}
              >
                ✕
              </button>
            </span>
          );
        })}
        {!atMax && (
          <input
            ref={inputRef}
            className="min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
            placeholder={
              selected.length === 0 ? "Type a name, ID, email or team to add players…" : "Add another…"
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        )}
        {atMax && (
          <span className="py-0.5 text-muted-foreground">Maximum {max} players reached</span>
        )}
      </div>

      {open && !atMax && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-2 py-2 text-sm text-muted-foreground">
              {q.trim() ? `No one matches “${q.trim()}”.` : "Start typing to search."}
            </li>
          ) : (
            results.map((e) => {
              const owes = owing?.has(e.employeeId.toLowerCase());
              return (
                <li key={e.employeeId}>
                  <button
                    type="button"
                    disabled={owes}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => !owes && add(e.employeeId)}
                    className={cx(
                      "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                      owes ? "cursor-not-allowed" : "hover:bg-accent"
                    )}
                  >
                    <div className={cx("flex items-center justify-between gap-2", owes && "opacity-55")}>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{e.name}</span>{" "}
                        <span className="text-muted-foreground">· {e.department || "—"}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.employeeId}</span>
                    </div>
                    {owes && (
                      <div className="mt-0.5 text-xs leading-snug text-[color:var(--warning)]">
                        Hasn&apos;t given feedback on their previous match — they need to do that before you can
                        add them.
                      </div>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
