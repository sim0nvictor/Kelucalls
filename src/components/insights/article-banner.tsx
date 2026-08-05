"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";

type ArticleBannerProps = {
  /** A pasted image link (https://...) or a root-relative path from /public. */
  src?: string | null;
  alt?: string | null;
  /** Extra classes applied to the <img> element. */
  className?: string;
  /** Size of the placeholder icon shown when there is no usable image. */
  iconClassName?: string;
  /** Load eagerly (use for above-the-fold banners). */
  priority?: boolean;
};

/**
 * Returns a usable image source, or null when the value is not a link we can render.
 *
 * Article banners are supplied as links (Supabase Storage, a CDN, Canva, etc.)
 * instead of direct uploads, so we deliberately avoid next/image here: next/image
 * requires every hostname to be whitelisted in next.config.ts and throws a hard
 * render error for unknown hosts, which would 500 the whole article page.
 */
function normalizeImageLink(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  // Root-relative paths are served straight from /public.
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function ArticleBanner({
  src,
  alt,
  className = "",
  iconClassName = "size-12",
  priority = false,
}: ArticleBannerProps) {
  const [broken, setBroken] = useState(false);
  const imageSrc = normalizeImageLink(src);

  if (!imageSrc || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/15 to-emerald-500/15">
        <BookOpen className={`text-slate-600 ${iconClassName}`} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={(alt ?? "").trim() || "Article banner"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

export default ArticleBanner;
