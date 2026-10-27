"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Menu, Search, X, Activity, TrendingUp, Users, Radio, Layers, Home, ArrowUpRight, Compass, BookOpen, UserRound, Sparkles } from "lucide-react";

import Logo from "@/assets/logo.jpg";
import { NotificationBell } from "@/components/account/notification-bell";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/metrics";
import { siteConfig } from "@/config/site";
import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";

const navLinks = [
  { href: "/",           label: "Home",       icon: Home },
  { href: "/trending",   label: "Trending",   icon: TrendingUp },
  { href: "/opportunities", label: "Opportunities", icon: Sparkles },
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

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// ── Search dropdown ────────────────────────────────────────────────────────
export function SearchBox({ onNavigate }: { onNavigate?: () => void; mobile?: boolean } = {}) {
  const router = useRouter();
  const [query, setQuery]         = useState("");
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [channels, setChannels]   = useState<ChannelHit[]>([]);
  const [tokens, setTokens]       = useState<TokenHit[]>([]);
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
      onNavigate?.();
      router.push(`/track?q=${encodeURIComponent(query.trim())}`);
    }
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
  }

  const hasResults = channels.length > 0 || tokens.length > 0;

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full">
      {/* Input */}
      <div className="relative min-w-0 w-full transition-all duration-200">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={onChange}
          onFocus={() => { if (channels.length || tokens.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          aria-label="Search tokens and channels"
          placeholder="Search tokens, channels..."
          className={`w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-${loading ? "10" : "4"} text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20`}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        )}
      </div>

      {/* Dropdown */}
      {open && hasResults && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl">
          {channels.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                Channels
              </div>
              {channels.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/channel/${ch.slug}`}
                  onClick={() => { setOpen(false); setQuery(""); onNavigate?.(); }}
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
                  onClick={() => { setOpen(false); setQuery(""); onNavigate?.(); }}
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
              onClick={() => { setOpen(false); setQuery(""); onNavigate?.(); }}
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
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const [compactSearchPath, setCompactSearchPath] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const portalReady = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);

  // The navbar is a client component with no access to the session, so the
  // account entry always points at /account. That route redirects anonymous
  // visitors to /login, which keeps this component session-free.
  //
  // NotificationBell follows the same rule: it fetches its own unread count
  // after hydration and renders nothing for signed-out visitors, so adding it
  // here does not make any page dynamic.
  const isAccountActive = pathname.startsWith(ACCOUNT_BASE_PATH);
  const mobileMenuOpen = mobileMenuPath === pathname;
  const compactSearchOpen = compactSearchPath === pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen && !compactSearchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuPath(null);
        setCompactSearchPath(null);
      }
    }

    function onResize() {
      if (window.innerWidth >= 768) setMobileMenuPath(null);
      if (window.innerWidth >= 1024) setCompactSearchPath(null);
    }

    function onPopState() {
      setMobileMenuPath(null);
      setCompactSearchPath(null);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPopState);
    };
  }, [mobileMenuOpen, compactSearchOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    document.querySelector<HTMLElement>("#mobile-navigation-drawer input")?.focus();
    const toggle = mobileMenuToggleRef.current;
    return () => toggle?.focus();
  }, [mobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-slate-950/80 shadow-[0_4px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
          : "border-b border-transparent bg-transparent backdrop-blur-0"
      }`}
    >
      <div className="mx-auto hidden w-full max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6 min-[768px]:flex">
        <Link href="/" aria-label={siteConfig.name} data-testid="desktop-brand" className="flex shrink-0 items-center gap-3">
          <Image src={Logo} alt={siteConfig.name} className="h-11 w-auto rounded-full object-cover" />
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-white">{siteConfig.name}</div>
            <div className="text-[10px] text-slate-500">Call Intelligence</div>
          </div>
        </Link>

        <div
          data-testid="desktop-search-slot"
          className="hidden min-w-0 max-w-[280px] flex-[1_1_0%] w-[clamp(180px,16vw,280px)] min-[1024px]:block"
        >
          <SearchBox />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={compactSearchOpen ? "Close search" : "Open search"}
          aria-expanded={compactSearchOpen}
          aria-controls="compact-search-overlay"
          data-testid="compact-search-toggle"
          onClick={() => setCompactSearchPath(compactSearchOpen ? null : pathname)}
          className="hidden size-11 min-h-11 min-w-11 min-[768px]:flex min-[1024px]:hidden"
        >
          <Search className="size-5" />
        </Button>

        <nav
          aria-label="Main navigation"
          data-testid="desktop-nav"
          className="ml-auto hidden shrink-0 flex-nowrap items-center gap-0.5 min-[768px]:flex"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                aria-label={link.label}
                data-testid="desktop-nav-item"
                className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-slate-400 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className={`size-4 shrink-0 ${isActive ? "text-cyan-400" : ""}`} />
                <span className="hidden min-[1536px]:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div data-testid="desktop-actions" className="hidden shrink-0 items-center gap-1 min-[768px]:flex">
          <NotificationBell />
          <Link
            href={ACCOUNT_BASE_PATH}
            title="Your account"
            aria-label="Your account"
            data-testid="desktop-account"
            className={`group relative ml-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-2.5 py-2 text-sm font-medium transition-all ${
              isAccountActive
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                : "border-white/10 text-slate-300 hover:bg-white/8 hover:text-white"
            }`}
          >
            <UserRound className={`size-4 shrink-0 ${isAccountActive ? "text-cyan-400" : ""}`} />
            <span className="hidden min-[1536px]:inline">Account</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto grid w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 px-4 py-3 sm:px-6 min-[768px]:hidden">
        <Link
          href="/"
          aria-label={siteConfig.name}
          data-testid="mobile-brand"
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <Image src={Logo} alt="" className="size-11 rounded-full object-cover" />
        </Link>
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          data-testid="mobile-wordmark"
          className="min-w-0 justify-self-center truncate text-center text-sm font-bold uppercase tracking-wider text-white"
        >
          {siteConfig.name}
        </Link>
        <div className="flex size-11 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
            data-testid="mobile-menu-toggle"
            ref={mobileMenuToggleRef}
            onClick={() => setMobileMenuPath(mobileMenuOpen ? null : pathname)}
            className="size-11 min-h-11 min-w-11"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {portalReady && createPortal(
        <div
          id="mobile-navigation-drawer"
          hidden={!mobileMenuOpen}
          aria-hidden={!mobileMenuOpen}
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm min-[768px]:hidden"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMobileMenuPath(null);
          }}
        >
          <section
            role="dialog"
            aria-label="Mobile navigation"
            aria-modal={mobileMenuOpen}
            className="absolute inset-x-0 bottom-0 top-[68px] overflow-y-auto border-t border-white/10 bg-slate-950/95 px-4 py-4 shadow-2xl"
          >
            <div className="mb-4">
              <SearchBox onNavigate={() => setMobileMenuPath(null)} />
            </div>
            <nav aria-label="Mobile navigation links" className="grid grid-cols-2 gap-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuPath(null)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-cyan-500/15 text-cyan-300"
                        : "bg-white/5 text-slate-300"
                    }`}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
            <NotificationBell mobile onNavigate={() => setMobileMenuPath(null)} />
            <Link
              href={ACCOUNT_BASE_PATH}
              onClick={() => setMobileMenuPath(null)}
              className={`mt-2 flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                isAccountActive
                  ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              <UserRound className="size-5" />
              Account
            </Link>
          </section>
        </div>,
        document.body
      )}

      {portalReady && createPortal(
        <div
          id="compact-search-overlay"
          hidden={!compactSearchOpen}
          aria-hidden={!compactSearchOpen}
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm min-[1024px]:hidden"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCompactSearchPath(null);
          }}
        >
          <div className="absolute inset-x-4 top-[76px] mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl">
            <SearchBox onNavigate={() => setCompactSearchPath(null)} />
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
