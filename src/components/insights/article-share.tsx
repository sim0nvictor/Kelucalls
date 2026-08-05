"use client";

import { useEffect, useMemo, useState } from "react";
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

const actionClass =
  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-xs font-medium text-white transition-all duration-300 outline-none hover:border-cyan-400/40 hover:bg-white/10";

export function ArticleShare({ title, url, summary }: ArticleShareProps) {
  const [shareUrl, setShareUrl] = useState(url);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Prefer the actual browser URL once hydrated (handles previews and custom domains).
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

  const targets = useMemo(() => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(title);

    return [
      {
        key: "x",
        label: "X",
        icon: Twitter,
        href: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`,
      },
      {
        key: "telegram",
        label: "Telegram",
        icon: Send,
        href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
      },
      {
        key: "whatsapp",
        label: "WhatsApp",
        icon: MessageCircle,
        href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      },
      {
        key: "linkedin",
        label: "LinkedIn",
        icon: Linkedin,
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      },
      {
        key: "facebook",
        label: "Facebook",
        icon: Facebook,
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      },
    ];
  }, [shareUrl, title]);

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for non-secure contexts / older browsers.
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
      // The user dismissed the share sheet — nothing to do.
    }
  }

  return (
    <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="text-sm font-medium text-white">Share:</span>

      <button type="button" onClick={handleCopy} className={actionClass} aria-live="polite">
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
        <button type="button" onClick={handleNativeShare} className={actionClass}>
          <Share2 className="size-4" />
          Share
        </button>
      )}

      {targets.map(({ key, label, icon: Icon, href }) => (
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
