"use client";

import { useActionState } from "react";

import { updatePasswordAction } from "@/app/(auth)/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { IDLE_AUTH_STATE } from "@/lib/auth/errors";
import {
  AuthStateBanner,
  SubmitButton,
  TextField
} from "@/components/auth/form-primitives";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    IDLE_AUTH_STATE
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <AuthStateBanner state={state} />

      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={state.fieldErrors?.password}
        autoFocus
        required
      />

      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        required
      />

      <SubmitButton pending={isPending} pendingLabel="Updating...">
        Update password
      </SubmitButton>
    </form>
  );
}
