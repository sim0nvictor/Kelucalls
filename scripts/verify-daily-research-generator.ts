import type { DailyResearchSnapshot } from "../src/lib/research/types";
import { generateDailyResearchReport } from "../src/lib/research/generator";

const snapshot = {
  snapshotDate: "2026-08-28",
  collectedAt: "2026-08-28T08:00:00.000Z",
  marketData: null,
  sentimentData: null,
  defiData: null,
  kelucallsData: null,
  newsData: null,
  signals: {
    generatedAt: "2026-08-28T08:01:00.000Z",
    baselineSnapshotDate: null,
    signalCount: 0,
    signals: []
  },
  providerStatus: {}
} satisfies DailyResearchSnapshot;

const sections = [
  "executive_summary",
  "global_macro_context",
  "crypto_market_snapshot",
  "fear_and_greed",
  "technology_ai",
  "geopolitical_economic_developments",
  "kol_narrative_intelligence",
  "kelucalls_intelligence",
  "cross_layer_signals",
  "emerging_narratives",
  "risks_contradicting_evidence",
  "conclusion"
];

function responseFor(evidence: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sections: Object.fromEntries(
                sections.map((key) => [key, { content: "No supplied evidence.", evidence: [evidence] }])
              )
            })
          }
        }
      ]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

async function main() {
  let capturedUserPayload: unknown = null;
  const report = await generateDailyResearchReport(snapshot, {
    apiKey: "test-key",
    generatedAt: "2026-08-28T08:02:00.000Z",
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      capturedUserPayload = JSON.parse(body.messages[1].content);
      return responseFor("signal_results");
    }
  });

  if (JSON.stringify(capturedUserPayload) !== JSON.stringify({
    research_snapshot: snapshot,
    signal_results: snapshot.signals
  })) {
    throw new Error("LLM payload contained data outside the snapshot and signal results");
  }
  if (Object.keys(report.sections).length !== sections.length) {
    throw new Error("Report did not contain all required sections");
  }
  if (report.financialDisclaimer.length === 0 || report.sources.length !== 0) {
    throw new Error("Report metadata was not assembled correctly");
  }

  let rejected = false;
  try {
    await generateDailyResearchReport(snapshot, {
      apiKey: "test-key",
      fetchImpl: async () => responseFor("invented.source")
    });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("unsupplied evidence");
  }
  if (!rejected) throw new Error("Generator accepted an unsupplied evidence reference");

  console.log("Daily Research Generator verification passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});