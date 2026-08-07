import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LOGIN_PATH } from "@/lib/auth/constants";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false }
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a link to set a new password."
      footer={
        <Link
          href={LOGIN_PATH}
          className="font-medium text-cyan-400 underline-offset-4 transition hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
