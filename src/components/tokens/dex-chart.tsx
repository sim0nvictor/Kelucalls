import { ExternalLink, LineChart } from "lucide-react";

import { chainLabel, chainSlug } from "@/lib/chains";

const DEXSCREENER_BASE = "https://dexscreener.com/";
const DEXSCREENER_SEARCH_URL = "https://dexscreener.com/search?q=";

/**
 * Embed options: dark theme, USD price candles, 15m interval, and the trade
 * list / tabs / info panels hidden so the chart itself fills the frame.
 */
const DEX_EMBED_PARAMS =
  "?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15";

type DexChartProps = {
  /** Pair URL resolved from the DexScreener API, when a pair was found. */
  pairUrl?: string | null;
  /** DexScreener chain id from the API snapshot. */
  chainId?: string | null;
  contractAddress: string;
  symbol: string;
  chain?: string | null;
  className?: string;
};

/**
 * Live DexScreener price chart.
 *
 * Prefers the exact pair URL returned by the market API (deepest liquidity
 * pool). Falls back to the chain + token address route, which DexScreener
 * redirects to the top pair for that token. If neither is resolvable, shows a
 * link out instead of an empty frame.
 */
export function DexChart({
  pairUrl,
  chainId,
  contractAddress,
  symbol,
  chain,
  className = "",
}: DexChartProps) {
  const resolvedChain = chainId ?? chainSlug(chain);

  const baseUrl =
    pairUrl && pairUrl.length > 0
      ? pairUrl
      : resolvedChain
        ? DEXSCREENER_BASE + resolvedChain + "/" + contractAddress
        : null;

  const searchUrl = DEXSCREENER_SEARCH_URL + encodeURIComponent(contractAddress);

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-2">
          <LineChart className="size-4 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">{symbol} live chart</h2>
          {chain && (
            <span className="text-xs uppercase tracking-widest text-slate-500">
              {chainLabel(chain)}
            </span>
          )}
        </div>
        <a
          href={baseUrl ?? searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cyan-400 transition-colors hover:text-cyan-300"
        >
          Open on DexScreener
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      {baseUrl ? (
        <div className="relative h-[420px] w-full sm:h-[520px]">
          <iframe
            src={baseUrl + DEX_EMBED_PARAMS}
            title={symbol + " price chart on DexScreener"}
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-write"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <LineChart className="size-8 text-slate-600" />
          <p className="text-sm text-slate-400">
            No live market found for this token yet.
          </p>
          <a
            href={searchUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-cyan-400 transition-colors hover:text-cyan-300"
          >
            Search DexScreener for {symbol}
          </a>
        </div>
      )}
    </section>
  );
}

export default DexChart;
