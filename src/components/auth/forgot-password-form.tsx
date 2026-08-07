"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/app/(auth)/actions";
import { IDLE_AUTH_STATE } from "@/lib/auth/errors";
import {
  AuthStateBanner,
  SubmitButton,
  TextField
} from "@/components/auth/form-primitives";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    IDLE_AUTH_STATE
  );

  if (state.status === "success") {
    return <AuthStateBanner state={state} />;
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <AuthStateBanner state={state} />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        autoFocus
        required
      />

      <SubmitButton pending={isPending} pendingLabel="Sending link...">
        Send reset link
      </SubmitButton>
    </form>
  );
}
