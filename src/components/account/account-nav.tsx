"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";

/**
 * Sidebar navigation for the account area.
 *
 * Adding a new account section is one entry here plus one page file - that is
 * the whole extension story, which is the point of the layout split.
 */
const ACCOUNT_LINKS = [
  { href: ACCOUNT_BASE_PATH, label: "Overview" },
  { href: `${ACCOUNT_BASE_PATH}/notifications`, label: "Notifications" },
  { href: `${ACCOUNT_BASE_PATH}/watchlist`, label: "Watchlist" },
  { href: `${ACCOUNT_BASE_PATH}/alerts`, label: "Alerts" },
  { href: `${ACCOUNT_BASE_PATH}/submissions`, label: "My submissions" },
  { href: `${ACCOUNT_BASE_PATH}/settings`, label: "Settings" }
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ACCOUNT_LINKS.map((link) => {
        const isActive =
          link.href === ACCOUNT_BASE_PATH
            ? pathname === ACCOUNT_BASE_PATH
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-cyan-500/10 text-cyan-300"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Sign out is a POST form rather than a link on purpose: a GET sign-out URL
 * gets triggered by link prefetching and logs people out at random.
 */
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="w-full rounded-lg px-3.5 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-white/5 hover:text-red-300"
      >
        Sign out
      </button>
    </form>
  );
}
