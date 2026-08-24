import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { ChannelAvatar } from "@/components/channel-avatar";
import { ChainIcon } from "@/components/chain-icon";
import { TokenAvatar } from "@/components/token-avatar";
import { Badge } from "@/components/ui/badge";
import { formatCompactCurrency, formatPercent } from "@/lib/metrics";
import { cn } from "@/lib/utils";

type DataTableProps = {
  children: ReactNode;
  caption?: string;
  className?: string;
  tableClassName?: string;
  minWidth?: string;
};

export function DataTable({
  children,
  caption,
  className,
  tableClassName,
  minWidth = "min-w-[42rem]",
}: DataTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-white/10 bg-slate-950/35", className)}>
      <table className={cn("w-full border-collapse text-left text-sm", minWidth, tableClassName)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function DataTableHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <thead className={cn("border-b border-white/10 bg-white/[0.03]", className)}>
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableRow({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-white/[0.07] last:border-b-0",
        interactive && "transition-colors hover:bg-cyan-400/[0.045]",
        className
      )}
    >
      {children}
    </tr>
  );
}

type SortDirection = "asc" | "desc" | null;

type SortableColumnProps = {
  children: ReactNode;
  direction?: SortDirection;
  onSort?: () => void;
  align?: "left" | "right" | "center";
  className?: string;
};

export function SortableColumn({
  children,
  direction = null,
  onSort,
  align = "left",
  className,
}: SortableColumnProps) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";
  const content = (
    <>
      <span>{children}</span>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
    </>
  );

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:pl-4 last:pr-4",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md py-1 text-inherit transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
            align === "right" && "justify-end",
            align === "center" && "justify-center"
          )}
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">{content}</span>
      )}
    </th>
  );
}

export function MetricValue({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-col tabular-nums", className)}>
      {label ? <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span> : null}
      <span className="font-medium text-white">{value}</span>
    </span>
  );
}

export function PerformanceValue({
  value,
  kind = "percent",
  className,
}: {
  value: number | null | undefined;
  kind?: "percent" | "currency";
  className?: string;
}) {
  const formatted = kind === "currency" ? formatCompactCurrency(value ?? 0) : formatPercent(value ?? 0);
  const isPositive = (value ?? 0) >= 0;

  return (
    <span className={cn("font-mono tabular-nums", isPositive ? "text-emerald-300" : "text-red-300", className)}>
      {formatted}
    </span>
  );
}

type IdentityProps = {
  href?: string;
  className?: string;
};

export function ChannelIdentity({
  title,
  avatarUrl,
  description,
  href,
  className,
}: IdentityProps & {
  title: string;
  avatarUrl?: string | null;
  description?: string | null;
}) {
  const content = (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <ChannelAvatar src={avatarUrl ?? null} title={title} size={32} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-white">{title}</span>
        {description ? <span className="block truncate text-xs text-slate-500">{description}</span> : null}
      </span>
    </span>
  );

  return href ? <Link href={href} className="group block hover:text-cyan-300">{content}</Link> : content;
}

export function TokenIdentity({
  symbol,
  name,
  logoUrl,
  chain,
  href,
  className,
}: IdentityProps & {
  symbol: string;
  name?: string | null;
  logoUrl?: string | null;
  chain?: string | null;
}) {
  const content = (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <TokenAvatar src={logoUrl ?? null} symbol={symbol} size={32} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-white">{symbol}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          {chain ? <ChainIcon chain={chain} size={14} /> : null}
          <span className="truncate">{name ?? chain ?? ""}</span>
        </span>
      </span>
    </span>
  );

  return href ? <Link href={href} className="group block hover:text-cyan-300">{content}</Link> : content;
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalizedStatus = status.toLowerCase();
  const tone =
    normalizedStatus === "active" || normalizedStatus === "open"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : normalizedStatus === "paused"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
        : "border-white/10 bg-white/5 text-slate-300";

  return <Badge className={cn("px-2 py-0.5 text-[10px] tracking-wider", tone, className)}>{status}</Badge>;
}

export function VerificationBadge({ verified, className }: { verified: boolean; className?: string }) {
  if (!verified) return null;

  return (
    <Badge className={cn("border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] tracking-wider text-emerald-200", className)}>
      Verified
    </Badge>
  );
}