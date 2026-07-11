"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface TOCItem {
  id: string;
  title: string;
  children?: TOCItem[];
}

interface TableOfContentsProps {
  items: TOCItem[];
  className?: string;
  activeId?: string;
  onItemClick?: (id: string) => void;
}

function TableOfContents({ items, className, activeId, onItemClick }: TableOfContentsProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set(items.map((i) => i.id)));

  const handleClick = (id: string) => {
    onItemClick?.(id);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderItems = (items: TOCItem[], depth = 0) => {
    return items.map((item) => {
      const isActive = activeId === item.id;
      const hasChildren = item.children && item.children.length > 0;
      const isExpanded = expanded.has(item.id);

      return (
        <div key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              handleClick(item.id);
              document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
            }}
            className={cn(
              "group flex items-center gap-2 py-2 text-sm transition-all duration-200",
              depth > 0 && "ml-4",
              isActive
                ? "text-cyan-400 font-medium"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {hasChildren && (
              <button
                onClick={(e) => toggleExpand(item.id, e)}
                className="flex size-4 items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
              >
                <ChevronRight
                  className={cn("size-3 transition-transform", isExpanded && "rotate-90")}
                />
              </button>
            )}
            <span className={cn("flex-1", !hasChildren && depth > 0 && "ml-4")}>{item.title}</span>
          </a>
          {hasChildren && isExpanded && (
            <div className="mt-1">{renderItems(item.children!, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <nav className={cn("space-y-1", className)} aria-label="Table of contents">
      {renderItems(items)}
    </nav>
  );
}

export { TableOfContents, type TOCItem };