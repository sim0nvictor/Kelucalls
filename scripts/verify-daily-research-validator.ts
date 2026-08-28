import type { DailyResearchReport, DailyResearchSnapshot } from "../src/lib/research/types";
import { DAILY_RESEARCH_SECTION_KEYS } from "../src/lib/research/types";
import { validateDailyResearchReport } from "../src/lib/research/validator";

const snapshot = {
  snapshotDate: "2026-08-28",
  collectedAt: "2026-08-28T08:00:00.000Z",
  marketData: null,
  sentimentData: null,
  defiData: null,
  kelucallsData: null,
  newsData: null,
  signals: null,
  providerStatus: {}
} satisfies DailyResearchSnapshot;

function makeReport(content: string): DailyResearchReport {
  return {
    schemaVersion: 1,
    snapshotDate: snapshot.snapshotDate,
    collectedAt: snapshot.collectedAt,
    generatedAt: "2026-08-28T08:10:00.000Z",
    sections: Object.fromEntries(
      DAILY_RESEARCH_SECTION_KEYS.map((key) => [key, { content, evidence: [] }])
    ) as unknown as DailyResearchReport["sections"],
    sources: [],
    financialDisclaimer: "Informational research only; not financial advice."
  };
}

const valid = validateDailyResearchReport(snapshot, makeReport("No supplied evidence."));
if (!valid.valid || valid.errors.length !== 0) {
  throw new Error(`Expected valid report, got ${JSON.stringify(valid)}`);
}

const invalid = validateDailyResearchReport(
  snapshot,
  makeReport("Price is 999 on 2026-09-01. \"An invented quote\" https://example.com/fake")
);
const errorCodes = new Set(invalid.errors.map((error) => error.code));
for (const code of ["unverified_number", "unverified_date", "unverified_url", "unverified_quote"]) {
  if (!errorCodes.has(code)) throw new Error(`Expected ${code}: ${JSON.stringify(invalid)}`);
}
if (invalid.valid) throw new Error("Invalid report was accepted");

console.log("Daily Research Validator verification passed");
