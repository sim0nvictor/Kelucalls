"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
  debounceMs?: number;
}

function SearchBar({
  placeholder = "Search...",
  onSearch,
  className,
  debounceMs = 300,
}: SearchBarProps) {
  const [query, setQuery] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      onSearch?.(query);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, debounceMs, onSearch]);

  const clearSearch = () => {
    setQuery("");
    onSearch?.("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500 transition-colors",
          focused && "text-cyan-400"
        )}
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-12 text-slate-200 placeholder-slate-500 outline-none transition-all duration-300",
          focused
            ? "border-cyan-400/50 bg-white/[0.07] ring-2 ring-cyan-400/20"
            : "hover:border-white/20"
        )}
      />
      {query && (
        <button
          onClick={clearSearch}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-white"
          aria-label="Clear search"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}

export { SearchBar };