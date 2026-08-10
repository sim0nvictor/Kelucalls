"use server";

import { revalidatePath } from "next/cache";

import { NOTIFICATIONS_ENABLED_KEY } from "@/lib/account/alert-options";
import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Notification preference writes.
 *
 * Deliberately kept out of ./actions.ts: that file already works and covers
 * watchlist, alert rules and profile. A new concern gets a new module rather
 * than a rewrite of a stable one.
 *
 * This file carries "use server", so every export must be an async function.
 * NOTIFICATIONS_ENABLED_KEY therefore lives in ./alert-options.ts.
 */

export type NotificationPrefResult = {
  ok: boolean;
  code?: "unauthenticated" | "not_configured" | "failed";
  error?: string;
};

export async function setNotificationsEnabledAction(
  enabled: boolean
): Promise<NotificationPrefResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      code: "not_configured",
      error: "Accounts are temporarily unavailable."
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, code: "unauthenticated", error: "Sign in to do that." };
  }

  // Read-modify-write so unrelated preference keys survive. Racing yourself
  // across two tabs could drop a key, which is an acceptable trade against
  // hand-rolling a jsonb merge for a single boolean.
  const { data: row, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (readError) {
    console.error("[account] read preferences failed:", readError);
    return {
      ok: false,
      code: "failed",
      error: "Could not update your notification settings."
    };
  }

  const currentPreferences =
    (row as unknown as { preferences: Record<string, unknown> | null } | null)
      ?.preferences ?? {};

  const { error } = await supabase
    .from("profiles")
    .update({
      preferences: { ...currentPreferences, [NOTIFICATIONS_ENABLED_KEY]: enabled }
    })
    .eq("id", userData.user.id);

  if (error) {
    console.error("[account] update preferences failed:", error);
    return {
      ok: false,
      code: "failed",
      error: "Could not update your notification settings."
    };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/alerts`);
  revalidatePath(ACCOUNT_BASE_PATH);
  return { ok: true };
}
