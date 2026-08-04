import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { AdPopup } from "@/components/ad-popup";
import { JsonLd } from "@/components/json-ld";
import { getActiveAds } from "@/lib/dashboard-data";
import { graph, organizationSchema, websiteSchema } from "@/lib/schema";
import { siteConfig } from "@/config/site";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    images: [
      {
        url: `${siteConfig.url}/og-image.png`,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    creator: "@kelucalls",
    images: [`${siteConfig.url}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Viewport must be a separate named export in Next.js 15 — not inside metadata
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const surface = headerStore.get("x-kelucalls-surface");
  const isAdminSurface = surface === "admin";
  // Ads (popup) are separate from sponsored placements (inline cards)
  const activeAds = isAdminSurface ? [] : await getActiveAds(3);

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="text-slate-50 antialiased">
        {/* Site-wide entity graph. Admin surfaces are excluded from indexing. */}
        {!isAdminSurface && (
          <JsonLd schema={graph(organizationSchema(), websiteSchema())} />
        )}
        {isAdminSurface ? (
          children
        ) : (
          <div className="grid-glow relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_30%)]" />
            <Navbar />
            <main className="pt-[64px]">{children}</main>
            <AdPopup ads={activeAds} />
            <Footer />
          </div>
        )}
      </body>
    </html>
  );
}
