"use client";

import { useActionState } from "react";

import { signUpAction } from "@/app/(auth)/actions";
import { MIN_PASSWORD_LENGTH, NEXT_PARAM } from "@/lib/auth/constants";
import { IDLE_AUTH_STATE } from "@/lib/auth/errors";
import {
  AuthStateBanner,
  SubmitButton,
  TextField
} from "@/components/auth/form-primitives";

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(signUpAction, IDLE_AUTH_STATE);

  // Once the confirmation email is out, replacing the form with the banner
  // stops people from submitting again and generating a second link.
  if (state.status === "success") {
    return <AuthStateBanner state={state} />;
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <AuthStateBanner state={state} />

      <input type="hidden" name={NEXT_PARAM} value={next} />

      <TextField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        placeholder="How you want to appear"
        hint="Optional. You can change this later."
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
        autoFocus
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Choose a password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={state.fieldErrors?.password}
        required
      />

      <SubmitButton pending={isPending} pendingLabel="Creating account...">
        Create account
      </SubmitButton>

      <p className="text-xs leading-relaxed text-slate-500">
        By creating an account you agree to our{" "}
        <a href="/terms" className="underline underline-offset-4 hover:text-slate-300">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-4 hover:text-slate-300">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
