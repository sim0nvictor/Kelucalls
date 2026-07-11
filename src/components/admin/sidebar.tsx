"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Layers, LayoutDashboard, Megaphone, ShieldAlert, Sparkles } from "lucide-react";

import { ADMIN_BASE_PATH } from "@/lib/admin/constants";
import { cn } from "@/lib/utils";

const items = [
  { href: ADMIN_BASE_PATH, label: "Overview", icon: LayoutDashboard },
  { href: `${ADMIN_BASE_PATH}/channels`,      label: "Channels",    icon: Layers },  
  { href: `${ADMIN_BASE_PATH}/ads`, label: "Ads", icon: Megaphone },
  { href: `${ADMIN_BASE_PATH}/placements`, label: "Placements", icon: Sparkles },
  { href: `${ADMIN_BASE_PATH}/moderation`, label: "Moderation", icon: ShieldAlert },
  { href: `${ADMIN_BASE_PATH}/analytics`, label: "Analytics", icon: BarChart3 }
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full rounded-[2rem] border border-white/10 bg-[#08111f]/90 p-4 shadow-[0_24px_120px_rgba(4,8,20,0.45)] lg:sticky lg:top-6 lg:w-72 lg:self-start">
      <div className="border-b border-white/10 px-3 pb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-300">
          Kelucalls Internal
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">Control Studio</div>
        <div className="mt-2 text-sm text-slate-400">
          Hidden operations surface for trusted staff.
        </div>
      </div>

      <nav className="mt-4 grid gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                active
                  ? "bg-cyan-400/12 text-cyan-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
