import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { LOGIN_PATH, NEXT_PARAM, safeNextPath } from "@/lib/auth/constants";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a free Kelucalls account to build a watchlist, get alerts on new calls and track channels you submit.",
  robots: { index: false, follow: false }
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params[NEXT_PARAM]));
  const loginHref = `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free. Build a watchlist, get alerted when the callers you follow post, and keep tabs on the channels you submit."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-cyan-400 underline-offset-4 transition hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
