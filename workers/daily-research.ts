import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: false });

import {
  collectDailyResearchSnapshot,
  fromResearchSnapshotRow,
  readDailyResearchSnapshot,
  saveDailyResearchReport,
  saveDailyResearchSnapshot
} from "../src/lib/research/snapshot-store";
import { DailyResearchLLMError, generateDailyResearchReport } from "../src/lib/research/generator";
import { createDailyResearchArticleDraft } from "../src/lib/research/article";
import { validateDailyResearchReport } from "../src/lib/research/validator";
import type { DailyResearchReport, DailyResearchSnapshot } from "../src/lib/research/types";
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

function computeNextRetryAt(retryAfterSeconds: number | null): string {
  const baseDelayMs = 15 * 60_000;
  const retryAfterMs =
    typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds) * 1000
      : baseDelayMs;
  const jitterMs = Math.floor(Math.random() * 30_000);
  return new Date(Date.now() + retryAfterMs + jitterMs).toISOString();
}

async function runPipelineFromSnapshot(
  supabase: SupabaseClient,
  runId: string,
  runDate: string,
  snapshot: DailyResearchSnapshot,
  startedAt: number
) {
  const updateState = (state: string, values: Record<string, unknown> = {}) =>
    updateResearchRun(supabase, runId, { state, ...values });

  const providerEntries = Object.entries(snapshot.providerStatus);
  const providersSucceeded = providerEntries.filter(([, status]) => status.ok).map(([name]) => name);
  const providersFailed = providerEntries.filter(([, status]) => !status.ok).map(([name]) => name);
  const apiCalls = providerEntries.length;

  await updateState("analyzing", {
    api_calls: apiCalls,
    providers_succeeded: providersSucceeded,
    providers_failed: providersFailed
  });

  // generation
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
    notifiedAdmins
  }, null, 2));
}

async function main() {
  const startedAt = Date.now();
  const runDate = process.env.RESEARCH_RUN_DATE?.trim() || new Date().toISOString().slice(0, 10);
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Early deferred guard: exit before claiming/reclaiming if next_retry_at is in the future.
  const existingRunResult = await supabase
    .from("research_run")
    .select("id, run_date, state, next_retry_at, snapshot_id, snapshot_date, attempt")
    .eq("run_date", runDate)
    .single();

  if (!existingRunResult.error && existingRunResult.data) {
    const existingRun = existingRunResult.data as {
      id: string;
      run_date: string;
      state: string;
      next_retry_at: string | null;
      snapshot_id: string | null;
      snapshot_date: string | null;
      attempt: number;
    };

    if (existingRun.state === "deferred" && existingRun.next_retry_at) {
      const nextRetryAtMs = Date.parse(existingRun.next_retry_at);
      if (Number.isFinite(nextRetryAtMs) && nextRetryAtMs > Date.now()) {
        console.log(JSON.stringify({
          worker: "daily-research",
          runDate,
          state: "deferred",
          skipped: true,
          reason: "next_retry_at_not_reached",
          nextRetryAt: existingRun.next_retry_at,
          snapshotId: existingRun.snapshot_id,
          snapshotDate: existingRun.snapshot_date,
          attempt: existingRun.attempt
        }, null, 2));
        return;
      }
    }
  }

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

  // Resume path: if we already have a snapshot for this date and no generated report, reuse it.
  const persistedSnapshotRow = await readDailyResearchSnapshot(supabase, runDate);
  if (persistedSnapshotRow && persistedSnapshotRow.generated_report) {
    console.log(JSON.stringify({
      runId,
      runDate,
      state: "draft",
      skipped: true,
      reason: "generated_report_already_exists",
      snapshotId: persistedSnapshotRow.id
    }, null, 2));
    return;
  }

  if (persistedSnapshotRow && !persistedSnapshotRow.generated_report) {
    const snapshot = fromResearchSnapshotRow(persistedSnapshotRow);

    await updateState("generating", {
      snapshot_id: persistedSnapshotRow.id,
      snapshot_date: persistedSnapshotRow.snapshot_date,
      next_retry_at: null,
      llm_error: null
    });

    try {
      await runPipelineFromSnapshot(supabase, runId, runDate, snapshot, startedAt);
      return;
    } catch (error) {
      if (error instanceof DailyResearchLLMError && error.retryable) {
        const nextRetryAt = computeNextRetryAt(error.retryAfterSeconds);
        await updateResearchRun(supabase, runId, {
          state: "deferred",
          snapshot_id: persistedSnapshotRow.id,
          snapshot_date: persistedSnapshotRow.snapshot_date,
          next_retry_at: nextRetryAt,
          llm_error: error.message.slice(0, 1000)
        });

        console.warn(JSON.stringify({
          worker: "daily-research",
          runId,
          runDate,
          state: "deferred",
          reason: "llm_retryable_error",
          nextRetryAt,
          snapshotId: persistedSnapshotRow.id,
          llmError: error.message
        }, null, 2));
        return;
      }
      throw error;
    }
  }

  let snapshotRow: { id: string; snapshot_date: string } | null = null;
  let snapshotProviders: { succeeded: string[]; failed: string[] } | null = null;
  let llmError: Error | null = null;

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

    await updateState("generating", {
      snapshot_id: snapshotRow.id,
      snapshot_date: snapshotRow.snapshot_date,
      next_retry_at: null,
      llm_error: null
    });

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
})