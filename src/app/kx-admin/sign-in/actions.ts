"use server";

import { redirect } from "next/navigation";

import { AdminAuthError, signInAdminWithPassword } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH, ADMIN_SIGN_IN_PATH } from "@/lib/admin/constants";
import { checkRateLimit, clearRateLimit } from "@/lib/admin/rate-limit";

/**
 * Admin sign in.
 *
 * Lives in its own module rather than in src/app/kx-admin/actions.ts, which is
 * a large file holding every other admin mutation. Keeping the auth entry
 * point small and separate means changing it cannot put the rest of the admin
 * panel at risk.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Sign in never applies password policy. The old version ran the submitted
 *    password through a zod min(8) check and redirected with "invalid" before
 *    Supabase was ever called, which locked out any admin whose password
 *    predated that rule. Password strength belongs at signup, not here.
 * 2. Failures are distinguishable. Wrong password, not allowlisted, and
 *    missing environment variables are genuinely different problems.
 */

const SIGN_IN_LIMIT = 8;
const SIGN_IN_WINDOW_MS = 1000 * 60 * 10;

function readField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Deliberately permissive structural check, not a validity check. Anything
 * shaped like an address goes to Supabase, which is the real authority.
 */
function looksLikeEmail(value: string) {
  const at = value.indexOf("@");
  if (at < 1) return false;

  const dot = value.indexOf(".", at);
  return dot > at + 1 && dot < value.length - 1 && value.indexOf(" ") === -1;
}

export async function signInAdminAction(formData: FormData) {
  const email = readField(formData, "email").trim().toLowerCase();
  // Never trimmed: leading and trailing spaces can be part of a real password.
  const password = readField(formData, "password");

  const requestedNext = readField(formData, "nextUrl").trim();
  const nextUrl = requestedNext.startsWith(ADMIN_BASE_PATH) ? requestedNext : ADMIN_BASE_PATH;

  const rateKey = `admin-sign-in:${email}`;
  let code: string | null = null;

  if (!looksLikeEmail(email)) {
    code = "missing_email";
  } else if (password.length === 0) {
    code = "missing_password";
  }

  if (!code) {
    const limit = checkRateLimit(rateKey, SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);
    if (!limit.allowed) {
      code = "rate_limited";
    }
  }

  if (!code) {
    try {
      await signInAdminWithPassword(email, password);
      // Success releases the budget, so a few typos followed by a correct
      // password cannot lock an admin out on their next sign in.
      clearRateLimit(rateKey);
    } catch (error) {
      code = error instanceof AdminAuthError ? error.code : "unknown";

      if (code === "unknown") {
        console.error("[admin sign-in] unexpected failure:", error);
      }
    }
  }

  // redirect() works by throwing, so it must be called outside the try block.
  if (code) {
    redirect(`${ADMIN_SIGN_IN_PATH}?error=${code}&next=${encodeURIComponent(nextUrl)}`);
  }

  redirect(nextUrl);
}
