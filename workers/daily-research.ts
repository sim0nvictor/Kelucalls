import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: false });

import {
  collectDailyResearchSnapshot,
  saveDailyResearchReport,
  saveDailyResearchSnapshot
} from "../src/lib/research/snapshot-store";
import { generateDailyResearchReport } from "../src/lib/research/generator";
import { createDailyResearchArticleDraft } from "../src/lib/research/article";
import { validateDailyResearchReport } from "../src/lib/research/validator";
import {
  claimResearchRun,
  notifyResearchAdmins,
  updateResearchRun
} from "../src/lib/research/run-store";

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(" or ")}`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function main() {
  const startedAt = Date.now();
  const runDate = process.env.RESEARCH_RUN_DATE?.trim() || new Date().toISOString().slice(0, 10);
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const claim = await claimResearchRun(supabase, runDate);
  if (!claim.claimed) {
    console.log(JSON.stringify({
      runId: claim.run.id,
      runDate,
      state: claim.run.state,
      skipped: true,
      reason: claim.run.state === "draft" ? "daily report already exists" : "run already active"
    }, null, 2));
    return;
  }

  const runId = claim.run.id;
  const updateState = (state: string, values: Record<string, unknown> = {}) =>
    updateResearchRun(supabase, runId, { state, ...values });

  try {
    await updateState("collecting");
    const snapshot = await collectDailyResearchSnapshot(supabase);
    const providerEntries = Object.entries(snapshot.providerStatus);
    const providersSucceeded = providerEntries.filter(([, status]) => status.ok).map(([name]) => name);
    const providersFailed = providerEntries.filter(([, status]) => !status.ok).map(([name]) => name);
    const apiCalls = providerEntries.length;
    await updateState("analyzing", {
      api_calls: apiCalls,
      providers_succeeded: providersSucceeded,
      providers_failed: providersFailed
    });

    const snapshotRow = await saveDailyResearchSnapshot(supabase, snapshot);
    await updateState("generating");
    const report = await generateDailyResearchReport(snapshot);

    await updateState("validating");
    const validation = validateDailyResearchReport(snapshot, report);
    await updateState("validating", { validation_result: validation });
    if (!validation.valid) {
      throw new Error(`Research report validation failed: ${JSON.stringify(validation)}`);
    }

    const reportId = await saveDailyResearchReport(supabase, snapshot, report);
    const article = await createDailyResearchArticleDraft(report);
    const notifiedAdmins = await notifyResearchAdmins(supabase, String(article.id), runDate);
    const durationMs = Date.now() - startedAt;
    await updateState("draft", {
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      generated_report_id: reportId,
      article_id: article.id
    });

    console.log(JSON.stringify({
      runId,
      runDate,
      state: "draft",
      durationMs,
      apiCalls,
      providersSucceeded,
      providersFailed,
      generatedReportId: reportId,
      validation,
      draftLocation: `/kx-admin/insights?article=${article.id}`,
      article,
      notifiedAdmins,
      snapshotId: snapshotRow.id
    }, null, 2));
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await updateResearchRun(supabase, runId, {
      state: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    worker: "daily-research",
    state: "failed",
    error: describeError(error)
  }));
  process.exitCode = 1;
});