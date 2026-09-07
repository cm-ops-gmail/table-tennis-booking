import { readTable, appendRows, patchCells } from "./sheets.js";
import { TAB } from "./schema.js";
import { genId, nowIso, truthy, HttpError } from "./util.js";
import { getSlot } from "../../src/shared/slots.js";
import type { BlockedSlot, BlockedDate } from "../../src/shared/types.js";

/** All active rows of the merged Blocks tab. */
async function activeBlocks() {
  const t = await readTable(TAB.Blocks);
  return t.rows.filter((r) => truthy(r["Active"]));
}

export async function listBlockedSlots(): Promise<BlockedSlot[]> {
  return (await activeBlocks())
    .filter((r) => (r["Type"] || "slot").toLowerCase() === "slot")
    .map((r) => ({
      blockId: r["Block ID"],
      date: r["Date"],
      slotId: Number(r["Slot ID"]),
      slotLabel: r["Slot Label"],
      reason: r["Reason"] || "",
      createdAt: r["Created At"],
      createdBy: r["Created By"],
    }));
}

export async function listBlockedDates(): Promise<BlockedDate[]> {
  return (await activeBlocks())
    .filter((r) => (r["Type"] || "").toLowerCase() === "date")
    .map((r) => ({
      blockId: r["Block ID"],
      date: r["Date"],
      reason: r["Reason"] || "",
      createdAt: r["Created At"],
      createdBy: r["Created By"],
    }));
}

export async function blockSlot(
  date: string,
  slotId: number,
  reason: string,
  by: string
): Promise<BlockedSlot> {
  const slot = getSlot(slotId);
  if (!slot) throw new HttpError(400, `Unknown slot: ${slotId}`);
  if ((await listBlockedSlots()).some((b) => b.date === date && b.slotId === slotId)) {
    throw new HttpError(409, "That slot is already blocked.");
  }
  const row = {
    "Block ID": genId("BLK"),
    Type: "slot",
    Date: date,
    "Slot ID": slotId,
    "Slot Label": slot.label,
    Reason: reason || "",
    "Created At": nowIso(),
    "Created By": by,
    Active: "TRUE",
  };
  await appendRows(TAB.Blocks, [row]);
  return {
    blockId: row["Block ID"],
    date,
    slotId,
    slotLabel: slot.label,
    reason: reason || "",
    createdAt: row["Created At"],
    createdBy: by,
  };
}

export async function blockDate(date: string, reason: string, by: string): Promise<BlockedDate> {
  if ((await listBlockedDates()).some((b) => b.date === date)) {
    throw new HttpError(409, "That date is already blocked.");
  }
  const row = {
    "Block ID": genId("BLKD"),
    Type: "date",
    Date: date,
    "Slot ID": "",
    "Slot Label": "",
    Reason: reason || "",
    "Created At": nowIso(),
    "Created By": by,
    Active: "TRUE",
  };
  await appendRows(TAB.Blocks, [row]);
  return { blockId: row["Block ID"], date, reason: reason || "", createdAt: row["Created At"], createdBy: by };
}

async function findRow(blockId: string) {
  const t = await readTable(TAB.Blocks, { fresh: true });
  const idx = t.rows.findIndex((r) => r["Block ID"] === blockId);
  if (idx === -1) throw new HttpError(404, "Block not found.");
  return { rowNumber: t.rowNumbers[idx] };
}

export async function unblockSlot(blockId: string): Promise<void> {
  const { rowNumber } = await findRow(blockId);
  await patchCells(TAB.Blocks, rowNumber, { Active: "FALSE" });
}
export async function unblockDate(blockId: string): Promise<void> {
  await unblockSlot(blockId);
}

export async function updateBlockNote(
  _kind: "slot" | "date",
  blockId: string,
  reason: string
): Promise<void> {
  const { rowNumber } = await findRow(blockId);
  await patchCells(TAB.Blocks, rowNumber, { Reason: reason });
}
