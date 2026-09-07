import { readTable } from "./sheets.js";
import { TAB } from "./schema.js";
import type { Employee, EmployeeLite } from "../../src/shared/types.js";
import { HttpError } from "./util.js";

/** Map a variety of plausible header spellings to our canonical fields. */
const FIELD_ALIASES: Record<keyof Employee, string[]> = {
  employeeId: ["employee id", "emp id", "id", "employee_id", "empid", "employee code"],
  name: ["name", "employee name", "full name", "emp name"],
  email: ["email", "official email", "email address", "official email address", "work email", "e-mail"],
  department: ["department", "dept", "team", "division"],
  designation: ["designation", "title", "role", "position", "job title"],
  lineManagerName: [
    "line manager name",
    "line manager",
    "manager name",
    "manager",
    "reporting manager",
    "lm name",
    "supervisor",
  ],
  lineManagerEmail: [
    "line manager email",
    "manager email",
    "line manager mail",
    "lm email",
    "reporting manager email",
    "supervisor email",
  ],
};

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  // Spreadsheet error values (#N/A, #REF!, "#N/A ()", …) and bare dashes.
  if (!s || s === "-" || /^#[A-Za-z]/.test(s) || /^n\/?a$/i.test(s)) return "";
  return s;
}

function pick(row: Record<string, string>, headerIndex: Map<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const real = headerIndex.get(a);
    if (real && clean(row[real]) !== "") return clean(row[real]);
  }
  return "";
}

export async function listEmployees(): Promise<Employee[]> {
  const table = await readTable(TAB.TT);
  const headerIndex = new Map<string, string>();
  for (const h of table.headers) headerIndex.set(h.toLowerCase().trim(), h);

  const out: Employee[] = [];
  for (const row of table.rows) {
    const emp: Employee = {
      employeeId: pick(row, headerIndex, FIELD_ALIASES.employeeId),
      name: pick(row, headerIndex, FIELD_ALIASES.name),
      email: pick(row, headerIndex, FIELD_ALIASES.email).toLowerCase(),
      department: pick(row, headerIndex, FIELD_ALIASES.department),
      designation: pick(row, headerIndex, FIELD_ALIASES.designation),
      lineManagerName: pick(row, headerIndex, FIELD_ALIASES.lineManagerName),
      lineManagerEmail: pick(row, headerIndex, FIELD_ALIASES.lineManagerEmail).toLowerCase(),
    };
    if (!emp.name && !emp.email && !emp.employeeId) continue;
    // Fall back to a synthetic ID if the sheet omits one.
    if (!emp.employeeId) emp.employeeId = emp.email || emp.name;
    out.push(emp);
  }
  return out;
}

export function toLite(e: Employee): EmployeeLite {
  return { employeeId: e.employeeId, name: e.name, email: e.email, department: e.department };
}

export async function findByEmail(email: string): Promise<Employee | undefined> {
  const norm = email.trim().toLowerCase();
  return (await listEmployees()).find((e) => e.email === norm);
}

export async function findById(id: string): Promise<Employee | undefined> {
  const norm = id.trim().toLowerCase();
  return (await listEmployees()).find((e) => e.employeeId.toLowerCase() === norm);
}

/** Resolve a list of employee IDs to full records, erroring on any unknown id. */
export async function resolveIds(ids: string[]): Promise<Employee[]> {
  const all = await listEmployees();
  const byId = new Map(all.map((e) => [e.employeeId.toLowerCase(), e]));
  const resolved: Employee[] = [];
  for (const id of ids) {
    const e = byId.get(id.trim().toLowerCase());
    if (!e) throw new HttpError(400, `Unknown employee: ${id}`);
    resolved.push(e);
  }
  return resolved;
}
