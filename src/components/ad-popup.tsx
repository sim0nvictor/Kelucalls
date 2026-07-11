"use client";

import { useEffect, useRef, useState } from "react";

const FIRST_DELAY_MS  = 2 * 60 * 1000;  // 2 minutes after page load
const REPEAT_DELAY_MS = 15 * 60 * 1000; // every 15 minutes after dismiss
const STORAGE_KEY     = "kelu_ad_dismissed_at";

type Ad = {
  id: string;
  label: string;
  destinationUrl: string;
  creativeCopy: string | null;
  imageUrl: string | null;
};

type AdPopupProps = {
  ads: Ad[];
};

export function AdPopup({ ads }: AdPopupProps) {
  const [visible, setVisible]     = useState(false);
  const [current, setCurrent]     = useState(0);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ad = ads[current] ?? null;

  function scheduleNext(delayMs: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAnimating(false);
      setVisible(true);
    }, delayMs);
  }

  useEffect(() => {
    if (!ad) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const lastDismissed = raw ? Number(raw) : 0;
    const msSinceDismiss = Date.now() - lastDismissed;
    const delay = msSinceDismiss < REPEAT_DELAY_MS
      ? REPEAT_DELAY_MS - msSinceDismiss
      : FIRST_DELAY_MS;
    scheduleNext(delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id]);

  function dismiss() {
    setAnimating(true);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setTimeout(() => {
      setVisible(false);
      if (ads.length > 1) setCurrent((prev) => (prev + 1) % ads.length);
      scheduleNext(REPEAT_DELAY_MS);
    }, 300);
  }

  function handleClick() {
    if (!ad) return;
    // Fire impression event
    void fetch("/api/ads/impression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adId: ad.id, pagePath: window.location.pathname }),
      keepalive: true,
    });
    dismiss();
    // Navigate to destination
    window.open(ad.destinationUrl, "_blank", "noopener,noreferrer");
  }

  if (!visible || !ad) return null;

  return (
    <div
      className={[
        "fixed bottom-6 right-6 z-50 w-80 transition-all duration-300",
        animating ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100",
      ].join(" ")}
      role="complementary"
      aria-label="Sponsored"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Sponsored
          </span>
          <button
            onClick={dismiss}
            className="flex size-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-300"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Banner image — shown if available */}
        {ad.imageUrl && (
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/7" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.imageUrl}
              alt={ad.label}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {!ad.imageUrl && (
            <div className="mb-3 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/4 text-xl">
              📢
            </div>
          )}
          <div className="font-semibold text-white leading-tight">{ad.label}</div>
          {ad.creativeCopy && (
            <p className="mt-1 text-sm leading-relaxed text-slate-400 line-clamp-3">
              {ad.creativeCopy}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleClick}
              className="flex-1 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-center text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25"
            >
              Learn more →
            </button>
            <button
              onClick={dismiss}
              className="rounded-xl border border-white/8 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}