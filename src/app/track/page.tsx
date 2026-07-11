"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Search, ArrowUpRight, Radio, CheckCircle, AlertCircle,
  Layers, Coins, Users, ExternalLink, ShieldCheck, ShieldAlert,
  Loader2, X, BookmarkPlus, Lock, TrendingUp, Trophy, Zap
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPercent, formatMultiple } from "@/lib/metrics";

// ── Types ──────────────────────────────────────────────────────────────────

type ChannelResult = {
  id: string; slug: string; title: string;
  telegramHandle: string; telegramUrl: string;
  status: string; isVerified: boolean;
  totalCalls: number; winRatePct: number;
  averageRoiPct: number; rankingScore: number;
};

type TokenResult = {
  id: string; symbol: string; name: string | null;
  chain: string; contractAddress: string | null;
  lastPriceUsd: number | null;
};

type TelegramPreview = {
  found: true;
  title: string;
  handle: string;
  memberCount: number | null;
  description: string | null;
  isBroadcast: boolean;
  isScam: boolean;
  isFake: boolean;
  isVerified: boolean;
  telegramUrl: string;
  trackedStatus: string | null;
  queuedStatus: string | null;
};

// Scraped result returned after polling completes
type TrackedResult = {
  slug: string;
  title: string;
  telegramHandle: string;
  telegramUrl: string;
  isVerified: boolean;
  totalCalls: number;
  winRatePct: number;
  averageRoiPct: number;
  averagePeakRoiPct: number;
  bestMultiple: number;
  rankingScore: number;
  hit2xCount: number;
  hit10xCount: number;
  simulatedCurrentPnlUsd: number;
};

type TrackPhase =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "queued"; handle: string }
  | { type: "processing"; handle: string }
  | { type: "done"; result: TrackedResult }
  | { type: "already_tracked"; slug: string; message: string }
  | { type: "error"; message: string };

// ── Helpers ────────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => fn(...args), ms);
  }, [fn, ms]);
}

function fmtMembers(n: number | null): string {
  if (n === null) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ── Search result cards ────────────────────────────────────────────────────

function ChannelResultCard({ ch }: { ch: ChannelResult }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-4 transition-colors hover:border-cyan-400/20 hover:bg-slate-800/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {ch.isVerified && (
              <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200 text-xs">Verified</Badge>
            )}
            <Badge className="border-white/10 bg-white/5 text-slate-300 text-xs capitalize">{ch.status}</Badge>
          </div>
          <div className="text-base font-semibold text-white truncate">{ch.title}</div>
          <div className="text-xs text-slate-500">{ch.telegramHandle}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Avg ROI</div>
          <div className={`text-lg font-semibold ${ch.averageRoiPct >= 0 ? "text-emerald-300" : "text-red-400"}`}>
            {formatPercent(ch.averageRoiPct)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-xs text-slate-400">
          <span>{ch.totalCalls} calls</span>
          <span>{formatPercent(ch.winRatePct)} win rate</span>
          <span>Score {ch.rankingScore.toFixed(1)}</span>
        </div>
        <div className="flex gap-2">
          <Link href={`/channels/${ch.slug}`}>
            <Button size="sm" className="h-8 text-xs gap-1">
              View report <ArrowUpRight className="size-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TokenResultCard({ tk }: { tk: TokenResult }) {
  const href = tk.contractAddress
    ? `/tokens/${encodeURIComponent(tk.contractAddress)}`
    : `/tokens`;
  return (
    <Link href={href}>
      <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-4 transition-colors hover:border-cyan-400/20 hover:bg-slate-800/60 cursor-pointer">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">{tk.symbol}</span>
              {tk.name && <span className="text-xs text-slate-500">{tk.name}</span>}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="capitalize">{tk.chain}</span>
              {tk.contractAddress && (
                <span className="font-mono">
                  {tk.contractAddress.slice(0, 6)}…{tk.contractAddress.slice(-4)}
                </span>
              )}
            </div>
          </div>
          {tk.lastPriceUsd ? (
            <div className="text-right">
              <div className="text-xs text-slate-500">Last price</div>
              <div className="text-base font-semibold text-white">
                ${tk.lastPriceUsd < 0.0001
                  ? tk.lastPriceUsd.toExponential(2)
                  : tk.lastPriceUsd.toPrecision(4)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-600">No price data</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Tracked result card (appears after scraper finishes) ───────────────────

function TrackedResultCard({
  result,
  onSave,
}: {
  result: TrackedResult;
  onSave: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-slate-900/90 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-5 border-b border-white/8">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200 text-xs">
              <CheckCircle className="size-3 mr-1" /> Tracked
            </Badge>
            {result.isVerified && (
              <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200 text-xs">
                <ShieldCheck className="size-3 mr-1" /> Verified
              </Badge>
            )}
          </div>
          <h3 className="text-xl font-semibold text-white">{result.title}</h3>
          <div className="text-sm text-slate-400">{result.telegramHandle}</div>
        </div>
        <a
          href={result.telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors"
        >
          Open <ExternalLink className="size-3.5" />
        </a>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-white/8">
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-widest">
            <TrendingUp className="size-3" /> Avg ROI
          </div>
          <div className={`text-2xl font-semibold ${result.averageRoiPct >= 0 ? "text-emerald-300" : "text-red-400"}`}>
            {formatPercent(result.averageRoiPct)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-widest">
            <Zap className="size-3" /> Win rate
          </div>
          <div className="text-2xl font-semibold text-white">
            {formatPercent(result.winRatePct)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-widest">
            <Trophy className="size-3" /> Best
          </div>
          <div className="text-2xl font-semibold text-white">
            {formatMultiple(result.bestMultiple)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-xs text-slate-500 uppercase tracking-widest">Calls</div>
          <div className="text-2xl font-semibold text-white">{result.totalCalls}</div>
        </div>
      </div>

      {/* Milestone badges */}
      {(result.hit2xCount > 0 || result.hit10xCount > 0) && (
        <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-white/8">
          {result.hit2xCount > 0 && (
            <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
              {result.hit2xCount}× 2x hits
            </span>
          )}
          {result.hit10xCount > 0 && (
            <span className="text-xs rounded-full border border-amber-400/20 bg-amber-400/8 px-2.5 py-1 text-amber-300">
              {result.hit10xCount}× 10x hits
            </span>
          )}
          <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
            Peak ROI {formatPercent(result.averagePeakRoiPct)}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 p-5 border-t border-white/8 bg-white/2">
        <Link href={`/channels/${result.slug}`} className="w-full sm:w-auto">
          <Button className="w-full gap-2">
            Full report <ArrowUpRight className="size-4" />
          </Button>
        </Link>
        <Button
          variant="secondary"
          className="w-full sm:w-auto gap-2"
          onClick={onSave}
        >
          <BookmarkPlus className="size-4" />
          Save channel
        </Button>
      </div>
    </div>
  );
}

// ── Auth gate (shown when unauthenticated user hits Save) ──────────────────

function SaveGate({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-slate-900/90 p-6 space-y-4 text-center">
      <div className="flex justify-center">
        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 p-3">
          <Lock className="size-5 text-cyan-300" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">Sign up to save channels</h3>
        <p className="mt-1 text-sm text-slate-400">
          Create a free account to build your personal watchlist and get alerts when tracked channels post new calls.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button className="gap-2">
          Create account
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Maybe later
        </Button>
      </div>
    </div>
  );
}

// ── Processing status card (shown while scraper works) ────────────────────

function ProcessingCard({ handle, phase }: { handle: string; phase: "queued" | "processing" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="size-9 rounded-full border border-cyan-400/30 bg-cyan-400/10 flex items-center justify-center">
            <Radio className="size-4 text-cyan-400" />
          </div>
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">
            {phase === "queued" ? "Queued for analysis" : "Scraper is reading this channel…"}
          </div>
          <div className="text-xs text-slate-500">{handle}</div>
        </div>
        <Loader2 className="size-4 animate-spin text-slate-500 ml-auto" />
      </div>

      <div className="space-y-2">
        {[
          { label: "Reading call history", done: phase === "processing" },
          { label: "Identifying token calls", done: false },
          { label: "Fetching entry prices", done: false },
          { label: "Calculating performance", done: false },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            <div className={`size-1.5 rounded-full shrink-0 ${step.done ? "bg-emerald-400" : "bg-slate-700"}`} />
            <span className={step.done ? "text-emerald-300" : "text-slate-500"}>{step.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600">
        Usually takes 1–3 minutes. Results appear here automatically.
      </p>
    </div>
  );
}

// ── Unified search bar with live Telegram lookup ──────────────────────────

function UnifiedSearchBar({
  onDbResults,
  onTelegramPreview,
  onClear,
}: {
  onDbResults: (channels: ChannelResult[], tokens: TokenResult[]) => void;
  onTelegramPreview: (p: TelegramPreview | null) => void;
  onClear: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<"idle" | "searching" | "looking">("idle");
  const [dropPreview, setDropPreview] = useState<TelegramPreview | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // DB search
  const doDbSearch = useCallback(async (val: string) => {
    if (val.length < 2) { onDbResults([], []); return; }
    setState("searching");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      onDbResults(data.channels ?? [], data.tokens ?? []);
    } catch { /* silent */ }
    finally { setState("idle"); }
  }, [onDbResults]);

  // Telegram live lookup (only for handle-like input)
  const doTelegramLookup = useCallback(async (val: string) => {
    const cleaned = val.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");
    if (cleaned.length < 4) { setDropPreview(null); setDropOpen(false); return; }
    setState("looking");
    try {
      const res = await fetch(`/api/telegram-lookup?handle=${encodeURIComponent(val.trim())}`);
      const data = await res.json();
      if (data.found) {
        setDropPreview(data as TelegramPreview);
        setDropOpen(true);
      } else {
        setDropPreview(null);
        setDropOpen(false);
      }
    } catch { setDropPreview(null); }
    finally { setState("idle"); }
  }, []);

  const debouncedDb = useDebounce(doDbSearch, 320);
  const debouncedTg = useDebounce(doTelegramLookup, 500);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setRaw(val);
    onTelegramPreview(null);
    setDropOpen(false);

    // Looks like a handle/URL → Telegram lookup + DB search
    const looksLikeHandle = val.startsWith("@") || val.startsWith("http") || /^[a-zA-Z0-9_]{4,}$/.test(val.trim());
    debouncedDb(val);
    if (looksLikeHandle) debouncedTg(val);
  }

  function selectFromDrop(p: TelegramPreview) {
    setRaw(p.handle);
    setDropOpen(false);
    setDropPreview(null);
    onTelegramPreview(p);
    onDbResults([], []);
  }

  function clearAll() {
    setRaw("");
    setDropPreview(null);
    setDropOpen(false);
    setState("idle");
    onDbResults([], []);
    onTelegramPreview(null);
    onClear();
  }

  const isLooking = state === "looking";
  const isSearching = state === "searching";

  return (
    <div ref={wrapRef} className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={raw}
        onChange={onChange}
        onFocus={() => { if (dropPreview) setDropOpen(true); }}
        placeholder="Channel name, @handle, t.me/link, token symbol or contract…"
        className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-12 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {(isLooking || isSearching) ? (
          <Loader2 className="size-4 animate-spin text-cyan-400" />
        ) : raw ? (
          <button onClick={clearAll} className="text-slate-500 hover:text-white transition-colors">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Telegram drop suggestion */}
      {dropOpen && dropPreview && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
            Found on Telegram — click to analyse
          </div>
          <button
            onClick={() => selectFromDrop(dropPreview)}
            className="w-full flex items-start justify-between gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{dropPreview.title}</span>
                {dropPreview.isVerified && <ShieldCheck className="size-3.5 text-emerald-400" />}
                {dropPreview.trackedStatus && (
                  <span className="text-[10px] rounded-full border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">
                    Already tracked
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {dropPreview.handle}
                {dropPreview.memberCount !== null && ` · ${fmtMembers(dropPreview.memberCount)} members`}
                {` · ${dropPreview.isBroadcast ? "Channel" : "Group"}`}
              </div>
              {dropPreview.description && (
                <div className="text-xs text-slate-500 line-clamp-1">{dropPreview.description}</div>
              )}
            </div>
            <ArrowUpRight className="size-4 text-slate-500 shrink-0 mt-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Telegram preview card (before requesting tracking) ─────────────────────

function TelegramPreviewCard({
  preview,
  onRequestTracking,
  submitting,
}: {
  preview: TelegramPreview;
  onRequestTracking: () => void;
  submitting: boolean;
}) {
  const alreadyTracked = Boolean(preview.trackedStatus);
  const alreadyQueued  = Boolean(preview.queuedStatus);
  const blocked        = preview.isScam || preview.isFake;

  return (
    <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/90 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {preview.isVerified && (
              <span className="flex items-center gap-1 text-xs text-emerald-300">
                <ShieldCheck className="size-3.5" /> Verified
              </span>
            )}
            {blocked && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <ShieldAlert className="size-3.5" /> {preview.isScam ? "Scam" : "Fake"}
              </span>
            )}
            {alreadyTracked && (
              <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200 text-xs">
                Live on Kelucalls
              </Badge>
            )}
            {!alreadyTracked && alreadyQueued && (
              <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-200 text-xs">
                In queue
              </Badge>
            )}
          </div>
          <h3 className="text-lg font-semibold text-white">{preview.title}</h3>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>{preview.handle}</span>
            {preview.memberCount !== null && (
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />{fmtMembers(preview.memberCount)} members
              </span>
            )}
          </div>
        </div>
        <a
          href={preview.telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors"
        >
          Open <ExternalLink className="size-3.5" />
        </a>
      </div>

      {preview.description && (
        <p className="text-sm leading-6 text-slate-400 line-clamp-2">{preview.description}</p>
      )}

      {alreadyTracked ? (
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-3 text-sm text-cyan-200">
          This channel is already live on Kelucalls — results will appear in the search above.
        </div>
      ) : alreadyQueued ? (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/8 p-3 text-sm text-amber-200">
          Already in the queue — stay on this page and results will appear below when ready.
        </div>
      ) : blocked ? (
        <div className="rounded-xl border border-red-400/15 bg-red-400/8 p-3 text-sm text-red-300">
          Flagged as {preview.isScam ? "scam" : "fake"} by Telegram. Cannot be tracked.
        </div>
      ) : (
        <Button
          onClick={onRequestTracking}
          disabled={submitting}
          className="w-full gap-2"
        >
          {submitting
            ? <Loader2 className="size-4 animate-spin" />
            : <Radio className="size-4" />}
          Analyse {preview.handle}
        </Button>
      )}
    </div>
  );
}

// ── Polling hook ───────────────────────────────────────────────────────────

function useTrackingPoller(handle: string | null, enabled: boolean) {
  const [result, setResult] = useState<TrackedResult | null>(null);
  const [status, setStatus] = useState<"queued" | "processing" | "done" | "failed" | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !handle) return;

    async function poll() {
      try {
        const res = await fetch(`/api/track/status?handle=${encodeURIComponent(handle!)}`);
        if (!res.ok) return;
        const data = await res.json();

        setStatus(data.status);

        if (data.status === "done" && data.channel) {
          setResult(data.channel as TrackedResult);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
        if (data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch { /* silent */ }
    }

    poll(); // immediate
    intervalRef.current = setInterval(poll, 5000); // every 5s

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handle, enabled]);

  function reset() {
    setResult(null);
    setStatus(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  return { result, status, reset };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const [dbChannels, setDbChannels] = useState<ChannelResult[]>([]);
  const [dbTokens, setDbTokens]     = useState<TokenResult[]>([]);
  const [preview, setPreview]       = useState<TelegramPreview | null>(null);
  const [trackPhase, setTrackPhase] = useState<TrackPhase>({ type: "idle" });
  const [showSaveGate, setShowSaveGate] = useState(false);

  // Handle to poll for (only set after successful queue)
  const pollingHandle =
    trackPhase.type === "queued" || trackPhase.type === "processing"
      ? (trackPhase as { handle: string }).handle
      : null;

  const { result: polledResult, status: pollStatus, reset: resetPoller } = useTrackingPoller(
    pollingHandle,
    pollingHandle !== null
  );

  // Sync poll status → trackPhase
  useEffect(() => {
    if (!pollStatus) return;
    if (pollStatus === "processing" && trackPhase.type === "queued") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrackPhase({
        type: "processing",
        handle: (trackPhase as { handle: string }).handle,
      });
    } else if (pollStatus === "done" && trackPhase.type === "processing") {
      if (polledResult) {
         
        setTrackPhase({ type: "done", result: polledResult });
      } else {
         
        setTrackPhase({
          type: "error",
          message: "The scraper finished but no result was returned. Please try again.",
        });
      }
    } else if (pollStatus === "failed" && trackPhase.type === "processing") {
       
      setTrackPhase({
        type: "error",
        message: "The scraper could not process this channel. Try again later.",
      });
    }
  }, [pollStatus, polledResult, trackPhase]);

  async function handleRequestTracking() {
    if (!preview) return;
    setTrackPhase({ type: "submitting" });

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: preview.handle }),
      });
      const data = await res.json();

      if (!res.ok) {
        setTrackPhase({ type: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      if (data.alreadyTracked) {
        setTrackPhase({ type: "already_tracked", slug: data.slug, message: data.message });
        return;
      }

      // Queued or already queued — start polling
      setTrackPhase({ type: "queued", handle: preview.handle });
    } catch {
      setTrackPhase({ type: "error", message: "Network error. Please try again." });
    }
  }

  function handleClear() {
    setTrackPhase({ type: "idle" });
    setPreview(null);
    resetPoller();
    setShowSaveGate(false);
  }

  const hasDbResults = dbChannels.length > 0 || dbTokens.length > 0;

  // Determine what to show in the result area below the search
  const showPreviewCard = preview && trackPhase.type === "idle";
  const showProcessing  = trackPhase.type === "queued" || trackPhase.type === "processing";
  const showDoneCard    = trackPhase.type === "done";
  const showError       = trackPhase.type === "error";
  const showAlreadyTracked = trackPhase.type === "already_tracked";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">

      {/* Hero */}
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-8 shadow-[0_0_80px_rgba(8,145,178,0.10)] sm:px-8">
        <Badge>Track & Analyse</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Look up any channel.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-8 text-slate-300">
          Search tracked channels and tokens, or paste any Telegram handle to analyse a new one.
          Results appear here — no admin, no waiting room.
        </p>
      </section>

      {/* Main search + results */}
      <section className="space-y-4">
        <UnifiedSearchBar
          onDbResults={(ch, tk) => { setDbChannels(ch); setDbTokens(tk); }}
          onTelegramPreview={(p) => { setPreview(p); setTrackPhase({ type: "idle" }); resetPoller(); setShowSaveGate(false); }}
          onClear={handleClear}
        />

        {/* DB results */}
        {hasDbResults && (
          <div className="space-y-6">
            {dbChannels.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500">
                  <Layers className="size-3.5" /> Tracked channels ({dbChannels.length})
                </div>
                {dbChannels.map((ch) => <ChannelResultCard key={ch.id} ch={ch} />)}
              </div>
            )}
            {dbTokens.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500">
                  <Coins className="size-3.5" /> Tokens ({dbTokens.length})
                </div>
                {dbTokens.map((tk) => <TokenResultCard key={tk.id} tk={tk} />)}
              </div>
            )}
          </div>
        )}

        {/* Telegram preview — before requesting tracking */}
        {showPreviewCard && !hasDbResults && (
          <TelegramPreviewCard
            preview={preview}
            onRequestTracking={handleRequestTracking}
            submitting={(trackPhase.type as string) === "submitting"}
          />
        )}

        {/* Processing status */}
        {showProcessing && (
          <ProcessingCard
            handle={(trackPhase as { handle: string }).handle}
            phase={trackPhase.type as "queued" | "processing"}
          />
        )}

        {/* Done — tracked result card */}
        {showDoneCard && !showSaveGate && (
          <TrackedResultCard
            result={(trackPhase as { result: TrackedResult }).result}
            onSave={() => setShowSaveGate(true)}
          />
        )}

        {/* Save gate */}
        {showSaveGate && (
          <SaveGate onDismiss={() => setShowSaveGate(false)} />
        )}

        {/* Already tracked */}
        {showAlreadyTracked && (
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/8 p-5 flex items-start gap-3">
            <CheckCircle className="size-4 text-cyan-300 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-cyan-200">
                {(trackPhase as { message: string }).message}
              </p>
              <Link href={`/channels/${(trackPhase as { slug: string }).slug}`}>
                <Button size="sm" className="gap-1.5">
                  View report <ArrowUpRight className="size-3" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Error */}
        {showError && (
          <div className="rounded-2xl border border-red-400/15 bg-red-400/8 p-4 flex items-start gap-3">
            <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">
              {(trackPhase as { message: string }).message}
            </p>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-white/8 bg-white/3 p-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">How it works</h3>
        <div className="mt-4 grid gap-6 sm:grid-cols-3 text-sm">
          <div className="space-y-1">
            <div className="text-white font-medium">1. Search or paste</div>
            <p className="text-slate-400 leading-6">
              Search by name, token, or contract. Paste any @handle or t.me link to look up a channel live from Telegram.
            </p>
          </div>
          <div className="space-y-1">
            <div className="text-white font-medium">2. Scraper analyses it</div>
            <p className="text-slate-400 leading-6">
              Our bot reads call history, records entry prices, and calculates ROI, win rate, and multiples.
            </p>
          </div>
          <div className="space-y-1">
            <div className="text-white font-medium">3. Results appear here</div>
            <p className="text-slate-400 leading-6">
              Data loads right on this page. Save channels to your watchlist by creating a free account.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}