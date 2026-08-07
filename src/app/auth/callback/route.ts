import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  LOGIN_PATH,
  NEXT_PARAM,
  RESET_PASSWORD_PATH,
  safeNextPath
} from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { getAppUrl } from "@/lib/server-env";

/**
 * Single landing point for every emailed auth link: signup confirmation,
 * magic link, email change and password recovery.
 *
 * Supabase sends one of two shapes depending on how the project is set up:
 *   - ?code=...                  (PKCE flow)
 *   - ?token_hash=...&type=...   (older email link flow)
 * Both are handled so this keeps working regardless of the dashboard config.
 *
 * Redirects are built against getAppUrl() rather than the request origin,
 * because behind Railway's proxy the origin can resolve to an internal host.
 */

function destination(path: string) {
  return new URL(path, getAppUrl());
}

function failure(reason: string) {
  const url = destination(LOGIN_PATH);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Supabase reports its own failures back on the redirect URL.
  const supabaseError = searchParams.get("error_description") ?? searchParams.get("error");
  if (supabaseError) {
    console.error("[auth/callback] provider returned an error:", supabaseError);
    return failure("expired_link");
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Recovery links must land on the set-a-new-password screen, never on the
  // account dashboard, so an interrupted reset cannot leave a live session
  // sitting on a page the user did not ask for.
  const next =
    type === "recovery"
      ? RESET_PASSWORD_PATH
      : safeNextPath(searchParams.get(NEXT_PARAM));

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("[auth/callback] Supabase auth is not configured.");
    return failure("not_configured");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error);
      return failure("expired_link");
    }
    return NextResponse.redirect(destination(next));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error);
      return failure("expired_link");
    }
    return NextResponse.redirect(destination(next));
  }

  return failure("expired_link");
}
