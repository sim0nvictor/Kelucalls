import * as React from "react";

import { cn } from "@/lib/utils";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

type CalloutVariant = "info" | "warning" | "success" | "error";

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<CalloutVariant, string> = {
  info: "border-blue-400/30 bg-blue-400/10",
  warning: "border-amber-400/30 bg-amber-400/10",
  success: "border-emerald-400/30 bg-emerald-400/10",
  error: "border-red-400/30 bg-red-400/10",
};

const variantIconColors: Record<CalloutVariant, string> = {
  info: "text-blue-400",
  warning: "text-amber-400",
  success: "text-emerald-400",
  error: "text-red-400",
};

const variantIcons: Record<CalloutVariant, React.ElementType> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
};

function Callout({ variant = "info", title, children, className }: CalloutProps) {
  const Icon = variantIcons[variant];

  return (
    <div
      className={cn(
        "relative flex gap-4 rounded-2xl border p-5",
        variantStyles[variant],
        className
      )}
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", variantIconColors[variant])} />
      <div className="flex-1 space-y-2">
        {title && (
          <h4 className={cn("font-semibold text-slate-100", variantIconColors[variant])}>
            {title}
          </h4>
        )}
        <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export { Callout, type CalloutProps, type CalloutVariant };