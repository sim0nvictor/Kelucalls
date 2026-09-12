import type {
  DailyResearchReport,
  DailyResearchSnapshot,
  ResearchReportValidationError,
  ResearchReportValidationResult,
  VerifiedResearchClaim
} from "./types";
import { DAILY_RESEARCH_SECTION_KEYS } from "./types";

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const DATE_PATTERN =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\b/g;
const QUOTE_PATTERN = /["“]([^"”]+)["”]/g;
const NUMBER_PATTERN =
  /(?<![\w.$-])[-+]?(?:\$)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*%?(?![\w]|,\d)/g;

function walk(value: unknown, path: string, visit: (value: unknown, path: string) => void): void {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, `${path}.${key}`, visit);
    }
  }
}

function normalizePath(path: string): string {
  const normalized = path
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");

  if (normalized === "signals") return "signal_results";
  if (normalized === "signal_results" || normalized === "research_snapshot") return normalized;
  if (normalized.startsWith("research_snapshot.")) return normalized;
  if (normalized.startsWith("signal_results.")) return normalized;

  if (normalized.startsWith("signals.")) {
    return `signal_results.${normalized.slice("signals.".length)}`;
  }

  if (normalized.startsWith("research_snapshot.signals.")) {
    return `signal_results.${normalized.slice("research_snapshot.signals.".length)}`;
  }

  const relativeRoots = [
    "marketData",
    "sentimentData",
    "defiData",
    "kelucallsData",
    "newsData"
  ];

  if (relativeRoots.some((root) => normalized === root || normalized.startsWith(`${root}.`))) {
    return `research_snapshot.${normalized}`;
  }

  return normalized;
}

function textValues(snapshot: DailyResearchSnapshot): Array<{ value: string; path: string }> {
  const values: Array<{ value: string; path: string }> = [];

  walk(snapshot, "research_snapshot", (value, path) => {
    if (typeof value === "string") {
      values.push({ value, path: normalizePath(path) });
    }
  });

  return values;
}

function numericValues(snapshot: DailyResearchSnapshot): Array<{ value: number; path: string }> {
  const values: Array<{ value: number; path: string }> = [];

  walk(snapshot, "research_snapshot", (value, path) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      values.push({ value, path: normalizePath(path) });
    }
  });

  return values;
}

function matches(pattern: RegExp, value: string): string[] {
  pattern.lastIndex = 0;
  return [...value.matchAll(pattern)].map((match) => match[0]);
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\s+/g, "");

  if (!/^[-+]?\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(normalized)) {
    return null;
  }

  const sanitized = normalized.replace(/[$,%]/g, "").replace(/,/g, "");
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedNumberForComparison(value: number): number {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    return Number(value.toFixed(2));
  }

  if (absolute >= 100) {
    return Number(value.toFixed(2));
  }

  if (absolute >= 1) {
    return Number(value.toFixed(3));
  }

  if (absolute >= 0.01) {
    return Number(value.toFixed(4));
  }

  return Number(value.toFixed(6));
}

function sameNumber(claimed: number, supplied: number): boolean {
  const normalizedClaimed = normalizedNumberForComparison(claimed);
  const normalizedSupplied = normalizedNumberForComparison(supplied);
  const delta = Math.abs(normalizedClaimed - normalizedSupplied);

  if (delta === 0) {
    return true;
  }

  const scale = Math.max(
    0.01,
    Math.abs(normalizedClaimed),
    Math.abs(normalizedSupplied)
  );

  return delta <= Math.max(0.01, scale * 0.01);
}

function addError(
  errors: ResearchReportValidationError[],
  code: string,
  message: string,
  location: string
): void {
  errors.push({ code, message, location });
}

let currentNumericValues: Array<{ value: number; path: string }> = [];
let currentSuppliedDates: string[] = [];

function sourcePathsForNumberFromSnapshotCache(claimed: number): string[] {
  return currentNumericValues
    .filter((entry) => sameNumber(claimed, entry.value))
    .map((entry) => entry.path);
}

function shouldRequireNumericVerification(raw: string): boolean {
  const trimmed = raw.trim();
  const claimed = parseNumber(trimmed);

  if (claimed === null) return false;

  const isPercent = trimmed.includes("%");
  const isCurrency = trimmed.includes("$");
  const isDecimal = /\d+\.\d+/.test(trimmed);
  const isBareNarrativeNumber = !isPercent && !isCurrency && Math.abs(claimed) < 10 && isDecimal;

  const matches = sourcePathsForNumberFromSnapshotCache(claimed);
  if (matches.length > 0) {
    return true;
  }

  if (isPercent && Math.abs(claimed) < 1) {
    return false;
  }

  if (isCurrency && Math.abs(claimed) < 100) {
    return false;
  }

  if (isBareNarrativeNumber) {
    return false;
  }

  if (isPercent || isCurrency || isDecimal) {
    return true;
  }

  return false;
}

function collectEvidencePaths(prefix: string, value: unknown, references: Set<string>): void {
  const normalizedPrefix = normalizePath(prefix);
  references.add(normalizedPrefix);

  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEvidencePaths(`${prefix}[${index}]`, item, references));
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectEvidencePaths(`${prefix}.${key}`, child, references);
    }
  }
}

function buildAllowedEvidenceReferences(snapshot: DailyResearchSnapshot): Set<string> {
  const references = new Set<string>(["signal_results"]);

  collectEvidencePaths("research_snapshot.marketData", snapshot.marketData, references);
  collectEvidencePaths("research_snapshot.sentimentData", snapshot.sentimentData, references);
  collectEvidencePaths("research_snapshot.defiData", snapshot.defiData, references);
  collectEvidencePaths("research_snapshot.kelucallsData", snapshot.kelucallsData, references);
  collectEvidencePaths("research_snapshot.newsData", snapshot.newsData, references);
  collectEvidencePaths("research_snapshot.signals", snapshot.signals, references);
  collectEvidencePaths("signal_results", snapshot.signals, references);

  for (const signal of snapshot.signals?.signals ?? []) {
    references.add(normalizePath(`signal_results.signals.${signal.signal_type}`));
    references.add(normalizePath(`signals.signals.${snapshot.signals?.signals.indexOf(signal) ?? 0}`));
  }

  for (const index of (snapshot.signals?.signals ?? []).keys()) {
    references.add(normalizePath(`signal_results.signals.${index}`));
    references.add(normalizePath(`signals.signals.${index}`));
  }

  for (const item of snapshot.newsData?.items ?? []) {
    references.add(normalizePath(`research_snapshot.newsData.items.${item.id}`));
  }

  return references;
}

function isEvidenceReferenceValid(reference: string, allowedEvidence: Set<string>): boolean {
  return allowedEvidence.has(normalizePath(reference));
}

function validateNumbers(
  content: string,
  sectionKey: string,
  verifiedClaims: VerifiedResearchClaim[],
  errors: ResearchReportValidationError[]
): void {
  const withoutUrls = content.replace(URL_PATTERN, "");
  const withoutDates = withoutUrls.replace(DATE_PATTERN, "");

  for (const match of withoutDates.matchAll(NUMBER_PATTERN)) {
    const raw = match[0].trim();
    const claimed = parseNumber(raw);

    if (claimed === null) continue;

    if (!shouldRequireNumericVerification(raw)) continue;

    const sourcePaths = sourcePathsForNumberFromSnapshotCache(claimed);
    if (sourcePaths.length === 0) {
      addError(
        errors,
        "unverified_number",
        `Numerical claim is not present in the source snapshot: ${raw}`,
        `sections.${sectionKey}.content`
      );
      continue;
    }

    verifiedClaims.push({
      claim: raw,
      location: `sections.${sectionKey}.content`,
      sourcePaths
    });
  }

  for (const match of content.matchAll(DATE_PATTERN)) {
    const date = match[0].slice(0, 10);

    if (!currentSuppliedDates.includes(date)) {
      addError(
        errors,
        "unverified_date",
        `Date is not present in the source snapshot: ${match[0]}`,
        `sections.${sectionKey}.content`
      );
    } else {
      verifiedClaims.push({
        claim: match[0],
        location: `sections.${sectionKey}.content`,
        sourcePaths: ["research_snapshot"]
      });
    }
  }
}

function validateUrls(
  content: string,
  suppliedUrls: Set<string>,
  sectionKey: string,
  verifiedClaims: VerifiedResearchClaim[],
  errors: ResearchReportValidationError[]
): void {
  for (const url of matches(URL_PATTERN, content)) {
    if (!suppliedUrls.has(url)) {
      addError(
        errors,
        "unverified_url",
        `URL is not present in the source snapshot: ${url}`,
        `sections.${sectionKey}.content`
      );
      continue;
    }

    verifiedClaims.push({
      claim: url,
      location: `sections.${sectionKey}.content`,
      sourcePaths: ["research_snapshot.newsData.items"]
    });
  }
}

function validateQuotes(
  content: string,
  suppliedTextValues: string[],
  sectionKey: string,
  verifiedClaims: VerifiedResearchClaim[],
  errors: ResearchReportValidationError[]
): void {
  for (const match of content.matchAll(QUOTE_PATTERN)) {
    const quote = match[1].trim();
    const exists = suppliedTextValues.some((value) => value.includes(quote));

    if (!exists) {
      addError(
        errors,
        "unverified_quote",
        `Quoted statement is not present in the source snapshot: ${quote}`,
        `sections.${sectionKey}.content`
      );
      continue;
    }

    verifiedClaims.push({
      claim: quote,
      location: `sections.${sectionKey}.content`,
      sourcePaths: ["research_snapshot.newsData.items"]
    });
  }
}

function validateReportSources(
  snapshot: DailyResearchSnapshot,
  report: DailyResearchReport,
  suppliedDates: string[],
  verifiedClaims: VerifiedResearchClaim[],
  errors: ResearchReportValidationError[]
): void {
  const snapshotUrls = new Set(snapshot.newsData?.items.map((item) => item.url) ?? []);

  for (const [index, source] of report.sources.entries()) {
    if (source.url !== null && !snapshotUrls.has(source.url)) {
      addError(
        errors,
        "unverified_source_url",
        `Source URL is not present in the source snapshot: ${source.url}`,
        `sources[${index}].url`
      );
    } else if (source.url !== null) {
      verifiedClaims.push({
        claim: source.url,
        location: `sources[${index}].url`,
        sourcePaths: ["research_snapshot.newsData.items"]
      });
    }

    if (source.publishedAt !== null) {
      const publishedDate = source.publishedAt.slice(0, 10);
      if (!suppliedDates.includes(publishedDate)) {
        addError(
          errors,
          "unverified_source_date",
          `Source publication date is not present in the source snapshot: ${source.publishedAt}`,
          `sources[${index}].publishedAt`
        );
      } else {
        verifiedClaims.push({
          claim: source.publishedAt,
          location: `sources[${index}].publishedAt`,
          sourcePaths: ["research_snapshot.newsData.items"]
        });
      }
    }
  }
}

export function validateDailyResearchReport(
  snapshot: DailyResearchSnapshot,
  report: DailyResearchReport
): ResearchReportValidationResult {
  const errors: ResearchReportValidationError[] = [];
  const warnings: string[] = [];
  const verifiedClaims: VerifiedResearchClaim[] = [];

  currentNumericValues = numericValues(snapshot);

  const snapshotTextValues = textValues(snapshot);
  const suppliedTextValues = snapshotTextValues.map((entry) => entry.value);
  const suppliedUrls = new Set(snapshotTextValues.flatMap((entry) => matches(URL_PATTERN, entry.value)));
  currentSuppliedDates = snapshotTextValues
    .flatMap((entry) => matches(DATE_PATTERN, entry.value))
    .map((value) => value.slice(0, 10));

  const allowedEvidence = buildAllowedEvidenceReferences(snapshot);

  if (report.schemaVersion !== 1) {
    addError(errors, "schema_version", "Unsupported report schema version", "schemaVersion");
  }

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

    if (!Array.isArray(section.evidence)) {
      addError(errors, "evidence_schema", `Section ${key} has invalid evidence`, `sections.${key}.evidence`);
      continue;
    }

    for (const evidence of section.evidence) {
      if (!isEvidenceReferenceValid(evidence, allowedEvidence)) {
        addError(errors, "evidence_reference", `Evidence reference is not supplied: ${evidence}`, `sections.${key}.evidence`);
      }
    }

    validateNumbers(section.content, key, verifiedClaims, errors);
    validateUrls(section.content, suppliedUrls, key, verifiedClaims, errors);
    validateQuotes(section.content, suppliedTextValues, key, verifiedClaims, errors);
  }

  validateReportSources(snapshot, report, currentSuppliedDates, verifiedClaims, errors);

  if (report.sources.length === 0 && (snapshot.newsData?.items.length ?? 0) > 0) {
    warnings.push("Report contains no source entries despite supplied news items");
  }

  currentNumericValues = [];
  currentSuppliedDates = [];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    verified_claims: verifiedClaims
  };
}
