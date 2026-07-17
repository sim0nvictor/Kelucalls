import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeProps = React.ComponentProps<"div"> & {
  variant?: "default" | "secondary";
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        variant === "secondary"
          ? "inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-200"
          : "inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
