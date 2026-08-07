import type { ReactNode } from "react";

/**
 * Route-group layout for the auth screens.
 *
 * (auth) is a group, so it adds no URL segment - /login stays /login. The root
 * layout still renders the navbar and footer around this, which is intentional:
 * signing in should not feel like leaving the site.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12 sm:py-16">
      {children}
    </div>
  );
}
