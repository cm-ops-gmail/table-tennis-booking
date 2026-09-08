import { readTable, appendRows, patchCells } from "./sheets.js";
import { TAB } from "./schema.js";
import { genId, nowIso, truthy, splitList, HttpError } from "./util.js";
import type { QuestionType, RatingQuestion, RatingResponseRow } from "../../src/shared/types.js";
import { bookingsForEmployee, hasSlotStarted } from "./bookings.js";
import { getConfig } from "./config.js";

const TYPES: QuestionType[] = ["star", "scale", "yesno", "choice", "text"];

function parseQuestion(r: Record<string, string>): RatingQuestion {
  return {
    questionId: r["Question ID"],
    order: Number(r["Order"]) || 0,
    text: r["Question Text"] || "",
    type: (TYPES.includes(r["Type"] as QuestionType) ? r["Type"] : "text") as QuestionType,
    options: splitList(r["Options"]),
    active: truthy(r["Active"]),
    createdAt: r["Created At"] || "",
  };
}

export async function listQuestions(activeOnly = false): Promise<RatingQuestion[]> {
  const t = await readTable(TAB.RatingQuestions);
  let qs = t.rows.map(parseQuestion).filter((q) => q.text);
  if (activeOnly) qs = qs.filter((q) => q.active);
  return qs.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export async function addQuestion(input: {
  text: string;
  type: string;
  options?: string[];
  order?: number;
  active?: boolean;
}): Promise<RatingQuestion> {
  if (!input.text?.trim()) throw new HttpError(400, "Question text is required.");
  const type = (TYPES.includes(input.type as QuestionType) ? input.type : "text") as QuestionType;
  if (type === "choice" && (!input.options || input.options.filter(Boolean).length < 2)) {
    throw new HttpError(400, "Multiple-choice questions need at least two options.");
  }
  const existing = await listQuestions();
  const row = {
    "Question ID": genId("Q"),
    Order: input.order ?? (existing.length ? Math.max(...existing.map((q) => q.order)) + 1 : 1),
    "Question Text": input.text.trim(),
    Type: type,
    Options: (input.options || []).filter(Boolean).join("|"),
    Active: input.active === false ? "FALSE" : "TRUE",
    "Created At": nowIso(),
  };
  await appendRows(TAB.RatingQuestions, [row]);
  return parseQuestion(row as unknown as Record<string, string>);
}

export async function updateQuestion(
  questionId: string,
  patch: Partial<{ text: string; type: string; options: string[]; order: number; active: boolean }>
): Promise<void> {
  const t = await readTable(TAB.RatingQuestions, { fresh: true });
  const idx = t.rows.findIndex((r) => r["Question ID"] === questionId);
  if (idx === -1) throw new HttpError(404, "Question not found.");
  const cells: Record<string, unknown> = {};
  if (patch.text != null) cells["Question Text"] = patch.text.trim();
  if (patch.type != null) cells["Type"] = TYPES.includes(patch.type as QuestionType) ? patch.type : "text";
  if (patch.options != null) cells["Options"] = patch.options.filter(Boolean).join("|");
  if (patch.order != null) cells["Order"] = patch.order;
  if (patch.active != null) cells["Active"] = patch.active ? "TRUE" : "FALSE";
  await patchCells(TAB.RatingQuestions, t.rowNumbers[idx], cells);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  // Soft-delete: keep responses meaningful, just deactivate + tag.
  const t = await readTable(TAB.RatingQuestions, { fresh: true });
  const idx = t.rows.findIndex((r) => r["Question ID"] === questionId);
  if (idx === -1) throw new HttpError(404, "Question not found.");
  await patchCells(TAB.RatingQuestions, t.rowNumbers[idx], {
    Active: "FALSE",
    "Question Text": `[deleted] ${t.rows[idx]["Question Text"]}`,
  });
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

export async function listResponses(): Promise<RatingResponseRow[]> {
  const t = await readTable(TAB.RatingResponses);
  return t.rows.map((r) => ({
    responseId: r["Response ID"],
    submittedAt: r["Submitted At"],
    bookingId: r["Booking ID"],
    employeeId: r["Employee ID"],
    employeeName: r["Employee Name"],
    questionId: r["Question ID"],
    questionText: r["Question Text"],
    answer: r["Answer"],
  }));
}

/** Bookings the employee took part in that already happened and can be rated. */
export async function ratableBookings(employeeId: string) {
  const mine = await bookingsForEmployee(employeeId);
  const responses = await listResponses();
  const ratedByMe = new Set(
    responses.filter((r) => r.employeeId.toLowerCase() === employeeId.toLowerCase()).map((r) => r.bookingId)
  );
  return mine
    .filter((b) => b.status === "Confirmed" && hasSlotStarted(b.date, b.startTime))
    .map((b) => ({
      bookingId: b.bookingId,
      date: b.date,
      slotLabel: b.slotLabel,
      players: b.participants.map((p) => p.name),
      alreadyRated: ratedByMe.has(b.bookingId),
    }));
}

export async function submitRating(input: {
  employeeId: string;
  employeeName: string;
  bookingId: string;
  answers: { questionId: string; answer: string }[];
}): Promise<void> {
  const { employeeId, employeeName, bookingId } = input;
  if (!bookingId) throw new HttpError(400, "A booking must be selected.");

  const mine = await bookingsForEmployee(employeeId);
  const booking = mine.find((b) => b.bookingId === bookingId);
  if (!booking) throw new HttpError(403, "You can only rate matches you took part in.");

  const allowEdit = (await getConfig()).allowRatingEdit;
  const prior = (await listResponses()).filter(
    (r) => r.bookingId === bookingId && r.employeeId.toLowerCase() === employeeId.toLowerCase()
  );
  if (prior.length && !allowEdit) {
    throw new HttpError(409, "You have already submitted a rating for this match.");
  }

  const questions = await listQuestions(true);
  const qById = new Map(questions.map((q) => [q.questionId, q]));
  const submittedAt = nowIso();

  if (prior.length && allowEdit) {
    // Overwrite prior answers in place where possible.
    const t = await readTable(TAB.RatingResponses, { fresh: true });
    for (const a of input.answers) {
      const q = qById.get(a.questionId);
      if (!q) continue;
      const rowIdx = t.rows.findIndex(
        (r) =>
          r["Booking ID"] === bookingId &&
          r["Employee ID"].toLowerCase() === employeeId.toLowerCase() &&
          r["Question ID"] === a.questionId
      );
      if (rowIdx !== -1) {
        await patchCells(TAB.RatingResponses, t.rowNumbers[rowIdx], {
          Answer: a.answer,
          "Submitted At": submittedAt,
        });
      } else {
        await appendRows(TAB.RatingResponses, [
          {
            "Response ID": genId("RSP"),
            "Submitted At": submittedAt,
            "Booking ID": bookingId,
            "Employee ID": employeeId,
            "Employee Name": employeeName,
            "Question ID": a.questionId,
            "Question Text": q.text,
            Answer: a.answer,
          },
        ]);
      }
    }
    return;
  }

  const rows = input.answers
    .filter((a) => qById.has(a.questionId) && a.answer !== "" && a.answer != null)
    .map((a) => ({
      "Response ID": genId("RSP"),
      "Submitted At": submittedAt,
      "Booking ID": bookingId,
      "Employee ID": employeeId,
      "Employee Name": employeeName,
      "Question ID": a.questionId,
      "Question Text": qById.get(a.questionId)!.text,
      Answer: a.answer,
    }));
  if (!rows.length) throw new HttpError(400, "No answers to submit.");
  await appendRows(TAB.RatingResponses, rows);
}

/* ------------------------------------------------------------------ *
 * Aggregates for the admin report
 * ------------------------------------------------------------------ */

export async function ratingReport() {
  const [questions, responses] = await Promise.all([listQuestions(), listResponses()]);
  const byQuestion = questions.map((q) => {
    const rs = responses.filter((r) => r.questionId === q.questionId);
    const answers = rs.map((r) => r.answer);
    let average: number | null = null;
    if (q.type === "star" || q.type === "scale") {
      const nums = answers.map(Number).filter((n) => !Number.isNaN(n));
      average = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null;
    }
    const distribution: Record<string, number> = {};
    for (const a of answers) distribution[a] = (distribution[a] || 0) + 1;
    return {
      questionId: q.questionId,
      text: q.text,
      type: q.type,
      responseCount: rs.length,
      average,
      distribution,
    };
  });
  // Who gave feedback — one entry per person, with their submission spread.
  const byPerson = new Map<
    string,
    { employeeId: string; name: string; answers: number; matchesRated: Set<string>; lastAt: string }
  >();
  for (const r of responses) {
    const k = r.employeeId.toLowerCase();
    const cur =
      byPerson.get(k) ||
      { employeeId: r.employeeId, name: r.employeeName, answers: 0, matchesRated: new Set<string>(), lastAt: "" };
    cur.answers += 1;
    if (r.bookingId) cur.matchesRated.add(r.bookingId);
    if (r.submittedAt > cur.lastAt) cur.lastAt = r.submittedAt;
    byPerson.set(k, cur);
  }
  const respondentsList = [...byPerson.values()]
    .map((p) => ({
      employeeId: p.employeeId,
      name: p.name,
      answers: p.answers,
      matchesRated: p.matchesRated.size,
      lastAt: p.lastAt,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return {
    totalResponses: responses.length,
    respondents: byPerson.size,
    byQuestion,
    respondentsList,
    raw: responses.slice(-800).reverse(),
  };
}
