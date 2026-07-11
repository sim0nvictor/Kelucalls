"use client";

import * as React from "react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { TableOfContents, type TOCItem } from "@/components/ui/table-of-contents";
import { ChevronUp } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  description?: string;
  lastUpdated?: string;
  toc?: TOCItem[];
  children: React.ReactNode;
  className?: string;
}

function LegalLayout({
  title,
  description,
  lastUpdated,
  toc,
  children,
  className,
}: LegalLayoutProps) {
  const [activeSection, setActiveSection] = useState<string>("");
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);

      // Find active section
      const headings = document.querySelectorAll<HTMLElement>("h2[id], h3[id]");
      let current = "";

      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 120) {
          current = heading.id;
        }
      }

      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={cn("min-h-screen", className)}>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/8 bg-gradient-to-b from-slate-950 to-slate-900/50 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_50%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumb
            items={[{ label: title }]}
            className="mb-6"
          />
          <div className="relative">
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-2xl text-lg text-slate-400">{description}</p>
            )}
            {lastUpdated && (
              <p className="mt-4 text-sm text-slate-500">
                Last updated: <time dateTime={lastUpdated}>{lastUpdated}</time>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
          {/* Content */}
          <article className="prose prose-invert prose-slate max-w-none">
            {children}
          </article>

          {/* Sidebar */}
          {toc && toc.length > 0 && (
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
                    On This Page
                  </h3>
                  <TableOfContents
                    items={toc}
                    activeId={activeSection}
                    onItemClick={(id) => setActiveSection(id)}
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 flex size-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/90 text-slate-400 shadow-lg backdrop-blur-xl transition-all hover:border-cyan-400/50 hover:text-cyan-400"
          aria-label="Back to top"
        >
          <ChevronUp className="size-6" />
        </button>
      )}
    </div>
  );
}

export { LegalLayout, type LegalLayoutProps };