import { NextResponse } from "next/server";


import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { getAppUrl } from "@/lib/server-env";

/**
 * Sign out.
 *
 * POST only. A GET sign-out endpoint can be triggered by any <img> tag or
 * link prefetch on the page, which logs people out at random.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[auth/sign-out] signOut failed:", error);
    }
  }

  const redirectTo = new URL("/", getAppUrl());
  return NextResponse.redirect(redirectTo, { status: 303 });
}

