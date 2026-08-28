/**
 * Live verification for news providers and normalization.
 *
 * Run: npx tsx scripts/verify-news-providers.ts
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: false });

import { collectNewsResearchSnapshot } from "../src/lib/research/news";
import type { ResearchCategory, ResearchItem } from "../src/lib/research/types";

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];
const categories: ResearchCategory[] = [
  "crypto",
  "geopolitics",
  "economics",
  "technology",
  "ai",
  "regulation",
  "macro"
];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name} - ${detail}`);
}

function isResearchItem(item: ResearchItem): boolean {
  return (
    item.id.length > 0 &&
    ["newsapi", "gdelt", "coindesk", "cointelegraph", "techcrunch_ai"].includes(
      item.source
    ) &&
    item.source_type === "news" &&
    item.title.length > 0 &&
    item.url.startsWith("http") &&
    !Number.isNaN(Date.parse(item.published_at)) &&
    !Number.isNaN(Date.parse(item.collected_at)) &&
    categories.includes(item.category) &&
    (item.description === null || item.description.length > 0) &&
    (item.summary === null || item.summary.length > 0) &&
    Array.isArray(item.entities)
  );
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

async function main() {
  console.log("=== News provider live verification ===");

  const snapshot = await collectNewsResearchSnapshot();
  const providerCounts = Object.values(snapshot.providerStatus)
    .map((status) => `${status.source}=${status.itemCount}${status.ok ? "" : " failed"}`)
    .join(", ");

  record("Provider status captured independently", providerCounts.length > 0, providerCounts);
  record("Snapshot source is news", snapshot.source === "news", `source=${snapshot.source}`);
  record(
    "Fetched timestamp is valid",
    !Number.isNaN(Date.parse(snapshot.fetchedAt)),
    `fetchedAt=${snapshot.fetchedAt}`
  );
  const totalExpected = Object.values(snapshot.providerStatus).reduce(
    (sum, status) => sum + status.itemCount,
    0
  );
  record(
    "Providers report independent success/failure",
    Object.values(snapshot.providerStatus).every(
      (status) =>
        (status.ok && status.itemCount >= 0 && status.error === null) ||
        (!status.ok && status.error !== null)
    ),
    Object.values(snapshot.providerStatus)
      .map(
        (status) =>
          `${status.source}=${status.ok ? "ok" : "fail"}(${status.itemCount})`
      )
      .join(", ")
  );
  record(
    "At least one news item collected",
    totalExpected > 0,
    `items=${snapshot.items.length} (provider sum=${totalExpected})`
  );
  record(
    "ResearchItem shape is valid",
    snapshot.items.every(isResearchItem),
    "required fields, URLs, categories, and timestamps checked"
  );

  const urls = new Set(snapshot.items.map((item) => canonicalUrl(item.url)));
  record("Stories are deduplicated by URL", urls.size === snapshot.items.length, `unique=${urls.size}`);

  const sourceList = [...new Set(snapshot.items.map((item) => item.source))].join(", ");
  const categoryList = [...new Set(snapshot.items.map((item) => item.category))].join(", ");
  record("Source URLs are preserved", snapshot.items.every((item) => item.url.startsWith("http")), sourceList);
  record("Categories assigned", categoryList.length > 0, categoryList);

  console.log("");
  console.log("Sample items:");
  console.log(JSON.stringify(snapshot.items.slice(0, 5), null, 2));

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("UNEXPECTED EXCEPTION:", error);
  process.exitCode = 2;
});
