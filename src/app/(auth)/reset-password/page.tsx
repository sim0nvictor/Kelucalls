import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthBanner } from "@/components/auth/form-primitives";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false }
};

// The recovery link creates a session, so this page must never be cached.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // Following the emailed link puts a real session on the request. No session
  // here means the link expired, was already used, or was opened directly.
  const user = await getCurrentUser();

  return (
    <AuthShell
      title="Set a new password"
      subtitle={
        user
          ? "Choose a new password for your account. You will stay signed in on this device."
          : undefined
      }
      footer={
        <Link
          href={FORGOT_PASSWORD_PATH}
          className="font-medium text-cyan-400 underline-offset-4 transition hover:underline"
        >
          Request a new link
        </Link>
      }
    >
      {user ? (
        <ResetPasswordForm />
      ) : (
        <AuthBanner tone="error">
          This reset link has expired or has already been used. Request a new one to
          continue.
        </AuthBanner>
      )}
    </AuthShell>
  );
}
