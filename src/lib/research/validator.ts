import type {
  DailyResearchReport,
  DailyResearchSnapshot,
  ResearchReportValidationError,
  ResearchReportValidationResult,
  VerifiedResearchClaim
} from "./types";
import { DAILY_RESEARCH_SECTION_KEYS } from "./types";

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const DATE_PATTERN = /\b(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\b/g;
const QUOTE_PATTERN = /["“]([^"”]+)["”]/g;
const NUMBER_PATTERN = /(?<![\w.])[-+]?\$?\d[\d,]*(?:\.\d+)?\s*%?(?![\w])/g;

function walk(value: unknown, path: string, visit: (value: unknown, path: string) => void) {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, visit);
  }
}

function textValues(snapshot: DailyResearchSnapshot): Array<{ value: string; path: string }> {
  const values: Array<{ value: string; path: string }> = [];
  walk(snapshot, "research_snapshot", (value, path) => {
    if (typeof value === "string") values.push({ value, path });
  });
  return values;
}

  function matches(pattern: RegExp, value: string): string[] {
    pattern.lastIndex = 0;
    return [...value.matchAll(pattern)].map((match) => match[0]);
  }

function numericValues(snapshot: DailyResearchSnapshot): Array<{ value: number; path: string }> {
  const values: Array<{ value: number; path: string }> = [];
  walk(snapshot, "research_snapshot", (value, path) => {
    if (typeof value === "number" && Number.isFinite(value)) values.push({ value, path });
  });
  return values;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(/[,$%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(claimed: number, supplied: number): boolean {
  const scale = Math.max(1, Math.abs(claimed), Math.abs(supplied));
  return Math.abs(claimed - supplied) <= Number.EPSILON * scale * 100;
}

function addError(
  errors: ResearchReportValidationError[],
  code: string,
  message: string,
  location: string
) {
  errors.push({ code, message, location });
}

function sourcePathsForNumber(snapshot: DailyResearchSnapshot, claimed: number): string[] {
  return numericValues(snapshot)
    .filter((entry) => sameNumber(claimed, entry.value))
    .map((entry) => entry.path);
}

export function validateDailyResearchReport(
  snapshot: DailyResearchSnapshot,
  report: DailyResearchReport
): ResearchReportValidationResult {
  const errors: ResearchReportValidationError[] = [];
  const warnings: string[] = [];
  const verified_claims: VerifiedResearchClaim[] = [];
  const suppliedText = textValues(snapshot);
  const suppliedTextValues = suppliedText.map((entry) => entry.value);
  const suppliedUrls = new Set(
    suppliedText.flatMap((entry) => matches(URL_PATTERN, entry.value))
  );
  const suppliedDates = suppliedText
    .flatMap((entry) => matches(DATE_PATTERN, entry.value))
    .map((value) => value.slice(0, 10));

  if (report.schemaVersion !== 1) addError(errors, "schema_version", "Unsupported report schema version", "schemaVersion");
  if (report.snapshotDate !== snapshot.snapshotDate) {
    addError(errors, "snapshot_mismatch", "Report snapshotDate does not match the source snapshot", "snapshotDate");
  }
  if (report.collectedAt !== snapshot.collectedAt) {
    addError(errors, "snapshot_mismatch", "Report collectedAt does not match the source snapshot", "collectedAt");
  }
  if (report.financialDisclaimer.trim() === "") {
    addError(errors, "disclaimer_missing", "Financial disclaimer is missing", "financialDisclaimer");
  }

  const expectedKeys = [...DAILY_RESEARCH_SECTION_KEYS].sort();
  const actualKeys = Object.keys(report.sections ?? {}).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    addError(errors, "section_schema", "Report does not contain exactly the required sections", "sections");
  }

  for (const key of DAILY_RESEARCH_SECTION_KEYS) {
    const section = report.sections?.[key];
    if (!section || typeof section.content !== "string") {
      addError(errors, "section_missing", `Section ${key} is missing content`, `sections.${key}`);
      continue;
    }
    for (const evidence of section.evidence) {
      const validEvidence = evidence === "signal_results" || suppliedText.some((entry) => entry.path === evidence) || numericValues(snapshot).some((entry) => entry.path === evidence);
      if (!validEvidence) addError(errors, "evidence_reference", `Evidence reference is not supplied: ${evidence}`, `sections.${key}.evidence`);
    }

    const content = section.content;
    const withoutUrls = content.replace(URL_PATTERN, "");
    const withoutDates = withoutUrls.replace(DATE_PATTERN, "");
    for (const match of withoutDates.matchAll(NUMBER_PATTERN)) {
      const raw = match[0];
      const claimed = parseNumber(raw);
      if (claimed === null) continue;
      const sourcePaths = sourcePathsForNumber(snapshot, claimed);
      if (sourcePaths.length === 0) {
        addError(errors, "unverified_number", `Numerical claim is not present in the source snapshot: ${raw}`, `sections.${key}.content`);
      } else {
        verified_claims.push({ claim: raw.trim(), location: `sections.${key}.content`, sourcePaths });
      }
    }

    for (const match of content.matchAll(DATE_PATTERN)) {
      const date = match[0].slice(0, 10);
      if (!suppliedDates.includes(date)) {
        addError(errors, "unverified_date", `Date is not present in the source snapshot: ${match[0]}`, `sections.${key}.content`);
      } else {
        verified_claims.push({ claim: match[0], location: `sections.${key}.content`, sourcePaths: ["research_snapshot"] });
      }
    }

    for (const url of matches(URL_PATTERN, content)) {
      if (!suppliedUrls.has(url)) {
        addError(errors, "unverified_url", `URL is not present in the source snapshot: ${url}`, `sections.${key}.content`);
      } else {
        verified_claims.push({ claim: url, location: `sections.${key}.content`, sourcePaths: ["research_snapshot.newsData.items"] });
      }
    }

    for (const match of content.matchAll(QUOTE_PATTERN)) {
      const quote = match[1].trim();
      if (!suppliedTextValues.some((value) => value.includes(quote))) {
        addError(errors, "unverified_quote", `Quoted statement is not present in the source snapshot: ${quote}`, `sections.${key}.content`);
      } else {
        verified_claims.push({ claim: quote, location: `sections.${key}.content`, sourcePaths: ["research_snapshot.newsData.items"] });
      }
    }
  }

  const snapshotUrls = new Set(
    snapshot.newsData?.items.map((item) => item.url) ?? []
  );
  for (const [index, source] of report.sources.entries()) {
    if (source.url !== null && !snapshotUrls.has(source.url)) {
      addError(errors, "unverified_source_url", `Source URL is not present in the source snapshot: ${source.url}`, `sources[${index}].url`);
    } else if (source.url !== null) {
      verified_claims.push({ claim: source.url, location: `sources[${index}].url`, sourcePaths: ["research_snapshot.newsData.items"] });
    }
    if (source.publishedAt !== null) {
      const publishedDate = source.publishedAt.slice(0, 10);
      if (!suppliedDates.includes(publishedDate)) {
        addError(errors, "unverified_source_date", `Source publication date is not present in the source snapshot: ${source.publishedAt}`, `sources[${index}].publishedAt`);
      } else {
        verified_claims.push({ claim: source.publishedAt, location: `sources[${index}].publishedAt`, sourcePaths: ["research_snapshot.newsData.items"] });
      }
    }
  }

  if (report.sources.length === 0 && snapshot.newsData?.items.length) {
    warnings.push("Report contains no source entries despite supplied news items");
  }

  return { valid: errors.length === 0, errors, warnings, verified_claims };
}