import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { loginUrlFor, LOGIN_PATH } from "@/lib/auth/constants";

/**
 * Session helpers for the public account system.
 *
 * Always uses supabase.auth.getUser(), never getSession(). getSession() reads
 * the cookie and trusts it without verifying the JWT signature, which means a
 * forged cookie would pass. getUser() validates against the auth server.
 *
 * Every accessor is wrapped in React cache() so a page that checks the user in
 * the layout, the page and three components still only does one round trip per
 * request.
 */

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  telegram_handle: string | null;
  time_zone: string;
  marketing_opt_in: boolean;
  onboarding_completed_at: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
};

export type SessionUser = {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  createdAt: string;
};

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    createdAt: user.created_at,
  };
}

/** The signed-in user, or null. Never throws. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return toSessionUser(data.user);
});

/** The signed-in user's profile row, or null. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, bio, telegram_handle, time_zone, marketing_opt_in, onboarding_completed_at, preferences, created_at",
    )
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error) {
    console.error("[auth] failed to load profile:", error);
    return null;
  }

  return (data as Profile | null) ?? null;
});

/**
 * The path of the request currently being rendered.
 *
 * Middleware sets x-kelucalls-pathname on every request, which lets a server
 * component know where the user actually is without prop drilling.
 */
async function currentPathname(): Promise<string | null> {
  try {
    const headerList = await headers();
    return headerList.get("x-kelucalls-pathname");
  } catch {
    return null;
  }
}

/**
 * Require a signed-in user or redirect to the login page.
 *
 * Middleware already guards /account/*, so this is defence in depth - and it
 * is what makes any NEW protected route safe by default even if someone
 * forgets to update the middleware matcher.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;

  const from = await currentPathname();
  redirect(from ? loginUrlFor(from) : LOGIN_PATH);
}

/** Convenience for UI that just needs a name to show. */
export function displayNameFor(
  user: SessionUser | null,
  profile: Profile | null,
): string {
  return (
    profile?.display_name?.trim() ||
    profile?.username ||
    user?.email?.split("@")[0] ||
    "there"
  );
}
