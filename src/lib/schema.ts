import siteConfig from "@/config/site";
import type { ChannelSummary } from "@/types/kelucalls";

/**
 * Centralized JSON-LD (schema.org) builders.
 *
 * Every node uses a stable @id so that separate blocks across the site refer
 * to the *same* entity rather than creating duplicates. This is what lets
 * Google merge the signals into a single "Kelucalls" knowledge entity.
 */

export const SITE_URL = siteConfig.url;

export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
export const LOGO_ID = `${SITE_URL}/#logo`;

/**
 * The canonical one-sentence description of what Kelucalls is.
 *
 * Use this verbatim everywhere (schema, /about, off-site profiles). Repeating
 * an identical description across sources is what builds entity confidence.
 */
export const CANONICAL_DESCRIPTION =
  "Kelucalls ranks Telegram crypto channels on realized call performance \u2014 ROI, win rate, simulated PnL, and breakout multiples from real call timestamps.";

/**
 * Profiles that describe the same organization.
 * NOTE: tracking/share params (e.g. ?s=20) must be stripped here.
 */
export const SAME_AS: readonly string[] = [
  "https://x.com/kelucalls",
  siteConfig.social.telegram,
];

type JsonLdNode = Record<string, unknown>;

/** Wraps nodes in a single @graph document. */
export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

export function organizationSchema(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteConfig.name,
    legalName: siteConfig.organization.legalName,
    url: `${SITE_URL}/`,
    description: CANONICAL_DESCRIPTION,
    foundingDate: siteConfig.organization.foundingDate,
    email: siteConfig.email.support,
    logo: {
      "@type": "ImageObject",
      "@id": LOGO_ID,
      url: siteConfig.images.logo,
      contentUrl: siteConfig.images.logo,
      caption: siteConfig.name,
    },
    image: { "@id": LOGO_ID },
    sameAs: [...SAME_AS],
  };
}

export function websiteSchema(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: `${SITE_URL}/`,
    name: siteConfig.name,
    description: CANONICAL_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    inLanguage: "en-US",
  };
}

/**
 * Breadcrumbs. Pass paths only (leading slash), not absolute URLs.
 */
export function breadcrumbSchema(
  items: Array<{ name: string; path: string }>
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function aboutPageSchema(): JsonLdNode {
  return {
    "@type": "AboutPage",
    "@id": `${SITE_URL}/about#webpage`,
    url: `${SITE_URL}/about`,
    name: `About ${siteConfig.name}`,
    description: CANONICAL_DESCRIPTION,
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    inLanguage: "en-US",
  };
}

/**
 * A tracked channel's performance record, expressed as a Dataset.
 *
 * Dataset is the honest type here: these pages publish measured statistics,
 * not editorial reviews. Using Review/Rating would misrepresent the data and
 * risks a manual action.
 */
export function channelDatasetSchema(channel: ChannelSummary): JsonLdNode {
  const url = `${SITE_URL}/channels/${channel.slug}`;

  return {
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: `${channel.title} \u2014 Telegram call performance`,
    description: `Measured call performance for the Telegram channel ${channel.title}: ${channel.totalCalls} tracked calls, ${channel.winRatePct.toFixed(1)}% win rate, and ${channel.averageRoiPct.toFixed(1)}% average ROI.`,
    url,
    isAccessibleForFree: true,
    creator: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
    dateModified: channel.refreshedAt ?? undefined,
    variableMeasured: [
      { "@type": "PropertyValue", name: "Tracked calls", value: channel.totalCalls },
      { "@type": "PropertyValue", name: "Win rate", value: channel.winRatePct, unitText: "PERCENT" },
      { "@type": "PropertyValue", name: "Average ROI", value: channel.averageRoiPct, unitText: "PERCENT" },
      { "@type": "PropertyValue", name: "Best multiple", value: channel.bestMultiple },
      { "@type": "PropertyValue", name: "Simulated PnL (USD)", value: channel.simulatedCurrentPnlUsd },
    ],
  };
}
