import type { DailyResearchSnapshot, DailyResearchReport } from "../src/lib/research/types";
import { generateDailyResearchReport } from "../src/lib/research/generator";
import { validateDailyResearchReport } from "../src/lib/research/validator";

const REPORT_SECTIONS = [
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
  "conclusion",
];

const BASE_SNAPSHOT = {
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
    signals: [],
  },
  providerStatus: {},
} satisfies DailyResearchSnapshot;

/** Minimal assertion helper so failures short-circuit with a clear message. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Builds a fake Gemini-shaped response whose sections all cite the given evidence string. */
function mockGeminiResponse(evidence: string, options: { wrappedInMarkdown?: boolean } = {}): Response {
  const sections = Object.fromEntries(
    REPORT_SECTIONS.map((key) => [key, { content: "No supplied evidence.", evidence: [evidence] }]),
  );

  const body = JSON.stringify({ sections });
  const text = options.wrappedInMarkdown ? `\n\n\`\`\`json\n${body}\n\`\`\`\n` : body;

  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function mockRateLimitedResponse(): Response {
  return new Response(JSON.stringify({ error: { message: "rate limit exceeded" } }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
}

/** The LLM should only ever see the snapshot + its derived signals — nothing else. */
async function testPayloadIsScopedToSnapshotAndSignals() {
  let capturedPayload: unknown = null;

  const report = await generateDailyResearchReport(BASE_SNAPSHOT, {
    apiKey: "test-key",
    generatedAt: "2026-08-28T08:02:00.000Z",
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const requestText = body.contents[0].parts[0].text;
      capturedPayload = JSON.parse(requestText);
      return mockGeminiResponse("signal_results");
    },
  });

  const expectedPayload = {
    research_snapshot: BASE_SNAPSHOT,
    signal_results: BASE_SNAPSHOT.signals,
  };
  assert(
    JSON.stringify(capturedPayload) === JSON.stringify(expectedPayload),
    "LLM payload contained data outside the snapshot and signal results",
  );

  assert(
    Object.keys(report.sections).length === REPORT_SECTIONS.length,
    "Report did not contain all required sections",
  );
  assert(
    report.financialDisclaimer.length > 0 && report.sources.length === 0,
    "Report metadata was not assembled correctly",
  );
}

/** Evidence citations that don't trace back to real snapshot data must be rejected. */
async function testUnsupportedEvidenceIsRejected() {
  let wasRejectedForUnsupportedEvidence = false;

  try {
    await generateDailyResearchReport(BASE_SNAPSHOT, {
      apiKey: "test-key",
      fetchImpl: async () => mockGeminiResponse("invented.source"),
    });
  } catch (error) {
    wasRejectedForUnsupportedEvidence = error instanceof Error && error.message.includes("unsupplied evidence");
  }

  assert(wasRejectedForUnsupportedEvidence, "Generator accepted an unsupplied evidence reference");
}

/** A dotted path into real nested snapshot data (e.g. market data) should be accepted as valid evidence. */
async function testNestedEvidencePathIsAccepted() {
  const snapshotWithMarketData = {
    ...BASE_SNAPSHOT,
    marketData: {
      btc: { symbol: "BTC", coinId: "bitcoin", priceUsd: 60000, change24hPct: 1.2, marketCapUsd: 1_200_000_000_000 },
      eth: null,
      sol: null,
      global: null,
      fetchedAt: "2026-08-28T08:00:00.000Z",
      source: "coingecko",
    },
  } as DailyResearchSnapshot;

  try {
    await generateDailyResearchReport(snapshotWithMarketData, {
      apiKey: "test-key",
      fetchImpl: async () => mockGeminiResponse("research_snapshot.marketData.btc.priceUsd"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generator rejected a valid nested market-data evidence reference: ${message}`);
  }
}

/** Gemini sometimes wraps valid JSON in markdown fences; the parser must accept that form. */
async function testMarkdownWrappedJsonIsAccepted() {
  try {
    await generateDailyResearchReport(BASE_SNAPSHOT, {
      apiKey: "test-key",
      fetchImpl: async () => mockGeminiResponse("signal_results", { wrappedInMarkdown: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generator rejected markdown-wrapped JSON: ${message}`);
  }
}

/** Array item citations should also be accepted even when the model uses bracket notation. */
async function testBracketNotationEvidencePathIsAccepted() {
  const snapshotWithNews = {
    ...BASE_SNAPSHOT,
    newsData: {
      items: [
        {
          id: "1",
          source: "newsapi",
          source_type: "news",
          title: "Sample",
          url: "https://example.com",
          published_at: "2026-08-28T07:00:00.000Z",
          collected_at: "2026-08-28T08:00:00.000Z",
          category: "crypto",
          description: null,
          summary: null,
          entities: [],
        },
      ],
      providerStatus: {},
      fetchedAt: "2026-08-28T08:00:00.000Z",
      source: "news",
    },
  } as DailyResearchSnapshot;

  try {
    await generateDailyResearchReport(snapshotWithNews, {
      apiKey: "test-key",
      fetchImpl: async () => mockGeminiResponse("research_snapshot.newsData.items[0]"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generator rejected a valid bracket-notation news evidence reference: ${message}`);
  }
}

/** Incidental small values are narrative flourishes, not source-backed claims. */
async function testSmallIncidentalNumbersAreIgnored() {
  const snapshotWithMarketData = {
    ...BASE_SNAPSHOT,
    marketData: {
      btc: { symbol: "BTC", coinId: "bitcoin", priceUsd: 60000, change24hPct: 1.2, marketCapUsd: 1_200_000_000_000 },
      eth: null,
      sol: null,
      global: null,
      fetchedAt: "2026-08-28T08:00:00.000Z",
      source: "coingecko",
    },
  } as DailyResearchSnapshot;

  const report = {
    schemaVersion: 1,
    snapshotDate: snapshotWithMarketData.snapshotDate,
    collectedAt: snapshotWithMarketData.collectedAt,
    generatedAt: "2026-08-28T08:10:00.000Z",
    financialDisclaimer: "This is informational research, not financial advice.",
    sections: {
      executive_summary: {
        content: "This price moved by $2.66 and 0.3% over the cycle.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      global_macro_context: {
        content: "Macro context was stable.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      crypto_market_snapshot: {
        content: "The market is active.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      fear_and_greed: {
        content: "Sentiment was stable.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      technology_ai: {
        content: "Technology is active.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      geopolitical_economic_developments: {
        content: "No major geopolitical moves.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      kol_narrative_intelligence: {
        content: "There was no unique narrative.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      kelucalls_intelligence: {
        content: "Activity was moderate.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      cross_layer_signals: {
        content: "Signals remain steady.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      emerging_narratives: {
        content: "No emerging narratives.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      risks_contradicting_evidence: {
        content: "No contradictions.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      conclusion: {
        content: "The cycle was stable.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
    },
    sources: [],
  } satisfies DailyResearchReport;

  const validation = validateDailyResearchReport(snapshotWithMarketData, report);
  assert(validation.valid, `Small incidental numbers were incorrectly rejected: ${JSON.stringify(validation.errors)}`);
}

async function testMalformedCommaNumbersAreIgnored() {
  const snapshotWithMarketData = {
    ...BASE_SNAPSHOT,
    marketData: {
      btc: { symbol: "BTC", coinId: "bitcoin", priceUsd: 60000, change24hPct: 1.2, marketCapUsd: 1_200_000_000_000 },
      eth: null,
      sol: null,
      global: null,
      fetchedAt: "2026-08-28T08:00:00.000Z",
      source: "coingecko",
    },
  } as DailyResearchSnapshot;

  const report = {
    schemaVersion: 1,
    snapshotDate: snapshotWithMarketData.snapshotDate,
    collectedAt: snapshotWithMarketData.collectedAt,
    generatedAt: "2026-08-28T08:10:00.000Z",
    financialDisclaimer: "This is informational research, not financial advice.",
    sections: {
      executive_summary: {
        content: "The market value was $88,438,579,86, and still looked fine.",
        evidence: ["research_snapshot.marketData.btc.priceUsd"],
      },
      global_macro_context: { content: "Macro context was stable.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      crypto_market_snapshot: { content: "The market is active.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      fear_and_greed: { content: "Sentiment was stable.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      technology_ai: { content: "Technology is active.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      geopolitical_economic_developments: { content: "No major geopolitical moves.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      kol_narrative_intelligence: { content: "There was no unique narrative.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      kelucalls_intelligence: { content: "Activity was moderate.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      cross_layer_signals: { content: "Signals remain steady.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      emerging_narratives: { content: "No emerging narratives.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      risks_contradicting_evidence: { content: "No contradictions.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
      conclusion: { content: "The cycle was stable.", evidence: ["research_snapshot.marketData.btc.priceUsd"] },
    },
    sources: [],
  } satisfies DailyResearchReport;

  const validation = validateDailyResearchReport(snapshotWithMarketData, report);
  assert(validation.valid, `Malformed comma-number claims should be ignored: ${JSON.stringify(validation.errors)}`);
}

/** Persistent 429s should retry a bounded number of times, then surface a clear rate-limit error. */
async function testRepeated429sSurfaceRateLimitError() {
  let attempts = 0;
  let caughtError: Error | null = null;

  try {
    await generateDailyResearchReport(BASE_SNAPSHOT, {
      apiKey: "test-key",
      generatedAt: "2026-08-28T08:03:00.000Z",
      fetchImpl: async () => {
        attempts += 1;
        return mockRateLimitedResponse();
      },
    });
  } catch (error) {
    caughtError = error instanceof Error ? error : new Error(String(error));
  }

  assert(
    caughtError !== null && caughtError.message.includes("rate limited") && attempts === 3,
    `Generator did not surface the final 429 diagnosis: ${caughtError?.message ?? "no error"}`,
  );
}

async function main() {
  await testPayloadIsScopedToSnapshotAndSignals();
  await testUnsupportedEvidenceIsRejected();
  await testNestedEvidencePathIsAccepted();
  await testMarkdownWrappedJsonIsAccepted();
  await testBracketNotationEvidencePathIsAccepted();
  await testSmallIncidentalNumbersAreIgnored();
  await testMalformedCommaNumbersAreIgnored();
  await testRepeated429sSurfaceRateLimitError();

  console.log("Daily Research Generator verification passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});