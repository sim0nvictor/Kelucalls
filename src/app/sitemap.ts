import type { MetadataRoute } from "next";
import { withSupabase } from "@/lib/supabase";
import siteConfig from "@/config/site";

/**
 * Dynamic sitemap for Kelucalls.
 *
 * Next.js auto-serves this at `${siteConfig.url}/sitemap.xml` because this
 * file lives at src/app/sitemap.ts (App Router convention).
 *
 * Combines:
 *  1. Static top-level marketing/legal routes
 *  2. One entry per active/paused channel   -> /channels/[slug]
 *  3. One entry per active token             -> /tokens/[contractAddress]
 *  4. One entry per published insight article -> /insights/[slug]
 *
 * Admin, auth, dashboard, and API routes are intentionally excluded here
 * and disallowed in robots.ts so they're never discovered or indexed.
 *
 * NOTE: the `insights` fetch below assumes a Supabase table named
 * "insights" with `slug`, `status`, and `updated_at` columns, mirroring
 * the existing `channels`/`tokens` pattern. Confirm/adjust the table and
 * column names against your actual schema before shipping.
 */

const BASE_URL = siteConfig.url;

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
    return (data ?? []) as Array<{
      contract_address: string | null;
      updated_at: string | null;
    }>;
  }, [] as Array<{ contract_address: string | null; updated_at: string | null }>);
}

// ASSUMPTION: adjust table/column names to match your real schema.
async function getInsightSlugs() {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("insights")
      .select("slug, updated_at")
      .eq("status", "published")
      .limit(5000);

    if (error) throw error;
    return (data ?? []) as Array<{ slug: string; updated_at: string | null }>;
  }, [] as Array<{ slug: string; updated_at: string | null }>);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [channels, tokens, insights] = await Promise.all([
    getChannelSlugs(),
    getTokenAddresses(),
    getInsightSlugs(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/trending`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/channels`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/insights`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/submit`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },

    // Carried over from the prior sitemap — remove any that no longer exist.
    { url: `${BASE_URL}/top-callers`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/tokens`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/live`, changeFrequency: "always", priority: 0.7 },
    { url: `${BASE_URL}/track`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const channelRoutes: MetadataRoute.Sitemap = channels
    .filter((c) => Boolean(c.slug))
    .map((c) => ({
      url: `${BASE_URL}/channels/${c.slug}`,
      lastModified: c.updated_at ?? undefined,
      changeFrequency: "daily",
      priority: 0.8,
    }));

  const tokenRoutes: MetadataRoute.Sitemap = tokens
    .filter((t) => Boolean(t.contract_address))
    .map((t) => ({
      url: `${BASE_URL}/tokens/${encodeURIComponent(t.contract_address as string)}`,
      lastModified: t.updated_at ?? undefined,
      changeFrequency: "hourly",
      priority: 0.8,
    }));

  const insightRoutes: MetadataRoute.Sitemap = insights
    .filter((i) => Boolean(i.slug))
    .map((i) => ({
      url: `${BASE_URL}/insights/${i.slug}`,
      lastModified: i.updated_at ?? undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  // De-dupe by URL as a safety net in case any source overlaps.
  const all = [...staticRoutes, ...channelRoutes, ...tokenRoutes, ...insightRoutes];
  const seen = new Set<string>();
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}