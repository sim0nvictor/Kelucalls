import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Place this file at: src/app/robots.ts
 * Next.js auto-serves it at `${siteConfig.url}/robots.txt`
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/kx-admin", "/kx-admin/*", "/api/"],
      },
    ],
    sitemap: siteConfig.sitemap,
    host: siteConfig.url,
  };
}