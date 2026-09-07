import { google, sheets_v4 } from "googleapis";
import * as mem from "./memstore.js";

/* ------------------------------------------------------------------ *
 * Auth + client
 * ------------------------------------------------------------------ */

let _memChecked = false;
function MEMORY(): boolean {
  const on = process.env.TT_MEMORY_SHEET === "1";
  if (on && !_memChecked) {
    _memChecked = true;
    mem.memSeed();
  }
  return on;
}

let _client: sheets_v4.Sheets | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function spreadsheetId(): string {
  return required("GOOGLE_SPREADSHEET_ID");
}

export function sheetsClient(): sheets_v4.Sheets {
  if (_client) return _client;
  const auth = new google.auth.JWT(
    required("GOOGLE_CLIENT_EMAIL"),
    undefined,
    required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  _client = google.sheets({ version: "v4", auth });
  return _client;
}

/* ------------------------------------------------------------------ *
 * Generic table access (rows as header-keyed objects)
 * ------------------------------------------------------------------ */

export interface Table {
  tab: string;
  headers: string[];
  /** row objects, index-aligned with `rowNumbers` */
  rows: Record<string, string>[];
  /** 1-based sheet row number for each row (header is row 1) */
  rowNumbers: number[];
}

interface CacheEntry {
  at: number;
  table: Table;
}
const _cache = new Map<string, CacheEntry>();
const CACHE_MS = 4000;

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function readTable(tab: string, opts: { fresh?: boolean } = {}): Promise<Table> {
  if (MEMORY()) return mem.memReadTable(tab);
  if (!opts.fresh) {
    const c = _cache.get(tab);
    if (c && Date.now() - c.at < CACHE_MS) return c.table;
  }
  const client = sheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A1:ZZ100000`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = (res.data.values || []) as unknown[][];
  const headers = (values[0] || []).map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i] || [];
    if (raw.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (!h) return;
      obj[h] = raw[j] == null ? "" : String(raw[j]);
    });
    rows.push(obj);
    rowNumbers.push(i + 1);
  }
  const table: Table = { tab, headers, rows, rowNumbers };
  _cache.set(tab, { at: Date.now(), table });
  return table;
}

export function invalidate(tab?: string): void {
  if (tab) _cache.delete(tab);
  else _cache.clear();
}

function toRowArray(headers: string[], obj: Record<string, unknown>): (string | number)[] {
  return headers.map((h) => {
    const v = obj[h];
    if (v == null) return "";
    if (typeof v === "number") return v;
    return String(v);
  });
}

export async function appendRows(tab: string, objects: Record<string, unknown>[]): Promise<void> {
  if (objects.length === 0) return;
  if (MEMORY()) return mem.memAppendRows(tab, objects);
  const table = await readTable(tab, { fresh: true });
  const client = sheetsClient();
  await client.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objects.map((o) => toRowArray(table.headers, o)) },
  });
  invalidate(tab);
}

export async function updateRow(tab: string, rowNumber: number, obj: Record<string, unknown>): Promise<void> {
  if (MEMORY()) return mem.memUpdateRow(tab, rowNumber, obj);
  const table = await readTable(tab, { fresh: true });
  const client = sheetsClient();
  const endCol = colLetter(Math.max(table.headers.length, 1));
  await client.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A${rowNumber}:${endCol}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [toRowArray(table.headers, obj)] },
  });
  invalidate(tab);
}

/** Patch specific columns of a row without rewriting the whole row. */
export async function patchCells(
  tab: string,
  rowNumber: number,
  patch: Record<string, unknown>
): Promise<void> {
  if (MEMORY()) return mem.memPatchCells(tab, rowNumber, patch);
  const table = await readTable(tab, { fresh: true });
  const client = sheetsClient();
  const data: sheets_v4.Schema$ValueRange[] = [];
  for (const [key, val] of Object.entries(patch)) {
    const idx = table.headers.indexOf(key);
    if (idx === -1) continue;
    const col = colLetter(idx + 1);
    data.push({ range: `${tab}!${col}${rowNumber}`, values: [[val == null ? "" : (val as string)]] });
  }
  if (data.length === 0) return;
  await client.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
  invalidate(tab);
}

/* ------------------------------------------------------------------ *
 * Provisioning helpers
 * ------------------------------------------------------------------ */

export async function listTabs(): Promise<string[]> {
  if (MEMORY()) return mem.memListTabs();
  const client = sheetsClient();
  const meta = await client.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  return (meta.data.sheets || []).map((s) => s.properties?.title || "");
}

export async function createTab(title: string, headers: string[]): Promise<void> {
  if (MEMORY()) return mem.memCreateTab(title, headers);
  const client = sheetsClient();
  await client.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  await client.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });
  await client.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: await sheetIdByTitle(title), startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
        { updateSheetProperties: { properties: { sheetId: await sheetIdByTitle(title), gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      ],
    },
  });
  invalidate(title);
}

export async function sheetIdByTitle(title: string): Promise<number> {
  const client = sheetsClient();
  const meta = await client.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const s = (meta.data.sheets || []).find((x) => x.properties?.title === title);
  if (!s?.properties?.sheetId && s?.properties?.sheetId !== 0) throw new Error(`Tab not found: ${title}`);
  return s.properties.sheetId;
}

export async function ensureHeaders(title: string, headers: string[]): Promise<void> {
  if (MEMORY()) return mem.memCreateTab(title, headers);
  const client = sheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${title}!1:1`,
  });
  const existing = (res.data.values?.[0] || []).map((h) => String(h).trim());
  const missing = headers.filter((h) => !existing.includes(h));
  if (missing.length === 0) return;
  const merged = [...existing.filter(Boolean), ...missing];
  await client.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [merged] },
  });
  invalidate(title);
}
