import { createAdminDb } from "@/lib/admin/data";

import type { DailyResearchReport, DailyResearchSectionKey } from "./types";
import { DAILY_RESEARCH_SECTION_KEYS } from "./types";

const SECTION_TITLES: Record<DailyResearchSectionKey, string> = {
  executive_summary: "Executive Summary",
  global_macro_context: "Global/Macro Context",
  crypto_market_snapshot: "Crypto Market Snapshot",
  fear_and_greed: "Fear & Greed",
  technology_ai: "Technology/AI",
  geopolitical_economic_developments: "Geopolitical/Economic Developments",
  kol_narrative_intelligence: "KOL/Narrative Intelligence",
  kelucalls_intelligence: "Kelucalls Intelligence",
  cross_layer_signals: "Cross-Layer Signals",
  emerging_narratives: "Emerging Narratives",
  risks_contradicting_evidence: "Risks / Contradicting Evidence",
  conclusion: "Conclusion"
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function availableSlug(db: ReturnType<typeof createAdminDb>, base: string): Promise<string> {
  const normalizedBase = slugify(base) || "daily-research";
  let candidate = normalizedBase;
  let suffix = 2;

  while (true) {
    const { data, error } = await db.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${normalizedBase.slice(0, 80 - String(suffix).length - 1)}-${suffix}`;
    suffix += 1;
  }
}

function reportContent(report: DailyResearchReport): string {
  const sections = DAILY_RESEARCH_SECTION_KEYS.map((key) => {
    const section = report.sections[key];
    const evidence = section.evidence.length > 0
      ? `\n\n_Evidence: ${section.evidence.join(", ")}_`
      : "";
    return `## ${SECTION_TITLES[key]}\n\n${section.content}${evidence}`;
  });

  const sources = report.sources.length > 0
    ? report.sources
        .map((source) => `- ${source.url ? `[${source.title}](${source.url})` : source.title}`)
        .join("\n")
    : "No sources were supplied in the research snapshot.";

  return `${sections.join("\n\n")}\n\n## Sources\n\n${sources}\n\n## Financial Disclaimer\n\n${report.financialDisclaimer}`;
}

function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export async function createDailyResearchArticleDraft(report: DailyResearchReport) {
  const db = createAdminDb();
  const title = `Daily Research Report | ${report.snapshotDate}`;

  const { data: existing, error: existingError } = await db
    .from("articles")
    .select("id,title,slug,status")
    .contains("metadata", {
      generated_by: "daily-research-generator",
      snapshot_date: report.snapshotDate
    })
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const slug = await availableSlug(db, `daily-research-${report.snapshotDate}`);
  const summary = bounded(report.sections.executive_summary.content, 1000);
  const seoTitle = bounded(title, 70);
  const metaDescription = bounded(summary, 160);

  const { data: category, error: categoryError } = await db
    .from("article_categories")
    .select("id")
    .eq("slug", "research-reports")
    .maybeSingle();
  if (categoryError) throw categoryError;

  const { data, error } = await db
    .from("articles")
    .insert({
      title,
      slug,
      summary,
      content: reportContent(report),
      author: "Kelucalls Team",
      category_id: category?.id ?? null,
      status: "draft",
      published_at: null,
      scheduled_at: null,
      is_featured: false,
      is_trending: false,
      is_editor_pick: false,
      reading_time_minutes: 8,
      seo_title: seoTitle,
      meta_description: metaDescription,
      twitter_card: "summary_large_image",
      metadata: {
        generated_by: "daily-research-generator",
        snapshot_date: report.snapshotDate,
        generated_at: report.generatedAt,
        source_report_schema: report.schemaVersion
      }
    })
    .select("id,title,slug,status")
    .single();

  if (error) throw error;
  return data;
}