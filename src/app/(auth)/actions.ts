"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AUTH_CALLBACK_PATH,
  MIN_PASSWORD_LENGTH,
  NEXT_PARAM,
  RESET_PASSWORD_PATH,
  safeNextPath
} from "@/lib/auth/constants";
import {
  authError,
  authErrorFrom,
  type AuthActionState
} from "@/lib/auth/errors";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { getAppUrl } from "@/lib/server-env";

/**
 * Server actions for the public account system.
 *
 * Every action returns an AuthActionState rather than redirecting with an
 * ?error= code. That is deliberate: the admin flow throws away the distinction
 * between "wrong password", "unconfirmed email" and "Supabase env vars are
 * missing", which makes a broken deploy indistinguishable from a typo.
 *
 * redirect() throws internally in Next, so it is only ever called OUTSIDE a
 * try/catch - otherwise the redirect gets swallowed and reported as an error.
 */

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Deliberately permissive email check. Real validation is Supabase's job; this
 * only catches obvious typos before we spend a network round trip.
 */
function isValidEmail(value: string): boolean {
  if (value.includes(" ")) return false;
  const at = value.indexOf("@");
  if (at < 1) return false;
  if (value.indexOf("@", at + 1) !== -1) return false;
  const dot = value.lastIndexOf(".");
  return dot > at + 1 && dot < value.length - 1;
}

function callbackUrl(next: string): string {
  const base = `${getAppUrl()}${AUTH_CALLBACK_PATH}`;
  return `${base}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = readString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(readString(formData, NEXT_PARAM));
  const values = { email, [NEXT_PARAM]: next };

  const fieldErrors: Record<string, string> = {};
  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (!isValidEmail(email)) {
    fieldErrors.email = "That does not look like a valid email address.";
  }
  // No length floor on sign IN. An account created with a shorter password
  // must still be able to authenticate.
  if (!password) {
    fieldErrors.password = "Enter your password.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return authError("validation", { fieldErrors, values });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return authError("not_configured", { values });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return authErrorFrom(error, "signInWithPassword", { values });
  }

  revalidatePath("/", "layout");
  redirect(next);
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = readString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = readString(formData, "displayName");
  const next = safeNextPath(readString(formData, NEXT_PARAM));
  const values = { email, displayName, [NEXT_PARAM]: next };

  const fieldErrors: Record<string, string> = {};
  if (!email) {
    fieldErrors.email = "Enter your email address.";
  } else if (!isValidEmail(email)) {
    fieldErrors.email = "That does not look like a valid email address.";
  }
  if (!password) {
    fieldErrors.password = "Choose a password.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (displayName && displayName.length > 80) {
    fieldErrors.displayName = "Keep your display name under 80 characters.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return authError("validation", { fieldErrors, values });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return authError("not_configured", { values });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl(next),
      data: displayName ? { display_name: displayName } : undefined
    }
  });

  if (error) {
    return authErrorFrom(error, "signUp", { values });
  }

  // When email confirmation is on and the address is already registered,
  // Supabase returns a decoy user with an empty identities array rather than
  // an error, to avoid leaking which emails exist.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return authError("email_taken", { values });
  }

  // Confirmation disabled: Supabase already issued a session, so go straight in.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }

  return {
    status: "success",
    message: `Almost there. We sent a confirmation link to ${email} - open it to activate your account.`,
    values
  };
}

// ---------------------------------------------------------------------------
// Password reset request
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = readString(formData, "email").toLowerCase();
  const values = { email };

  if (!email || !isValidEmail(email)) {
    return authError("validation", {
      fieldErrors: { email: "Enter a valid email address." },
      values
    });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return authError("not_configured", { values });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(RESET_PASSWORD_PATH)
  });

  // Rate limiting is worth surfacing. Everything else is swallowed on purpose:
  // telling the user "no such account" would turn this form into an email
  // enumeration oracle.
  if (error) {
    const state = authErrorFrom(error, "resetPasswordForEmail", { values });
    if (state.code === "rate_limited") return state;
  }

  return {
    status: "success",
    message: "If an account exists for that address, a reset link is on its way.",
    values
  };
}

// ---------------------------------------------------------------------------
// Set a new password (after following the recovery link)
// ---------------------------------------------------------------------------

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!password) {
    fieldErrors.password = "Choose a new password.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Both passwords must match.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return authError("validation", { fieldErrors });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return authError("not_configured");
  }

  // The recovery link established a session in the callback route, so this
  // request is already authenticated as the user resetting their password.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return authError("expired_link");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return authErrorFrom(error, "updateUser(password)");
  }

  revalidatePath("/", "layout");
  redirect("/account?passwordUpdated=1");
}
