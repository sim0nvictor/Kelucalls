/**
 * Chain metadata and helpers.
 *
 * This module is intentionally NOT a client module: server components
 * (/trending, /tokens/[address]) call chainLabel() and chainBrandColor()
 * during render, and importing those from a "use client" file turns them into
 * client references that throw when called on the server.
 *
 * The visual <ChainIcon> component lives in src/components/chain-icon.tsx and
 * imports from here.
 */

export type ChainMeta = {
  /** DexScreener chain slug, also used for the logo file name. */
  slug: string;
  label: string;
  color: string;
};

export const CHAIN_ICON_BASE = "https://dd.dexscreener.com/ds-data/chains/";

export const FALLBACK_COLOR = "#64748b";

/** Aliases map to the canonical DexScreener slug. */
export const CHAIN_META: Record<string, ChainMeta> = {
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

/** "BNB Chain", "bnb-chain", "BSC " all collapse to the same lookup key. */
export function normalizeChainKey(chain: string | null | undefined): string {
  if (!chain) return "";
  return chain.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveChainMeta(chain: string | null | undefined): ChainMeta | null {
  const key = normalizeChainKey(chain);
  if (key === "") return null;
  return CHAIN_META[key] ?? null;
}

/** Human label. Unknown chains keep their original casing. */
export function chainLabel(chain: string | null | undefined): string {
  const meta = resolveChainMeta(chain);
  if (meta) return meta.label;
  if (!chain) return "Unknown";
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function chainBrandColor(chain: string | null | undefined): string {
  return resolveChainMeta(chain)?.color ?? FALLBACK_COLOR;
}

/** DexScreener chain slug, or null when the chain is not recognised. */
export function chainSlug(chain: string | null | undefined): string | null {
  return resolveChainMeta(chain)?.slug ?? null;
}

/** Logo URL for a chain, or null when there is no known logo. */
export function chainIconUrl(chain: string | null | undefined): string | null {
  const meta = resolveChainMeta(chain);
  if (!meta) return null;
  return CHAIN_ICON_BASE + meta.slug + ".png";
}
