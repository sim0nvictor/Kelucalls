/**
 * Shared state shape for the profile form.
 *
 * This deliberately lives OUTSIDE src/lib/account/actions.ts.
 *
 * That file carries the "use server" directive, and a "use server" module may
 * only export async functions - every export becomes a callable server
 * endpoint. Exporting a plain object from it (as IDLE_PROFILE_STATE once was)
 * is a runtime error as soon as a client component imports it.
 *
 * Type-only exports are erased at compile time, so they are safe to keep in a
 * "use server" file. Values are not. When adding new form state, put the
 * constants here and the actions there.
 *
 * This mirrors how the auth forms are already structured: IDLE_AUTH_STATE
 * lives in src/lib/auth/errors.ts, not in the actions file.
 */

export type ProfileFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export const IDLE_PROFILE_STATE: ProfileFormState = { status: "idle" };
