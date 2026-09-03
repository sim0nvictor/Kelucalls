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
import type { DailyResearchReport } from "../src/lib/research/types";
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

  let snapshotRow: { id: string; snapshot_date: string } | null = null;
  let snapshotProviders: { succeeded: string[]; failed: string[] } | null = null;

  try {
    await updateState("collecting");
    const snapshot = await collectDailyResearchSnapshot(supabase);
    const providerEntries = Object.entries(snapshot.providerStatus);
    const providersSucceeded = providerEntries.filter(([, status]) => status.ok).map(([name]) => name);
    const providersFailed = providerEntries.filter(([, status]) => !status.ok).map(([name]) => name);
    const apiCalls = providerEntries.length;
    
    snapshotProviders = { succeeded: providersSucceeded, failed: providersFailed };

    await updateState("analyzing", {
      api_calls: apiCalls,
      providers_succeeded: providersSucceeded,
      providers_failed: providersFailed
    });

    snapshotRow = await saveDailyResearchSnapshot(supabase, snapshot);
    
    // Attempt LLM generation, but don't let it discard the collected snapshot
    await updateState("generating");
    let llmError: Error | null = null;
    let report: DailyResearchReport | null = null;
    
    try {
      report = await generateDailyResearchReport(snapshot);
    } catch (error) {
      llmError = error instanceof Error ? error : new Error(String(error));
      // Log the error but continue to outer catch handler
      const errorMsg = llmError.message;
      console.error(JSON.stringify({
        worker: "daily-research",
        phase: "generating",
        state: "snapshot_saved_generation_failed",
        snapshotId: snapshotRow.id,
        snapshotDate: snapshotRow.snapshot_date,
        apiCalls,
        providersSucceeded: snapshotProviders.succeeded,
        providersFailed: snapshotProviders.failed,
        llmError: errorMsg,
        durationMs: Date.now() - startedAt
      }, null, 2));
    }
    
    // If LLM failed, propagate the error so it's handled in outer catch
    if (llmError) {
      throw llmError;
    }
    if (!report) {
      throw new Error("Daily research LLM generation returned no report");
    }

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
      providersSucceeded: snapshotProviders.succeeded,
      providersFailed: snapshotProviders.failed,
      generatedReportId: reportId,
      validation,
      draftLocation: `/kx-admin/insights?article=${article.id}`,
      article,
      notifiedAdmins,
      snapshotId: snapshotRow.id
    }, null, 2));
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    
    // If snapshot was saved, note that in the error message
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullErrorMsg = snapshotRow 
      ? `${errorMsg} (snapshot persisted: ${snapshotRow.id})`
      : errorMsg;
    
    await updateResearchRun(supabase, runId, {
      state: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error: fullErrorMsg.slice(0, 1000)
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
