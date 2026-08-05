import { getTokenMarketSnapshots, MAX_LIVE_ADDRESSES } from "@/lib/token-market";

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

function parseAddresses(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(",")
      : [];

  const addresses: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    addresses.push(trimmed);
    if (addresses.length >= MAX_LIVE_ADDRESSES) break;
  }

  return addresses;
}

async function respond(addresses: string[]) {
  const fetchedAt = new Date().toISOString();

  if (addresses.length === 0) {
    return jsonResponse({ tokens: {}, count: 0, fetchedAt });
  }

  const tokens = await getTokenMarketSnapshots(addresses);

  return jsonResponse({
    tokens,
    count: Object.keys(tokens).length,
    requested: addresses.length,
    fetchedAt: new Date().toISOString(),
  });
}

// GET /api/tokens/live?addresses=addr1,addr2 — handy for a single token.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return respond(parseAddresses(searchParams.get("addresses")));
}

// POST { addresses: [...] } — used by the market table, which polls many tokens.
export async function POST(request: Request) {
  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  return respond(parseAddresses(record.addresses));
}
