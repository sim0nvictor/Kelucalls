"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Check, Filter, X } from "lucide-react";

import { ChainIcon } from "@/components/chain-icon";

export type ChainOption = { key: string; label: string; count: number };
export type SortOption = { key: string; label: string };

type TrendingControlsProps = {
  chains: ChainOption[];
  sorts: SortOption[];
  activeChain: string | null;
  activeSort: string;
  activeDir: "asc" | "desc";
};

const TRIGGER_CLASS =
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-xs font-medium text-white outline-none transition-colors hover:border-cyan-400/40 hover:bg-white/10";

const ACTIVE_TRIGGER_CLASS =
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 text-xs font-medium text-cyan-100 outline-none transition-colors hover:bg-cyan-400/15";

const MENU_CLASS =
  "absolute right-0 z-30 mt-2 max-h-80 w-60 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur";

const ITEM_CLASS =
  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-white/8 hover:text-white";

/**
 * Real filter and sort controls for /trending.
 *
 * State lives in the URL (?chain=&sort=&dir=) so the server component can do
 * the filtering and sorting, and so a filtered view can be shared or bookmarked.
 */
export function TrendingControls({
  chains,
  sorts,
  activeChain,
  activeSort,
  activeDir,
}: TrendingControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [openMenu, setOpenMenu] = useState<"filter" | "sort" | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (openMenu === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  const apply = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }

      const queryString = next.toString();
      const target = queryString === "" ? "/trending" : "/trending?" + queryString;

      setOpenMenu(null);
      startTransition(() => {
        router.push(target, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const activeChainOption = chains.find((option) => option.key === activeChain) ?? null;
  const activeSortOption = sorts.find((option) => option.key === activeSort) ?? sorts[0];

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-wrap items-center gap-2 ${isPending ? "opacity-60" : ""}`}
    >
      {/* Filter by chain */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openMenu === "filter"}
          onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}
          className={activeChainOption ? ACTIVE_TRIGGER_CLASS : TRIGGER_CLASS}
        >
          <Filter className="size-4" />
          {activeChainOption ? activeChainOption.label : "Filter"}
        </button>

        {openMenu === "filter" && (
          <div className={MENU_CLASS}>
            <button type="button" className={ITEM_CLASS} onClick={() => apply({ chain: null })}>
              <span>All chains</span>
              {activeChain === null && <Check className="size-4 text-cyan-400" />}
            </button>

            {chains.map((option) => (
              <button
                key={option.key}
                type="button"
                className={ITEM_CLASS}
                onClick={() => apply({ chain: option.key })}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChainIcon chain={option.key} size={18} />
                  <span className="truncate">{option.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-500">{option.count}</span>
                  {activeChain === option.key && <Check className="size-4 text-cyan-400" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sort */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openMenu === "sort"}
          onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
          className={TRIGGER_CLASS}
        >
          <ArrowUpDown className="size-4" />
          {activeSortOption ? activeSortOption.label : "Sort"}
          <span className="text-slate-400">{activeDir === "desc" ? "\u2193" : "\u2191"}</span>
        </button>

        {openMenu === "sort" && (
          <div className={MENU_CLASS}>
            {sorts.map((option) => (
              <button
                key={option.key}
                type="button"
                className={ITEM_CLASS}
                onClick={() => apply({ sort: option.key })}
              >
                <span>{option.label}</span>
                {activeSort === option.key && <Check className="size-4 text-cyan-400" />}
              </button>
            ))}

            <div className="my-1 border-t border-white/8" />

            <button
              type="button"
              className={ITEM_CLASS}
              onClick={() => apply({ dir: "desc" })}
            >
              <span>Highest first</span>
              {activeDir === "desc" && <Check className="size-4 text-cyan-400" />}
            </button>
            <button type="button" className={ITEM_CLASS} onClick={() => apply({ dir: "asc" })}>
              <span>Lowest first</span>
              {activeDir === "asc" && <Check className="size-4 text-cyan-400" />}
            </button>
          </div>
        )}
      </div>

      {/* Clear */}
      {(activeChainOption || activeSort !== sorts[0]?.key || activeDir !== "desc") && (
        <button
          type="button"
          onClick={() => apply({ chain: null, sort: null, dir: null })}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-slate-400 transition-colors hover:border-white/20 hover:text-white"
        >
          <X className="size-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}
