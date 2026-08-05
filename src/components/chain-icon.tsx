"use client";

import { useEffect, useState } from "react";

/**
 * Chain logos, served by DexScreener's static asset host.
 *
 * Rendered with a plain <img> on purpose: these are tiny, always remote, and
 * we want an onError fallback rather than a build-time domain allowlist.
 */
const CHAIN_ICON_BASE = "https://dd.dexscreener.com/ds-data/chains/";

export type ChainMeta = {
  /** DexScreener chain slug, used to build the logo link. */
  slug: string;
  label: string;
  color: string;
};

/**
 * Keys are normalised (lowercased, non-alphanumerics stripped) so that
 * "BNB Chain", "bnb-chain" and "bsc" all resolve to the same entry.
 */
const CHAIN_META: Record<string, ChainMeta> = {
  solana: { slug: "solana", label: "Solana", color: "#14f195" },
  sol: { slug: "solana", label: "Solana", color: "#14f195" },
  ethereum: { slug: "ethereum", label: "Ethereum", color: "#627eea" },
  eth: { slug: "ethereum", label: "Ethereum", color: "#627eea" },
  erc20: { slug: "ethereum", label: "Ethereum", color: "#627eea" },
  mainnet: { slug: "ethereum", label: "Ethereum", color: "#627eea" },
  base: { slug: "base", label: "Base", color: "#0052ff" },
  bsc: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  bnb: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  bnbchain: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  binance: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  binancesmartchain: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  bep20: { slug: "bsc", label: "BNB Chain", color: "#f3ba2f" },
  arbitrum: { slug: "arbitrum", label: "Arbitrum", color: "#28a0f0" },
  arb: { slug: "arbitrum", label: "Arbitrum", color: "#28a0f0" },
  arbitrumone: { slug: "arbitrum", label: "Arbitrum", color: "#28a0f0" },
  polygon: { slug: "polygon", label: "Polygon", color: "#8247e5" },
  matic: { slug: "polygon", label: "Polygon", color: "#8247e5" },
  pol: { slug: "polygon", label: "Polygon", color: "#8247e5" },
  avalanche: { slug: "avalanche", label: "Avalanche", color: "#e84142" },
  avax: { slug: "avalanche", label: "Avalanche", color: "#e84142" },
  sui: { slug: "sui", label: "Sui", color: "#4da2ff" },
  tron: { slug: "tron", label: "Tron", color: "#eb0029" },
  trx: { slug: "tron", label: "Tron", color: "#eb0029" },
  trc20: { slug: "tron", label: "Tron", color: "#eb0029" },
  ton: { slug: "ton", label: "TON", color: "#0098ea" },
  optimism: { slug: "optimism", label: "Optimism", color: "#ff0420" },
  op: { slug: "optimism", label: "Optimism", color: "#ff0420" },
  blast: { slug: "blast", label: "Blast", color: "#fcfc03" },
  linea: { slug: "linea", label: "Linea", color: "#61dfff" },
  scroll: { slug: "scroll", label: "Scroll", color: "#ffeeda" },
  zksync: { slug: "zksync", label: "zkSync", color: "#8c8dfc" },
  mantle: { slug: "mantle", label: "Mantle", color: "#65b3ae" },
  cronos: { slug: "cronos", label: "Cronos", color: "#002d74" },
  fantom: { slug: "fantom", label: "Fantom", color: "#1969ff" },
  ftm: { slug: "fantom", label: "Fantom", color: "#1969ff" },
  sonic: { slug: "sonic", label: "Sonic", color: "#fe9a4d" },
  celo: { slug: "celo", label: "Celo", color: "#fcff52" },
  sei: { slug: "seiv2", label: "Sei", color: "#9e1f19" },
  seiv2: { slug: "seiv2", label: "Sei", color: "#9e1f19" },
  aptos: { slug: "aptos", label: "Aptos", color: "#06f3d1" },
  near: { slug: "near", label: "NEAR", color: "#00ec97" },
  cardano: { slug: "cardano", label: "Cardano", color: "#0033ad" },
  ada: { slug: "cardano", label: "Cardano", color: "#0033ad" },
  hyperliquid: { slug: "hyperliquid", label: "Hyperliquid", color: "#97fce4" },
  hype: { slug: "hyperliquid", label: "Hyperliquid", color: "#97fce4" },
  pulsechain: { slug: "pulsechain", label: "PulseChain", color: "#00d1ff" },
  berachain: { slug: "berachain", label: "Berachain", color: "#814625" },
  bera: { slug: "berachain", label: "Berachain", color: "#814625" },
  unichain: { slug: "unichain", label: "Unichain", color: "#ff007a" },
  abstract: { slug: "abstract", label: "Abstract", color: "#4ade80" },
  monad: { slug: "monad", label: "Monad", color: "#836ef9" },
};

const FALLBACK_COLOR = "#64748b";

function normalizeChain(value: string | null | undefined) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/** Resolves a stored chain name to its logo slug, display label and brand colour. */
export function resolveChainMeta(chain: string | null | undefined): ChainMeta | null {
  const key = normalizeChain(chain);
  return key === "" ? null : (CHAIN_META[key] ?? null);
}

/** Human readable chain name, falling back to the stored value. */
export function chainLabel(chain: string | null | undefined) {
  const meta = resolveChainMeta(chain);
  if (meta) return meta.label;
  return typeof chain === "string" && chain.trim() !== "" ? chain.trim() : "Unknown";
}

/** Brand colour for a chain, used by charts and fallback avatars. */
export function chainBrandColor(chain: string | null | undefined) {
  return resolveChainMeta(chain)?.color ?? FALLBACK_COLOR;
}

export function chainIconUrl(chain: string | null | undefined) {
  const meta = resolveChainMeta(chain);
  return meta ? CHAIN_ICON_BASE + meta.slug + ".png" : null;
}

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
  const color = meta?.color ?? FALLBACK_COLOR;

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
