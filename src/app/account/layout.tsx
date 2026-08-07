import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountNav, SignOutButton } from "@/components/account/account-nav";
import { getCurrentProfile, requireUser, displayNameFor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false }
};

// Session-dependent, so never statically rendered or cached.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  // Middleware already blocks anonymous access to /account/*. This second
  // check means any new page added under here is protected even if someone
  // forgets to update the matcher.
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const name = displayNameFor(user, profile);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <p className="text-sm text-slate-500">Signed in as {user.email}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Hey {name}
        </h1>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <aside className="lg:w-56 lg:shrink-0">
          <AccountNav />
          <div className="mt-2 hidden lg:block">
            <SignOutButton />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <div className="mt-10 lg:hidden">
        <SignOutButton />
      </div>
    </div>
  );
}
