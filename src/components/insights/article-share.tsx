"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  Facebook,
  Link2,
  Linkedin,
  MessageCircle,
  Send,
  Share2,
  Twitter,
} from "lucide-react";

type ArticleShareProps = {
  title: string;
  /** Server-rendered canonical URL, used before hydration and as a fallback. */
  url: string;
  summary?: string | null;
};

type ShareTarget = {
  key: string;
  label: string;
  icon: LucideIcon;
  host: string;
  path: string;
  buildQuery: (encodedUrl: string, encodedTitle: string) => string;
};

const SHARE_TARGETS: ShareTarget[] = [
  {
    key: "x",
    label: "X",
    icon: Twitter,
    host: "x.com",
    path: "/intent/post",
    buildQuery: (encodedUrl, encodedTitle) => `url=${encodedUrl}&text=${encodedTitle}`,
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: Send,
    host: "t.me",
    path: "/share/url",
    buildQuery: (encodedUrl, encodedTitle) => `url=${encodedUrl}&text=${encodedTitle}`,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    host: "wa.me",
    path: "/",
    buildQuery: (encodedUrl, encodedTitle) => `text=${encodedTitle}%20${encodedUrl}`,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    host: "www.linkedin.com",
    path: "/sharing/share-offsite/",
    buildQuery: (encodedUrl) => `url=${encodedUrl}`,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: Facebook,
    host: "www.facebook.com",
    path: "/sharer/sharer.php",
    buildQuery: (encodedUrl) => `u=${encodedUrl}`,
  },
];

const actionClass =
  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-xs font-medium text-white transition-all duration-300 outline-none hover:border-cyan-400/40 hover:bg-white/10";

export function ArticleShare({ title, url, summary }: ArticleShareProps) {
  const [shareUrl, setShareUrl] = useState(url);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Prefer the real browser URL once hydrated (handles preview deploys and custom domains).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(`${window.location.origin}${window.location.pathname}`);
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const links = useMemo(() => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(title);

    return SHARE_TARGETS.map((target) => ({
      key: target.key,
      label: target.label,
      icon: target.icon,
      href: `https://${target.host}${target.path}?${target.buildQuery(encodedUrl, encodedTitle)}`,
    }));
  }, [shareUrl, title]);

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for non-secure contexts and older browsers.
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title,
        text: (summary ?? "").trim() || title,
        url: shareUrl,
      });
    } catch {
      // The user dismissed the share sheet - nothing to do.
    }
  }

  return (
    <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="text-sm font-medium text-white">Share:</span>

      <button
        type="button"
        onClick={handleCopy}
        className={actionClass}
        aria-label="Copy article link"
      >
        {copied ? (
          <>
            <Check className="size-4 text-emerald-400" />
            Link copied
          </>
        ) : (
          <>
            <Link2 className="size-4" />
            Copy link
          </>
        )}
      </button>

      {canNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          className={actionClass}
          aria-label="Open share sheet"
        >
          <Share2 className="size-4" />
          Share
        </button>
      )}

      {links.map(({ key, label, icon: Icon, href }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={actionClass}
          aria-label={`Share on ${label}`}
        >
          <Icon className="size-4" />
          {label}
        </a>
      ))}
    </div>
  );
}

export default ArticleShare;
