"use client";

import { useActionState } from "react";

import {
  IDLE_PROFILE_STATE,
  updateProfileAction
} from "@/lib/account/actions";
import { AuthBanner, SubmitButton, TextField } from "@/components/auth/form-primitives";
import type { Profile } from "@/lib/auth/session";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction, isPending] = useActionState(
    updateProfileAction,
    IDLE_PROFILE_STATE
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "success" && state.message ? (
        <AuthBanner tone="success">{state.message}</AuthBanner>
      ) : null}
      {state.status === "error" && state.message ? (
        <AuthBanner tone="error">{state.message}</AuthBanner>
      ) : null}

      <TextField
        label="Display name"
        name="displayName"
        defaultValue={profile?.display_name ?? ""}
        error={state.fieldErrors?.displayName}
        placeholder="How you appear on Kelucalls"
      />

      <TextField
        label="Username"
        name="username"
        defaultValue={profile?.username ?? ""}
        error={state.fieldErrors?.username}
        hint="Lowercase letters, numbers and underscores. Used for your public profile."
        placeholder="satoshi_calls"
      />

      <TextField
        label="Telegram handle"
        name="telegramHandle"
        defaultValue={profile?.telegram_handle ?? ""}
        error={state.fieldErrors?.telegramHandle}
        hint="Optional. Needed later if you want alerts delivered on Telegram."
        placeholder="yourhandle"
      />

      <div className="space-y-1.5">
        <label htmlFor="bio" className="block text-sm font-medium text-slate-200">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={profile?.bio ?? ""}
          maxLength={500}
          className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/40"
          placeholder="A line or two about you."
        />
        {state.fieldErrors?.bio ? (
          <p className="text-xs text-red-300">{state.fieldErrors.bio}</p>
        ) : null}
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          name="marketingOptIn"
          defaultChecked={profile?.marketing_opt_in ?? false}
          className="mt-0.5 size-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
        />
        <span>
          Email me occasional product updates.
          <span className="block text-xs text-slate-500">
            Alert emails are controlled separately, on the Alerts page.
          </span>
        </span>
      </label>

      <SubmitButton pending={isPending} pendingLabel="Saving...">
        Save changes
      </SubmitButton>
    </form>
  );
}
