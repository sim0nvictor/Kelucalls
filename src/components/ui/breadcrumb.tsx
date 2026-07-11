import Link from "next/link";

import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-2 text-sm", className)}>
      <Link
        href="/"
        className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-cyan-400"
      >
        <Home className="size-4" />
        <span className="sr-only">Home</span>
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={item.label}>
            <ChevronRight className="size-4 text-slate-600" />
            {isLast ? (
              <span className="text-slate-300" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href || "#"}
                className="text-slate-500 transition-colors hover:text-cyan-400"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// Need to import React for Fragment
import React from "react";

export { Breadcrumb, type BreadcrumbItem };