"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, Search, X, Activity, TrendingUp, Users, Radio, Layers, Home, ArrowUpRight, Compass, BookOpen } from "lucide-react";

import Logo from "@/assets/logo.jpg";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/metrics";

const navLinks = [
  { href: "/",           label: "Home",       icon: Home },
  { href: "/trending",   label: "Trending",   icon: TrendingUp },
  { href: "/top-callers",label: "Top Callers",icon: Users },
  { href: "/channels",   label: "Channels",   icon: Layers },
  { href: "/tokens",     label: "Tokens",     icon: Activity },
  { href: "/live",       label: "Live Feed",  icon: Radio },
  { href: "/insights",   label: "Insights",   icon: BookOpen },
  { href: "/track",      label: "Track",      icon: Compass },
];

// ── Types ──────────────────────────────────────────────────────────────────
type ChannelHit = {
  id: string; slug: string; title: string;
  telegramHandle: string; averageRoiPct: number; totalCalls: number;
};
type TokenHit = {
  id: string; symbol: string; name: string | null;
  chain: string; contractAddress: string | null; lastPriceUsd: number | null;
};

// ── Debounce ───────────────────────────────────────────────────────────────
function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => fn(...args), ms);
    },
    [fn, ms]
  );
}

// ── Search dropdown ────────────────────────────────────────────────────────
function SearchBox({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [query, setQuery]         = useState("");
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [channels, setChannels]   = useState<ChannelHit[]>([]);
  const [tokens, setTokens]       = useState<TokenHit[]>([]);
  const [focused, setFocused]     = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setChannels([]); setTokens([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setChannels(data.channels ?? []);
      setTokens(data.tokens ?? []);
      setOpen(true);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const debounced = useDebounce(doSearch, 280);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    debounced(v);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim().length > 1) {
      setOpen(false);
      router.push(`/track?q=${encodeURIComponent(query.trim())}`);
    }
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
  }

  const hasResults = channels.length > 0 || tokens.length > 0;

  return (
    <div ref={wrapRef} className={`relative ${mobile ? "w-full" : ""}`}>
      {/* Input */}
      <div className={`relative transition-all duration-200 ${!mobile && (focused ? "w-80" : "w-64")}`}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={onChange}
          onFocus={() => { setFocused(true); if (channels.length || tokens.length) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder="Search tokens, channels..."
          className={`w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-${loading ? "10" : "4"} text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20`}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        )}
      </div>

      {/* Dropdown */}
      {open && hasResults && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl">
          {channels.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                Channels
              </div>
              {channels.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/channel/${ch.slug}`}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-colors"
                >
                  <div>
                    <div className="font-medium text-white">{ch.title}</div>
                    <div className="text-xs text-slate-500">{ch.telegramHandle} · {ch.totalCalls} calls</div>
                  </div>
                  <div className={`text-xs font-semibold ${ch.averageRoiPct >= 0 ? "text-emerald-300" : "text-red-400"}`}>
                    {formatPercent(ch.averageRoiPct)}
                  </div>
                </Link>
              ))}
            </div>
          )}
          {tokens.length > 0 && (
            <div className={channels.length > 0 ? "border-t border-white/5" : ""}>
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                Tokens
              </div>
              {tokens.map((tk) => (
                <Link
                  key={tk.id}
                  href={tk.contractAddress ? `/tokens/${encodeURIComponent(tk.contractAddress)}` : "/tokens"}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 transition-colors"
                >
                  <div>
                    <div className="font-medium text-white">{tk.symbol}</div>
                    <div className="text-xs text-slate-500 capitalize">{tk.chain}{tk.name ? ` · ${tk.name}` : ""}</div>
                  </div>
                  {tk.lastPriceUsd && (
                    <div className="text-xs font-mono text-slate-300">
                      ${tk.lastPriceUsd < 0.0001 ? tk.lastPriceUsd.toExponential(2) : tk.lastPriceUsd.toPrecision(4)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
          {/* Footer: see all */}
          <div className="border-t border-white/5 px-3 py-2">
            <Link
              href={`/track?q=${encodeURIComponent(query)}`}
              onClick={() => { setOpen(false); setQuery(""); }}
              className="flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
            >
              See all results for &quot;{query}&quot;
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────
export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-slate-950/80 shadow-[0_4px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
          : "border-b border-transparent bg-transparent backdrop-blur-0"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image src={Logo} alt="Kelucalls" className="h-11 w-auto rounded-full object-cover" />
          <div className="hidden sm:block">
            <div className="text-sm font-bold uppercase tracking-wider text-white">Kelucalls</div>
            <div className="text-[10px] text-slate-500">Call Intelligence</div>
          </div>
        </Link>

        {/* Desktop search */}
        <div className="hidden md:block">
          <SearchBox />
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:gap-2 xl:gap-4 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-slate-400 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className={`size-4 ${isActive ? "text-cyan-400" : ""}`} />
                <span className="hidden lg:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="size-10"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-white/8 bg-slate-950/95 px-4 py-4 backdrop-blur-2xl md:hidden">
          <div className="mb-4">
            <SearchBox mobile />
          </div>
          <nav className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-300"
                      : "bg-white/5 text-slate-300"
                  }`}
                >
                  <Icon className="size-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
