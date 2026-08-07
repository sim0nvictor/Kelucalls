/**
 * Auth error taxonomy.
 *
 * The admin sign-in flow collapses every possible failure into a single
 * "Invalid credentials" string, which makes a misconfigured environment look
 * exactly like a wrong password. That is the single biggest reason the
 * existing login is undebuggable. This module exists so the public account
 * system never repeats that mistake.
 *
 * Rules:
 *   - `not_configured` means the SERVER is broken, not the user. Never show
 *     it as a credential error.
 *   - Everything unmapped becomes `unknown` and is logged server side with the
 *     original message, while the user sees something generic.
 */

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_taken"
  | "weak_password"
  | "rate_limited"
  | "not_configured"
  | "expired_link"
  | "same_password"
  | "validation"
  | "unknown";

/**
 * Uniform return shape for every auth server action.
 *
 * Server actions return this instead of calling redirect() with an ?error=
 * query param, so the form can render a precise message and keep the user's
 * input. `useActionState` consumes it directly.
 */
export type AuthActionState = {
  status: "idle" | "error" | "success";
  code?: AuthErrorCode;
  message?: string;
  /** Field-level messages keyed by input name, e.g. { email: "..." }. */
  fieldErrors?: Partial<Record<string, string>>;
  /** Echoed back so the form can repopulate without losing what was typed. */
  values?: Partial<Record<string, string>>;
};

export const IDLE_AUTH_STATE: AuthActionState = { status: "idle" };

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "That email and password combination is not correct.",
  email_not_confirmed:
    "Please confirm your email address first. Check your inbox for the confirmation link.",
  email_taken: "An account with that email already exists. Try signing in instead.",
  weak_password: "That password is too weak. Use at least 8 characters.",
  rate_limited: "Too many attempts. Please wait a minute and try again.",
  not_configured:
    "Sign in is temporarily unavailable. This is a problem on our end, not with your account.",
  expired_link: "That link has expired or has already been used. Request a new one.",
  same_password: "Your new password must be different from your current one.",
  validation: "Please check the highlighted fields and try again.",
  unknown: "Something went wrong. Please try again.",
};

type SupabaseLikeError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

function asSupabaseError(error: unknown): SupabaseLikeError {
  if (error && typeof error === "object") return error as SupabaseLikeError;
  if (typeof error === "string") return { message: error };
  return {};
}

/**
 * Translate a Supabase auth error into one of our codes.
 *
 * Supabase has been migrating from free-text messages to stable `code`
 * strings, so we check the code first and fall back to message sniffing.
 */
export function mapAuthError(error: unknown): AuthErrorCode {
  const err = asSupabaseError(error);
  const code = (err.code ?? "").toLowerCase();
  const message = (err.message ?? "").toLowerCase();
  const status = err.status;

  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "rate_limited";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limited";
  }

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "invalid_credentials";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "email_not_confirmed";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "email_taken";
  }
  if (code === "weak_password" || message.includes("password should be at least")) {
    return "weak_password";
  }
  if (code === "same_password" || message.includes("should be different from the old password")) {
    return "same_password";
  }
  if (
    code === "otp_expired" ||
    message.includes("expired") ||
    message.includes("invalid or has expired") ||
    message.includes("token has expired")
  ) {
    return "expired_link";
  }

  return "unknown";
}

/** Build an error state, logging the raw cause for anything we could not map. */
export function authError(
  code: AuthErrorCode,
  extras?: Omit<AuthActionState, "status" | "code" | "message"> & { message?: string },
): AuthActionState {
  return {
    status: "error",
    code,
    message: extras?.message ?? AUTH_ERROR_MESSAGES[code],
    fieldErrors: extras?.fieldErrors,
    values: extras?.values,
  };
}

/**
 * Convert a caught Supabase error into an AuthActionState, logging the
 * original so a real failure is never silently swallowed.
 */
export function authErrorFrom(
  error: unknown,
  context: string,
  extras?: Omit<AuthActionState, "status" | "code" | "message">,
): AuthActionState {
  const code = mapAuthError(error);
  if (code === "unknown") {
    console.error(`[auth] ${context} failed:`, error);
  }
  return authError(code, extras);
}
