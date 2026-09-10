import { useMemo, useRef, useState } from "react";
import type { EmployeeLite } from "../shared/types";
import { Badge, Input, cx } from "./ui";

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
  const boxRef = useRef<HTMLDivElement>(null);

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
    if (selected.length + 1 >= max) {
      // owner + selected already at max
    }
    onChange([...selected, id]);
    setQ("");
  };
  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  const atMax = selected.length + 1 >= max;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2">
        {selected.length === 0 && (
          <span className="px-1 py-0.5 text-sm text-muted-foreground">No additional players yet</span>
        )}
        {selected.map((id) => {
          const e = byId.get(id);
          return (
            <Badge key={id} tone="muted" className="tt-pop gap-1">
              {e ? e.name : id}
              <button
                type="button"
                onClick={() => remove(id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${e?.name ?? id}`}
              >
                ✕
              </button>
            </Badge>
          );
        })}
      </div>

      <Input
        className="mt-2"
        placeholder={atMax ? `Maximum ${max} players reached` : "Search employees by name, ID, email or team…"}
        value={q}
        disabled={atMax}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open && !atMax && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.map((e) => {
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
                      Hasn&apos;t given feedback on their previous match — they need to do that before you can add them.
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
