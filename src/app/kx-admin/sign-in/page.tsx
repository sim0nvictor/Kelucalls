import { redirect } from "next/navigation";

import { signInAdminAction } from "@/app/kx-admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminIdentity } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";

type SignInPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();

  if (identity) {
    redirect(params.next?.startsWith(ADMIN_BASE_PATH) ? params.next : ADMIN_BASE_PATH);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-white/10 bg-[#091223]/88">
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Badge>Hidden route</Badge>
            <div>
              <h1 className="text-3xl font-semibold text-white">Kelucalls studio</h1>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Internal access uses Supabase Auth plus an allowlisted admin role check on the server.
              </p>
            </div>
          </div>

          {params.error === "invalid" ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              Invalid credentials or this account is not allowlisted in `admin_users`.
            </div>
          ) : null}

          {params.error === "rate_limited" ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Too many sign-in attempts. Wait a few minutes and retry.
            </div>
          ) : null}

          <form action={signInAdminAction} className="space-y-4">
            <input type="hidden" name="nextUrl" value={params.next || ADMIN_BASE_PATH} />
            <input
              name="email"
              type="email"
              placeholder="Admin email"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            />
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
