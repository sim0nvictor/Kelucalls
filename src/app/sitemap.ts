import type { MetadataRoute } from "next";
import { withSupabase } from "@/lib/supabase";
import siteConfig from "@/config/site";

/**
 * Dynamic sitemap for Kelucalls.
 *
 * Next.js auto-serves this at `${siteConfig.url}/sitemap.xml` because this
 * file lives at src/app/sitemap.ts (App Router convention).
 *
 * RULES FOR EDITING THIS FILE:
 *  1. Only list URLs that actually render a page. A sitemap full of 404s is
 *     worse than a small sitemap \u2014 it burns crawl budget and erodes trust.
 *  2. `changeFrequency` and `priority` are deliberately omitted. Google has
 *     publicly confirmed it ignores both. `lastModified` is the only hint that
 *     still carries weight, so it is set from real DB timestamps.
 *  3. Admin, auth, and API routes are excluded here and disallowed in robots.ts.
 */

const BASE_URL = siteConfig.url;

export const revalidate = 3600; // regenerate at most once an hour

/**
 * Static routes, each verified to exist as a page under src/app.
 * Keep this list in sync when adding or deleting a route folder.
 */
const STATIC_PATHS: readonly string[] = [
  "/",

  // Core product surfaces
  "/channels",
  "/trending",
  "/tokens",
  "/live",
  "/top-callers",
  "/track",
  "/insights",

  // Entity / conversion pages
  "/about",
  "/submit",
  "/contact",

  // Resources \u2014 these existed but were previously missing from the sitemap
  "/faq",
  "/help",
  "/ranking-methodology",
  "/community-guidelines",
  "/listing-policy",
  "/advertiser-policy",

  // Legal
  "/terms",
  "/privacy",
  "/cookies",
  "/disclaimer",
  "/dmca",
];

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [channels, tokens] = await Promise.all([
    getChannelSlugs(),
    getTokenAddresses(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${BASE_URL}${path}`,
  }));

  // Rendered by src/app/channels/[slug]/page.tsx
  const channelRoutes: MetadataRoute.Sitemap = channels
    .filter((channel) => Boolean(channel.slug))
    .map((channel) => ({
      url: `${BASE_URL}/channels/${channel.slug}`,
      lastModified: channel.updated_at ?? undefined,
    }));

  // Rendered by src/app/tokens/[address]/page.tsx
  const tokenRoutes: MetadataRoute.Sitemap = tokens
    .filter((token) => Boolean(token.contract_address))
    .map((token) => ({
      url: `${BASE_URL}/tokens/${encodeURIComponent(token.contract_address as string)}`,
      lastModified: token.updated_at ?? undefined,
    }));

  // De-dupe by URL as a safety net in case any source overlaps.
  const all = [...staticRoutes, ...channelRoutes, ...tokenRoutes];
  const seen = new Set<string>();

  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
