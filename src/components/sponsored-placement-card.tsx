"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SponsoredPlacement } from "@/types/kelucalls";

// ── Channel placement card (leaderboard injection) ─────────────────────────
export function SponsoredChannelCard({ placement }: { placement: SponsoredPlacement }) {
  useEffect(() => {
    void fetch("/api/ads/impression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sponsoredPlacementId: placement.id, pagePath: "/" }),
      keepalive: true,
    });
  }, [placement.id]);

  const href = placement.channelSlug
    ? `/channels/${placement.channelSlug}`
    : placement.destinationUrl;

  return (
    <Link
      href={href}
      className="group relative block rounded-2xl border border-white/8 bg-slate-900/60 p-5 transition-all duration-200 hover:border-amber-400/25 hover:bg-slate-900/80"
    >
      <span className="absolute right-4 top-4 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-300/70">
        Sponsored
      </span>

      <div className="flex items-start gap-4 pr-20">
        {/* Channel logo or fallback */}
        <div className="mt-0.5 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-white/4 transition-colors group-hover:border-amber-400/20">
          {placement.logoUrl ? (
            <Image
              src={placement.logoUrl}
              alt={placement.channelTitle ?? "Sponsored"}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg">📢</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-white">
            {placement.channelTitle ?? placement.label}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-400">
            {placement.creativeCopy || "Featured channel on Kelucalls."}
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-300/80 transition-colors group-hover:text-amber-300">
            <span>View channel</span>
            <svg className="size-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 12 12">
              <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Token placement card (shown at top of trending/tokens/live feed) ────────
export function SponsoredTokenCard({ placement }: { placement: SponsoredPlacement }) {
  useEffect(() => {
    void fetch("/api/ads/impression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sponsoredPlacementId: placement.id, pagePath: "/" }),
      keepalive: true,
    });
  }, [placement.id]);

  // Token placements link to dexscreener if contract_address available
  const href = placement.contractAddress
    ? `https://dexscreener.com/search?q=${encodeURIComponent(placement.contractAddress)}`
    : placement.destinationUrl;

  const isExternal = href.startsWith("http");

  const content = (
    <div className="group relative flex items-start gap-4 rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-4 transition-all duration-200 hover:border-cyan-400/30 hover:bg-slate-900/80">
      <span className="absolute right-3 top-3 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-cyan-300/70">
        Sponsored
      </span>

      {/* Token logo */}
      <div className="mt-0.5 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-white/4">
        {placement.logoUrl ? (
          <Image
            src={placement.logoUrl}
            alt={placement.tokenSymbol ?? "Token"}
            width={48}
            height={48}
            className="h-full w-full object-cover rounded-xl"
          />
        ) : (
          <span className="text-lg font-bold text-cyan-300">
            {(placement.tokenSymbol ?? "?").slice(0, 2)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 pr-16">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">
            {placement.tokenSymbol ?? placement.label}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-400">
          {placement.creativeCopy || "Featured token on Kelucalls."}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-cyan-300/80 transition-colors group-hover:text-cyan-300">
          <span>View on DexScreener</span>
          <svg className="size-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 12 12">
            <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}

// ── Auto-select the right card based on subtype ─────────────────────────────
export function SponsoredPlacementCard({ placement }: { placement: SponsoredPlacement }) {
  if (placement.placementSubtype === "token_placement") {
    return <SponsoredTokenCard placement={placement} />;
  }
  return <SponsoredChannelCard placement={placement} />;
}