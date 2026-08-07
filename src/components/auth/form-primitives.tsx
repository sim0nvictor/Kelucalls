"use client";

import { useId, type ReactNode } from "react";
import type { AuthActionState } from "@/lib/auth/errors";

/**
 * Small presentational building blocks shared by all four auth forms.
 *
 * Kept deliberately plain rather than reaching for the shadcn primitives in
 * src/components/ui - these forms need per-field error slots and aria wiring
 * that those components do not expose.
 */

const BANNER_TONES = {
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
} as const;

export function AuthBanner({
  tone,
  children
}: {
  tone: keyof typeof BANNER_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${BANNER_TONES[tone]}`}
    >
      {children}
    </div>
  );
}

/**
 * Renders the form-level message from an action result.
 *
 * `validation` errors are skipped here because they are already shown inline
 * against the offending field - repeating them at the top is just noise.
 */
export function AuthStateBanner({ state }: { state: AuthActionState }) {
  if (state.status === "success" && state.message) {
    return <AuthBanner tone="success">{state.message}</AuthBanner>;
  }
  if (state.status === "error" && state.code !== "validation" && state.message) {
    return <AuthBanner tone="error">{state.message}</AuthBanner>;
  }
  return null;
}

export function TextField({
  label,
  name,
  type = "text",
  defaultValue,
  error,
  hint,
  autoComplete,
  placeholder,
  required = false,
  autoFocus = false
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  defaultValue?: string;
  error?: string;
  hint?: ReactNode;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full rounded-lg border bg-slate-900/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:ring-2 focus:ring-cyan-500/40 ${
          error
            ? "border-red-500/60 focus:border-red-400"
            : "border-white/10 focus:border-cyan-500/60"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
