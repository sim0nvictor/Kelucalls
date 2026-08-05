import { ExternalLink, LineChart } from "lucide-react";

import { chainLabel } from "@/lib/chains";

const DEXSCREENER_BASE = "https://dexscreener.com/";
const DEXSCREENER_SEARCH = "https://dexscreener.com/search?q=";

/**
 * Embed options: hide DexScreener's own header, trade list and toolbars so the
 * frame is just the candlestick chart on a dark background.
 */
const EMBED_PARAMS =
  "?embed=1&theme=dark&chartTheme=dark&trades=0&info=0&tabs=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartStyle=1&chartType=usd&interval=15";

export type DexChartProps = {
  /** Pair link reported by DexScreener for the deepest liquidity market. */
  pairUrl: string | null;
  /** DexScreener chain id, used to build a link when no pair is known. */
  chainId: string | null;
  contractAddress: string;
  symbol: string;
  chain: string;
};

/**
 * Live price chart, embedded straight from DexScreener.
 *
 * This is the real market chart for the token's deepest liquidity pair, with
 * live candles, volume and timeframes. It replaces nothing: the previous
 * charts in this repo plotted randomly generated numbers.
 */
export function DexChart({
  pairUrl,
  chainId,
  contractAddress,
  symbol,
  chain,
}: DexChartProps) {
  // Prefer the exact pair. Fall back to the chain + token route, which
  // DexScreener resolves to the primary pair on its side.
  const source =
    pairUrl ??
    (chainId && contractAddress
      ? DEXSCREENER_BASE + encodeURIComponent(chainId) + "/" + encodeURIComponent(contractAddress)
      : null);

  const searchUrl = DEXSCREENER_SEARCH + encodeURIComponent(contractAddress);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChart className="size-5 text-cyan-400" />
          <h2 className="text-2xl font-semibold text-white">Live chart</h2>
          <span className="text-sm text-slate-500">
            {symbol} on {chainLabel(chain)}
          </span>
        </div>
        <a
          href={source ?? searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-cyan-400 transition-colors hover:text-cyan-300"
        >
          Open full chart
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      {source ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
          <iframe
            src={source + EMBED_PARAMS}
            title={symbol + " live price chart"}
            loading="lazy"
            className="h-[420px] w-full border-0 sm:h-[520px]"
            allow="clipboard-write"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-6 py-12 text-center">
          <p className="text-slate-400">
            No live market found for this token yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            A chart appears here as soon as the token has a tradable pair on DexScreener.
          </p>
          <a
            href={searchUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-cyan-400 transition-colors hover:text-cyan-300"
          >
            Search DexScreener
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </section>
  );
}

export default DexChart;
