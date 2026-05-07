"use client";

import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";

type VoteButtonProps = {
  className?: string;
};

export function VoteButton({ className }: VoteButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400",
        className
      )}
      disabled
    >
      <Clock3 className="size-4" />
      <span>Voting later</span>
    </button>
  );
}
