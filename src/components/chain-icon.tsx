"use client";

import Image from "next/image";
import { useState } from "react";

import {
  chainBrandColor,
  chainIconUrl,
  chainLabel,
  type ChainMeta,
} from "@/lib/chains";

// Re-exported for convenience so existing client imports keep working.
export { chainBrandColor, chainIconUrl, chainLabel, normalizeChainKey, resolveChainMeta } from "@/lib/chains";
export type { ChainMeta };

type ChainIconProps = {
  chain: string | null | undefined;
  size?: number;
  /** Render the chain name next to the logo. */
  showLabel?: boolean;
  className?: string;
  labelClassName?: string;
};

/**
 * Chain logo with a coloured-initial fallback.
 *
 * Uses an unoptimized Next image because DexScreener can add chain slugs at
 * runtime. Failed remote images degrade to the initial without requiring a
 * static remote-image allowlist.
 */
export function ChainIcon({
  chain,
  size = 18,
  showLabel = false,
  className = "",
  labelClassName = "text-sm text-slate-300",
}: ChainIconProps) {
  const iconUrl = chainIconUrl(chain);
  const label = chainLabel(chain);
  const color = chainBrandColor(chain);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showImage = iconUrl !== null && iconUrl !== brokenUrl;

  const icon = showImage ? (
    <Image
      src={iconUrl}
      alt={label}
      width={size}
      height={size}
      unoptimized
      onError={() => setBrokenUrl(iconUrl)}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
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
  );

  if (!showLabel) {
    return className === "" ? icon : <span className={className}>{icon}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {icon}
      <span className={labelClassName}>{label}</span>
    </span>
  );
}

export default ChainIcon;
