/**
 * Site Configuration
 * Centralized configuration for company information and external links.
 */

export const siteConfig = {
  // Company
  name: "Kelucalls",
  shortName: "Kelucalls",

  // SEO
  description:
    "Kelucalls is a crypto intelligence platform that tracks Telegram call channels, trending tokens, market signals, and crypto insights.",

  // Website
  url: "https://kelucalls.com",

  // Contact Emails
  email: {
    general: "kelucalls@gmail.com",
    support: "support@kelucalls.com",
    privacy: "privacy@kelucalls.com",
    ads: "ads@kelucalls.com",
    listings: "listings@kelucalls.com",
    dmca: "dmca@kelucalls.com",
    safety: "safety@kelucalls.com",
  },

  // Social Links
  social: {
    x: "https://x.com/kelucalls?s=20",
    telegram: "https://t.me/kELUSCALLGOOOO",
    telegramBot: "https://t.me/KeluCallsAlerts_bot",
  },

  // Partners
  partners: {
    sevmeta: "https://sevmeta.xyz",
    sevlabx: "https://sevlabx.xyz",
  },
} as const;

/**
 * Returns a mailto URL for a department.
 */
export function mailto(
  department: keyof typeof siteConfig.email
): `mailto:${string}` {
  return `mailto:${siteConfig.email[department]}`;
}

/**
 * Standard props for opening external links securely.
 *
 * Usage:
 * <a href={siteConfig.social.x} {...externalLink}>
 */
export const externalLink = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/**
 * Creates a complete external link object.
 *
 * Usage:
 * <a {...createExternalLink(siteConfig.social.telegram)}>
 */
export function createExternalLink(href: string) {
  return {
    href,
    ...externalLink,
  } as const;
}

export default siteConfig;