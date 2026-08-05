"use client";

import { useEffect, useState } from "react";

import {
  chainIconUrl,
  chainLabel,
  resolveChainMeta,
  FALLBACK_CHAIN_COLOR,
} from "@/lib/chains";

export type ChainIconProps = {
  chain: string | null | undefined;
  size?: number;
  /** Show the chain name next to the logo. */
  showLabel?: boolean;
  className?: string;
};

/**
 * Renders the real chain logo (Solana, Ethereum, Base, ...) instead of a text
 * badge. Unknown chains and broken images fall back to a coloured initial.
 *
 * Uses a plain <img> on purpose: the logos are tiny, always remote, and we
 * want an onError fallback rather than a build-time domain allowlist.
 */
export function ChainIcon({
  chain,
  size = 20,
  showLabel = false,
  className = "",
}: ChainIconProps) {
  const meta = resolveChainMeta(chain);
  const label = chainLabel(chain);
  const iconUrl = chainIconUrl(chain);
  const [broken, setBroken] = useState(false);

  // Reset when the row is reused for a different chain.
  useEffect(() => {
    setBroken(false);
  }, [iconUrl]);

  const showImage = Boolean(iconUrl) && !broken;
  const color = meta?.color ?? FALLBACK_CHAIN_COLOR;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl ?? ""}
          alt={label}
          title={label}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className="shrink-0 rounded-full ring-1 ring-white/10"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          title={label}
          aria-label={label}
          className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/10"
          style={{
            width: size,
            height: size,
            backgroundColor: color + "33",
            color,
            fontSize: Math.max(9, Math.round(size * 0.5)),
          }}
        >
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      {showLabel && <span className="truncate text-sm text-slate-300">{label}</span>}
    </span>
  );
}

export default ChainIcon;
