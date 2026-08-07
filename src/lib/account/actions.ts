"use server";

import { revalidatePath } from "next/cache";

import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Write actions for the account area.
 *
 * Every one of these re-reads the user from getUser() rather than trusting an
 * id passed in from the client. RLS would catch a forged user_id anyway, but
 * defence in depth costs nothing here.
 */

export type AccountActionResult = {
  ok: boolean;
  /** "unauthenticated" tells the client to bounce to the login page. */
  code?: "unauthenticated" | "not_configured" | "failed";
  error?: string;
};

const OK: AccountActionResult = { ok: true };

async function getClientAndUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      supabase: null,
      user: null,
      failure: {
        ok: false,
        code: "not_configured",
        error: "Accounts are temporarily unavailable."
      } satisfies AccountActionResult
    };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return {
      supabase,
      user: null,
      failure: {
        ok: false,
        code: "unauthenticated",
        error: "Sign in to do that."
      } satisfies AccountActionResult
    };
  }

  return { supabase, user: data.user, failure: null };
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function setChannelFollowAction(
  channelId: string,
  follow: boolean
): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  if (follow) {
    const { error } = await supabase
      .from("user_channel_watchlist")
      .upsert(
        { user_id: user.id, channel_id: channelId },
        { onConflict: "user_id,channel_id", ignoreDuplicates: true }
      );

    if (error) {
      console.error("[account] follow channel failed:", error);
      return { ok: false, code: "failed", error: "Could not follow that channel." };
    }
  } else {
    const { error } = await supabase
      .from("user_channel_watchlist")
      .delete()
      .eq("user_id", user.id)
      .eq("channel_id", channelId);

    if (error) {
      console.error("[account] unfollow channel failed:", error);
      return { ok: false, code: "failed", error: "Could not unfollow that channel." };
    }
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/watchlist`);
  revalidatePath(ACCOUNT_BASE_PATH);
  return OK;
}

export async function setWatchlistMutedAction(
  entryId: string,
  isMuted: boolean
): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  const { error } = await supabase
    .from("user_channel_watchlist")
    .update({ is_muted: isMuted })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[account] mute watchlist entry failed:", error);
    return { ok: false, code: "failed", error: "Could not update that channel." };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/watchlist`);
  return OK;
}

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

/**
 * Create an alert rule.
 *
 * ruleType is intentionally a plain string matching the alert_rule_type enum -
 * adding a new alert kind should not require touching this function.
 */
export async function createAlertRuleAction(input: {
  ruleType: string;
  channelId?: string | null;
  tokenId?: string | null;
  deliveryChannels?: string[];
  conditions?: Record<string, unknown>;
}): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  const { error } = await supabase.from("user_alert_rules").insert({
    user_id: user.id,
    rule_type: input.ruleType,
    channel_id: input.channelId ?? null,
    token_id: input.tokenId ?? null,
    delivery_channels: input.deliveryChannels ?? ["in_app"],
    conditions: input.conditions ?? {}
  });

  if (error) {
    console.error("[account] create alert rule failed:", error);
    return { ok: false, code: "failed", error: "Could not create that alert." };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/alerts`);
  revalidatePath(ACCOUNT_BASE_PATH);
  return OK;
}

export async function setAlertRuleActiveAction(
  ruleId: string,
  isActive: boolean
): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  const { error } = await supabase
    .from("user_alert_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[account] toggle alert rule failed:", error);
    return { ok: false, code: "failed", error: "Could not update that alert." };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/alerts`);
  return OK;
}

export async function deleteAlertRuleAction(ruleId: string): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  const { error } = await supabase
    .from("user_alert_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[account] delete alert rule failed:", error);
    return { ok: false, code: "failed", error: "Could not delete that alert." };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/alerts`);
  revalidatePath(ACCOUNT_BASE_PATH);
  return OK;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ProfileFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export const IDLE_PROFILE_STATE: ProfileFormState = { status: "idle" };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;

function isValidUsername(value: string): boolean {
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) return false;
  for (const char of value) {
    const isLower = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLower && !isDigit && char !== "_") return false;
  }
  return true;
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) {
    return { status: "error", message: failure?.error ?? "Something went wrong." };
  }

  const displayName = readString(formData, "displayName");
  const username = readString(formData, "username").toLowerCase();
  const telegramHandle = readString(formData, "telegramHandle").replace(/^@+/, "");
  const bio = readString(formData, "bio");
  const marketingOptIn = formData.get("marketingOptIn") === "on";

  const fieldErrors: Record<string, string> = {};
  if (displayName.length > 80) {
    fieldErrors.displayName = "Keep this under 80 characters.";
  }
  if (username && !isValidUsername(username)) {
    fieldErrors.username =
      "Use 3-30 characters: lowercase letters, numbers and underscores only.";
  }
  if (bio.length > 500) {
    fieldErrors.bio = "Keep your bio under 500 characters.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      username: username || null,
      telegram_handle: telegramHandle || null,
      bio: bio || null,
      marketing_opt_in: marketingOptIn
    })
    .eq("id", user.id);

  if (error) {
    // 23505 is a unique violation, which here can only be the username.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "That username is already taken.",
        fieldErrors: { username: "Already taken. Try another." }
      };
    }
    console.error("[account] update profile failed:", error);
    return { status: "error", message: "Could not save your changes. Please try again." };
  }

  revalidatePath(`${ACCOUNT_BASE_PATH}/settings`);
  revalidatePath(ACCOUNT_BASE_PATH);
  return { status: "success", message: "Your profile has been updated." };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markAllNotificationsReadAction(): Promise<AccountActionResult> {
  const { supabase, user, failure } = await getClientAndUser();
  if (failure || !supabase || !user) return failure ?? { ok: false, code: "failed" };

  const { error } = await supabase
    .from("user_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[account] mark notifications read failed:", error);
    return { ok: false, code: "failed", error: "Could not update your notifications." };
  }

  revalidatePath(ACCOUNT_BASE_PATH);
  return OK;
}
