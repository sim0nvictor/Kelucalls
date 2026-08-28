import type { SupabaseClient } from "@supabase/supabase-js";

export type ResearchRunState =
  | "pending"
  | "collecting"
  | "analyzing"
  | "generating"
  | "validating"
  | "draft"
  | "failed";

type ResearchRunRow = {
  id: string;
  run_date: string;
  state: ResearchRunState;
  attempt: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  api_calls: number;
  providers_succeeded: string[];
  providers_failed: string[];
  generated_report_id: string | null;
  article_id: string | null;
  validation_result: Record<string, unknown>;
  error: string | null;
};

const ACTIVE_STATES = new Set<ResearchRunState>([
  "collecting",
  "analyzing",
  "generating",
  "validating"
]);
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

export async function claimResearchRun(
  supabase: SupabaseClient,
  runDate: string
): Promise<{ run: ResearchRunRow; claimed: boolean }> {
  const { data, error } = await supabase
    .from("research_run")
    .insert({ run_date: runDate, state: "pending" })
    .select("*")
    .single();

  if (!error && data) return { run: data as ResearchRunRow, claimed: true };
  if (error?.code !== "23505") throw error ?? new Error("Failed to create research run");

  const existingResult = await supabase
    .from("research_run")
    .select("*")
    .eq("run_date", runDate)
    .single();
  if (existingResult.error || !existingResult.data) {
    throw existingResult.error ?? new Error("Failed to read existing research run");
  }

  const existing = existingResult.data as ResearchRunRow;
  if (existing.state === "draft") return { run: existing, claimed: false };
  const isStale = ACTIVE_STATES.has(existing.state) &&
    Date.parse(existing.updated_at) < Date.now() - STALE_RUN_MS;
  if (ACTIVE_STATES.has(existing.state) && !isStale) return { run: existing, claimed: false };

  const { data: reclaimed, error: reclaimError } = await supabase
    .from("research_run")
    .update({
      state: "pending",
      attempt: existing.attempt + 1,
      started_at: new Date().toISOString(),
      completed_at: null,
      duration_ms: null,
      error: null
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (reclaimError || !reclaimed) throw reclaimError ?? new Error("Failed to reclaim research run");
  return { run: reclaimed as ResearchRunRow, claimed: true };
}

export async function updateResearchRun(
  supabase: SupabaseClient,
  runId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("research_run")
    .update(values)
    .eq("id", runId);
  if (error) throw error;
}

export async function notifyResearchAdmins(
  supabase: SupabaseClient,
  articleId: string,
  runDate: string
): Promise<number> {
  const { data: admins, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("is_active", true);
  if (adminError) throw adminError;

  const rows = (admins ?? []).map((admin) => ({
    user_id: admin.user_id,
    title: "Daily Research draft ready",
    body: `The ${runDate} Daily Research Report is ready for review.`,
    url: "/kx-admin/insights",
    status: "pending",
    payload: {
      type: "daily_research_draft",
      article_id: articleId,
      run_date: runDate
    }
  }));
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("user_notifications").insert(rows);
  if (error) throw error;
  return rows.length;
}
