/**
 * In-memory stand-in for the Google Sheets backend. Enabled with
 * TT_MEMORY_SHEET=1 — used by `scripts/smoke.ts` and handy for a no-Google
 * local demo. Data lives only for the process lifetime.
 */
import type { Table } from "./sheets.js";
import { HEADERS, DEFAULT_QUESTIONS } from "./schema.js";

type Grid = string[][]; // includes header row at index 0

const db = new Map<string, Grid>();

function ensure(tab: string): Grid {
  if (!db.has(tab)) {
    const headers = HEADERS[tab] || ["A"];
    db.set(tab, [[...headers]]);
  }
  return db.get(tab)!;
}

export function memReadTable(tab: string): Table {
  const grid = ensure(tab);
  const headers = grid[0].map((h) => String(h).trim());
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i] || [];
    if (raw.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = raw[j] == null ? "" : String(raw[j]);
    });
    rows.push(obj);
    rowNumbers.push(i + 1);
  }
  return { tab, headers, rows, rowNumbers };
}

export function memAppendRows(tab: string, objects: Record<string, unknown>[]): void {
  const grid = ensure(tab);
  const headers = grid[0];
  for (const o of objects) {
    grid.push(headers.map((h) => (o[h] == null ? "" : String(o[h]))));
  }
}

export function memUpdateRow(tab: string, rowNumber: number, obj: Record<string, unknown>): void {
  const grid = ensure(tab);
  const headers = grid[0];
  grid[rowNumber - 1] = headers.map((h) => (obj[h] == null ? "" : String(obj[h])));
}

export function memPatchCells(tab: string, rowNumber: number, patch: Record<string, unknown>): void {
  const grid = ensure(tab);
  const headers = grid[0];
  const row = grid[rowNumber - 1] || [];
  for (const [k, v] of Object.entries(patch)) {
    const idx = headers.indexOf(k);
    if (idx === -1) continue;
    while (row.length <= idx) row.push("");
    row[idx] = v == null ? "" : String(v);
  }
  grid[rowNumber - 1] = row;
}

export function memListTabs(): string[] {
  return [...db.keys()];
}

export function memCreateTab(title: string, headers: string[]): void {
  if (!db.has(title)) db.set(title, [[...headers]]);
}

let seeded = false;
export function memSeed(): void {
  if (seeded) return;
  seeded = true;
  for (const tab of Object.keys(HEADERS)) ensure(tab);

  memAppendRows(
    "RatingQuestions",
    DEFAULT_QUESTIONS.map((d, i) => ({
      "Question ID": `Q-SEED${i + 1}`,
      Order: i + 1,
      "Question Text": d.text,
      Type: d.type,
      Options: d.options || "",
      Active: "TRUE",
      "Created At": new Date().toISOString(),
    }))
  );
  memAppendRows("TT", [
    { "Employee ID": "E1", Name: "Alice Rahman", Email: "alice@10ms.test", Department: "Tech", Designation: "SWE", "Line Manager Name": "Mgr One", "Line Manager Email": "mgr1@10ms.test" },
    { "Employee ID": "E2", Name: "Bob Karim", Email: "bob@10ms.test", Department: "Tech", Designation: "SWE", "Line Manager Name": "Mgr One", "Line Manager Email": "mgr1@10ms.test" },
    { "Employee ID": "E3", Name: "Carol Islam", Email: "carol@10ms.test", Department: "Marketing", Designation: "Exec", "Line Manager Name": "Mgr Two", "Line Manager Email": "mgr2@10ms.test" },
    { "Employee ID": "E4", Name: "Dan Ahmed", Email: "dan@10ms.test", Department: "HR", Designation: "Exec", "Line Manager Name": "Mgr Two", "Line Manager Email": "mgr2@10ms.test" },
    { "Employee ID": "E5", Name: "Eve Chowdhury", Email: "eve@10ms.test", Department: "Academics", Designation: "Lead", "Line Manager Name": "Mgr Three", "Line Manager Email": "mgr3@10ms.test" },
  ]);
}
