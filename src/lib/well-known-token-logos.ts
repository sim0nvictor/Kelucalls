/**
 * Static fallback logos for well-known native-chain symbols that the scraper
 * inserts without a contract_address (see WELL_KNOWN_SYMBOLS in
 * scraper/index.js — BTC, ETH, SOL, XRP, etc. as plain $SYMBOL mentions with
 * no on-chain address to look up). DexScreener's token endpoint has nothing
 * to query for these, so they can never get a logo through the normal
 * pipeline (price-update.js / token-logo-backfill.js), no matter how many
 * times those run.
 *
 * Sourced from Trust Wallet's public, community-maintained asset registry
 * (https://github.com/trustwallet/assets), cross-checked against the live
 * registry.md in trustwallet/wallet-core as of 2026-06-20.
 *
 * This is a pure lookup — no network call, no DB write. Worst case if a URL
 * ever goes stale is a broken image icon, gracefully caught by the onError
 * handler in components/token-avatar.tsx (falls back to initials). It
 * cannot throw and cannot crash a page.
 *
 * Deliberately excludes ERC-20 tokens (LINK, UNI, SHIB) whose logos live at
 * a contract-address path rather than a chain-info path. Guessing a
 * contract address risks showing the wrong coin entirely — ask Sev for the
 * verified addresses before adding these.
 */
const TRUST_WALLET_BASE =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

export const WELL_KNOWN_TOKEN_LOGOS: Record<string, string> = {
  BTC:   `${TRUST_WALLET_BASE}/bitcoin/info/logo.png`,
  ETH:   `${TRUST_WALLET_BASE}/ethereum/info/logo.png`,
  SOL:   `${TRUST_WALLET_BASE}/solana/info/logo.png`,
  BNB:   `${TRUST_WALLET_BASE}/binance/info/logo.png`,
  XRP:   `${TRUST_WALLET_BASE}/ripple/info/logo.png`,
  ADA:   `${TRUST_WALLET_BASE}/cardano/info/logo.png`,
  DOT:   `${TRUST_WALLET_BASE}/polkadot/info/logo.png`,
  MATIC: `${TRUST_WALLET_BASE}/polygon/info/logo.png`,
  AVAX:  `${TRUST_WALLET_BASE}/avalanchec/info/logo.png`,
  DOGE:  `${TRUST_WALLET_BASE}/doge/info/logo.png`,
  LTC:   `${TRUST_WALLET_BASE}/litecoin/info/logo.png`,
  TRX:   `${TRUST_WALLET_BASE}/tron/info/logo.png`,
  TON:   `${TRUST_WALLET_BASE}/ton/info/logo.png`,
  SUI:   `${TRUST_WALLET_BASE}/sui/info/logo.png`,
  APT:   `${TRUST_WALLET_BASE}/aptos/info/logo.png`,
  // ARB / OP resolve to the network's chain logo (registry.md lists these
  // L2 rows under the gas-token symbol ETH, not a verified ARB/OP-specific
  // image) — visually it's the right branding, but flag it if it ever
  // looks off and we can swap in the exact governance-token contract path.
  ARB:   `${TRUST_WALLET_BASE}/arbitrum/info/logo.png`,
  OP:    `${TRUST_WALLET_BASE}/optimism/info/logo.png`
};