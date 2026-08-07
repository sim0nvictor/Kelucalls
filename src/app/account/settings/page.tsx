import Link from "next/link";

import { ProfileForm } from "@/components/account/profile-form";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/constants";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  return (
    <div className="max-w-xl space-y-10">
      <section>
        <h2 className="text-lg font-semibold text-white">Profile</h2>
        <p className="mt-1 text-sm text-slate-400">
          How you appear on Kelucalls.
        </p>
        <div className="mt-5">
          <ProfileForm profile={profile} />
        </div>
      </section>

      <section className="border-t border-white/10 pt-8">
        <h2 className="text-lg font-semibold text-white">Account</h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Email</dt>
            <dd className="text-slate-200">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Email confirmed</dt>
            <dd className={user?.emailConfirmed ? "text-emerald-300" : "text-amber-300"}>
              {user?.emailConfirmed ? "Yes" : "Not yet"}
            </dd>
          </div>
        </dl>

        <Link
          href={FORGOT_PASSWORD_PATH}
          className="mt-5 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-300"
        >
          Change password
        </Link>
      </section>
    </div>
  );
}
