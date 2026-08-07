import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthBanner } from "@/components/auth/form-primitives";
import { LoginForm } from "@/components/auth/login-form";
import { NEXT_PARAM, SIGNUP_PATH, safeNextPath } from "@/lib/auth/constants";
import { AUTH_ERROR_MESSAGES, type AuthErrorCode } from "@/lib/auth/errors";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Kelucalls account to follow callers, set alerts and track your submissions.",
  // Auth screens carry no ranking value and should never appear in search.
  robots: { index: false, follow: false }
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params[NEXT_PARAM]));

  // Errors bounced here from the email-link callback, e.g. an expired link.
  const code = first(params.error) as AuthErrorCode | undefined;
  const bannerMessage =
    code && code in AUTH_ERROR_MESSAGES ? AUTH_ERROR_MESSAGES[code] : null;

  const signupHref = `${SIGNUP_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to follow callers, get alerts and track the channels you submitted."
      footer={
        <>
          New to Kelucalls?{" "}
          <Link
            href={signupHref}
            className="font-medium text-cyan-400 underline-offset-4 transition hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {bannerMessage ? <AuthBanner tone="error">{bannerMessage}</AuthBanner> : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
