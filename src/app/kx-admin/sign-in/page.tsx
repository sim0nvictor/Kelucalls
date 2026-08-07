import { redirect } from "next/navigation";

import { signInAdminAction } from "@/app/kx-admin/sign-in/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminIdentity } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";

type SignInPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

type ErrorTone = "danger" | "warning";

/**
 * Every failure used to collapse into one "invalid" message, which meant a
 * misconfigured deployment looked exactly like a typo. These stay vague about
 * whether an account exists, but precise about anything the operator can fix.
 */
const ERROR_MESSAGES: Record<string, { tone: ErrorTone; message: string }> = {
  // Kept so older links and any remaining caller still render sensibly.
  invalid: {
    tone: "danger",
    message: "Invalid credentials or this account is not allowlisted in `admin_users`."
  },
  invalid_credentials: {
    tone: "danger",
    message: "That email and password did not match an account."
  },
  not_admin: {
    tone: "danger",
    message: "Those credentials are valid, but the account is not allowlisted in `admin_users`."
  },
  not_configured: {
    tone: "warning",
    message:
      "Admin auth is not configured on this deployment. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY."
  },
  missing_email: {
    tone: "danger",
    message: "Enter a valid email address."
  },
  missing_password: {
    tone: "danger",
    message: "Enter your password."
  },
  rate_limited: {
    tone: "warning",
    message: "Too many sign-in attempts. Wait a few minutes and retry."
  },
  unknown: {
    tone: "danger",
    message: "Sign-in failed unexpectedly. Check the server logs for details."
  }
};

const TONE_CLASSES: Record<ErrorTone, string> = {
  danger: "rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200",
  warning: "rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const identity = await getAdminIdentity();

  if (identity) {
    redirect(params.next?.startsWith(ADMIN_BASE_PATH) ? params.next : ADMIN_BASE_PATH);
  }

  const errorInfo = params.error
    ? ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.unknown
    : null;

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

          {errorInfo ? <div className={TONE_CLASSES[errorInfo.tone]}>{errorInfo.message}</div> : null}

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
