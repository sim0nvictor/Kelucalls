import type { MetadataRoute } from "next";
import { withSupabase } from "@/lib/supabase";

/**
 * Dynamic sitemap for kelucalls.com
 *
 * Next.js auto-serves this at https://kelucalls.com/sitemap.xml because
 * this file lives at src/app/sitemap.ts (App Router convention).
 *
 * Place this file at: src/app/sitemap.ts
 *
 * It combines:
 *  1. Static top-level routes (home, trending, top-callers, channels, tokens, live, track)
 *  2. One entry per active/paused channel  -> /channels/[slug]
 *  3. One entry per token with a contract address -> /tokens/[contractAddress]
 *
 * The hidden /kx-admin surface is intentionally excluded — it's also
 * disallowed in robots.ts so it never gets discovered or indexed.
 */

const BASE_URL = "https://kelucalls.com";

export const revalidate = 3600; // regenerate at most once an hour

async function getChannelSlugs() {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("channels")
      .select("slug, updated_at")
      .in("status", ["active", "paused"])
      .limit(5000);

    if (error) throw error;
    return (data ?? []) as Array<{ slug: string; updated_at: string | null }>;
  }, [] as Array<{ slug: string; updated_at: string | null }>);
}

async function getTokenAddresses() {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("tokens")
      .select("contract_address, updated_at")
      .eq("status", "active")
      .not("contract_address", "is", null)
      .limit(5000);

    if (error) throw error;
    return (data ?? []) as Array<{ contract_address: string | null; updated_at: string | null }>;
  }, [] as Array<{ contract_address: string | null; updated_at: string | null }>);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [channels, tokens] = await Promise.all([getChannelSlugs(), getTokenAddresses()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "hourly", priority: 1.0 },
    { url: `${BASE_URL}/trending`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/top-callers`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/channels`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/tokens`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/live`, changeFrequency: "always", priority: 0.7 },
    { url: `${BASE_URL}/track`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const channelRoutes: MetadataRoute.Sitemap = channels
    .filter((c) => Boolean(c.slug))
    .map((c) => ({
      url: `${BASE_URL}/channels/${c.slug}`,
      lastModified: c.updated_at ?? undefined,
      changeFrequency: "hourly",
      priority: 0.6,
    }));

  const tokenRoutes: MetadataRoute.Sitemap = tokens
    .filter((t) => Boolean(t.contract_address))
    .map((t) => ({
      url: `${BASE_URL}/tokens/${encodeURIComponent(t.contract_address as string)}`,
      lastModified: t.updated_at ?? undefined,
      changeFrequency: "hourly",
      priority: 0.5,
    }));

  return [...staticRoutes, ...channelRoutes, ...tokenRoutes];
}