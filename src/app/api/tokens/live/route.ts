import {
  getTokenMarketSnapshotsForTokens,
  MAX_LIVE_ADDRESSES,
  type TokenMarketQuery,
} from "@/lib/token-market";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === "string") return value.split(",");
  return [];
}

/**
 * Accepts either the legacy address list or the richer token list
 * `[{ address, symbol }]`, which lets us price tokens whose contract address
 * is missing or wrong by falling back to their ticker.
 */
function parseQueries(value: unknown): TokenMarketQuery[] {
  const queries: TokenMarketQuery[] = [];
  const seen = new Set<string>();

  const push = (rawAddress: unknown, rawSymbol: unknown) => {
    const address = typeof rawAddress === "string" ? rawAddress.trim() : "";
    const symbol = typeof rawSymbol === "string" ? rawSymbol.trim() : "";
    if (address === "" && symbol === "") return;

    const key = (address + "|" + symbol).toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    queries.push({ address: address === "" ? null : address, symbol: symbol === "" ? null : symbol });
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        push(entry, null);
        continue;
      }

      if (typeof entry === "object" && entry !== null) {
        const record = entry as Record<string, unknown>;
        push(record.address, record.symbol);
      }

      if (queries.length >= MAX_LIVE_ADDRESSES) break;
    }

    return queries.slice(0, MAX_LIVE_ADDRESSES);
  }

  for (const entry of splitList(value)) {
    push(entry, null);
    if (queries.length >= MAX_LIVE_ADDRESSES) break;
  }

  return queries.slice(0, MAX_LIVE_ADDRESSES);
}

function parseSymbols(value: unknown): TokenMarketQuery[] {
  const queries: TokenMarketQuery[] = [];
  const seen = new Set<string>();

  for (const entry of splitList(value)) {
    const symbol = entry.trim();
    if (symbol === "") continue;

    const key = symbol.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push({ address: null, symbol });
    if (queries.length >= MAX_LIVE_ADDRESSES) break;
  }

  return queries;
}

async function respond(queries: TokenMarketQuery[]) {
  if (queries.length === 0) {
    return jsonResponse({ tokens: {}, count: 0, requested: 0, fetchedAt: new Date().toISOString() });
  }

  const tokens = await getTokenMarketSnapshotsForTokens(queries.slice(0, MAX_LIVE_ADDRESSES));

  return jsonResponse({
    tokens,
    count: Object.keys(tokens).length,
    requested: queries.length,
    fetchedAt: new Date().toISOString(),
  });
}

// GET /api/tokens/live?addresses=addr1,addr2&symbols=JIMOTHY - handy for one token.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const queries = [
    ...parseQueries(searchParams.get("addresses")),
    ...parseSymbols(searchParams.get("symbols")),
  ];

  return respond(queries);
}

// POST { tokens: [{ address, symbol }] } or { addresses: [...] } - used by the
// market table and the live/trending cells, which poll many tokens at once.
export async function POST(request: Request) {
  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const queries =
    record.tokens !== undefined
      ? parseQueries(record.tokens)
      : parseQueries(record.addresses);

  return respond(queries);
}
