import "dotenv/config";
import { listTabs, createTab, ensureHeaders, readTable, appendRows } from "../api/_lib/sheets";
import { TAB, HEADERS, DEFAULT_QUESTIONS, DEFAULT_CONFIG } from "../api/_lib/schema";
import { genId, nowIso } from "../api/_lib/util";

async function main() {
  const existing = await listTabs();
  console.log("Existing tabs:", existing.join(", ") || "(none)");

  for (const [tab, headers] of Object.entries(HEADERS)) {
    if (!existing.includes(tab)) {
      console.log(`+ creating tab "${tab}"`);
      await createTab(tab, headers);
    } else if (tab === TAB.TT) {
      // TT is owned by HR. Never rewrite its headers — the app reads it by
      // loose alias matching (Employee Code / Work Email / LM Email all work).
      console.log(`= tab "${tab}" exists — left untouched (HR-managed)`);
    } else {
      console.log(`= tab "${tab}" exists — ensuring headers`);
      await ensureHeaders(tab, headers);
    }
  }

  // Seed rating questions on first run.
  const q = await readTable(TAB.RatingQuestions, { fresh: true });
  if (q.rows.length === 0) {
    console.log("+ seeding default rating questions");
    await appendRows(
      TAB.RatingQuestions,
      DEFAULT_QUESTIONS.map((d, i) => ({
        "Question ID": genId("Q"),
        Order: i + 1,
        "Question Text": d.text,
        Type: d.type,
        Options: d.options || "",
        Active: "TRUE",
        "Created At": nowIso(),
      }))
    );
  }

  // Seed default settings on first run — HR can edit values in the sheet
  // afterward; this only fills in rows that don't exist yet.
  const cfg = await readTable(TAB.Config, { fresh: true });
  const existingKeys = new Set(cfg.rows.map((r) => r["Key"]));
  const missingConfig = DEFAULT_CONFIG.filter((c) => !existingKeys.has(c.key));
  if (missingConfig.length) {
    console.log(`+ seeding ${missingConfig.length} default Config row(s)`);
    await appendRows(
      TAB.Config,
      missingConfig.map((c) => ({ Key: c.key, Value: c.value, Description: c.description }))
    );
  }

  console.log("\n✅ Provisioning complete. Tabs: " + Object.values(TAB).join(", "));
}

main().catch((e) => {
  console.error("\n❌ Provisioning failed:", e?.message || e);
  process.exit(1);
});
