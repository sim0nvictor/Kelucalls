import type { ReactNode } from "react";

/**
 * Shared frame for every auth screen.
 *
 * Server component on purpose - it holds no state, so only the form inside it
 * ships as client JavaScript. Styling mirrors the admin sign-in card so the
 * two surfaces feel like one product.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? (
        <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>
      ) : null}
    </div>
  );
}
