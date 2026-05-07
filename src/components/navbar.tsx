"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { Menu, Search, X, Activity, TrendingUp, Users, Radio, Layers, Home } from "lucide-react";

import Logo from "@/assets/logo.jpg";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/trending", label: "Trending", icon: TrendingUp },
  { href: "/top-callers", label: "Top Callers", icon: Users },
  { href: "/channels", label: "Channels", icon: Layers },
  { href: "/tokens", label: "Tokens", icon: Activity },
  { href: "/live", label: "Live Feed", icon: Radio }
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div>
            <Image src={Logo} alt="Kelucalls" className="h-11 w-auto rounded-full object-cover" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold uppercase tracking-wider text-white">
              Kelucalls
            </div>
            <div className="text-[10px] text-slate-500">Call Intelligence</div>
          </div>
        </Link>

        <div className={`relative hidden transition-all md:block ${searchFocused ? "w-80" : "w-64"}`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search tokens, channels..."
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>

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
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`size-4 ${isActive ? "text-cyan-400" : ""}`} />
                <span className="hidden lg:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

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

      {mobileMenuOpen && (
        <div className="border-t border-white/8 bg-slate-950/95 px-4 py-4 md:hidden">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search tokens, channels..."
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
            />
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