import { Activity } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TokenMarket } from "@/components/tokens/token-market";
import { siteConfig } from "@/config/site";
import { getTokenMarketSnapshotsForTokens } from "@/lib/token-market";
import { getTokenMarketRows } from "@/lib/tokens-data";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Token Analytics | " + siteConfig.name,
  description:
    "Live prices, market caps and 24h gainers and losers for every token called across tracked Telegram channels.",
};

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; q?: string }>;
}) {
  const { symbol, q } = await searchParams;

  const tokens = await getTokenMarketRows(200);

  // Seed the first paint with live values so prices are never blank on load.
  // Symbols are sent too, so tokens with a missing contract address (JIMOTHY
  // and friends) still resolve via DexScreener search.
  const initialSnapshots = await getTokenMarketSnapshotsForTokens(
    tokens.map((token) => ({
      address: token.contractAddress,
      symbol: token.symbol,
    }))
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="border-purple-400/20 bg-purple-400/10 text-purple-200">
            <Activity className="mr-1.5 size-3" />
            Analytics
          </Badge>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Token Analytics</h1>
          <p className="mt-2 text-slate-400">
            Real-time price and market cap for {tokens.length} tokens tracked across all channels,
            with the biggest 24h movers up front.
          </p>
        </div>
      </div>

      <TokenMarket
        tokens={tokens}
        initialSnapshots={initialSnapshots}
        initialFetchedAt={new Date().toISOString()}
        initialQuery={q ?? symbol ?? ""}
      />
    </div>
  );
}
