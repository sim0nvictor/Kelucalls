"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction } from "@/app/(auth)/actions";
import { FORGOT_PASSWORD_PATH, NEXT_PARAM } from "@/lib/auth/constants";
import { IDLE_AUTH_STATE } from "@/lib/auth/errors";
import {
  AuthStateBanner,
  SubmitButton,
  TextField
} from "@/components/auth/form-primitives";

export function LoginForm({ next, defaultEmail }: { next: string; defaultEmail?: string }) {
  const [state, formAction, isPending] = useActionState(signInAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <AuthStateBanner state={state} />

      <input type="hidden" name={NEXT_PARAM} value={next} />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.values?.email ?? defaultEmail}
        error={state.fieldErrors?.email}
        autoFocus
        required
      />

      <div className="space-y-1.5">
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={state.fieldErrors?.password}
          required
        />
        <div className="flex justify-end">
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="text-xs text-slate-400 underline-offset-4 transition hover:text-cyan-300 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      <SubmitButton pending={isPending} pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
    </form>
  );
}
