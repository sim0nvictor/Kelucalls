import { getSimulatedInvestmentPerCall } from "@/lib/server-env";

export function toNumber(value: unknown, fallback?: number): number;
export function toNumber(value: unknown, fallback: null): number | null;
export function toNumber(value: unknown, fallback: number | null = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function computeRoiPercent(entryPriceUsd: number, observedPriceUsd: number) {
  if (entryPriceUsd <= 0 || observedPriceUsd <= 0) {
    return 0;
  }

  return ((observedPriceUsd - entryPriceUsd) / entryPriceUsd) * 100;
}

export function computeMultiple(entryPriceUsd: number, observedPriceUsd: number) {
  if (entryPriceUsd <= 0 || observedPriceUsd <= 0) {
    return 1;
  }

  return observedPriceUsd / entryPriceUsd;
}

export function computeMilestones(multiple: number) {
  return {
    hit2x: multiple >= 2,
    hit5x: multiple >= 5,
    hit10x: multiple >= 10,
    hit50x: multiple >= 50,
    hit100x: multiple >= 100
  };
}

export function computeSimulatedPnl(multiple: number, investmentUsd = getSimulatedInvestmentPerCall()) {
  const currentValue = investmentUsd * multiple;
  return {
    investmentUsd,
    currentValueUsd: currentValue,
    pnlUsd: currentValue - investmentUsd
  };
}

export function computeRankingScore(averageRoiPct: number, winRatePct: number, totalCalls: number) {
  return averageRoiPct * 0.5 + winRatePct * 0.3 + Math.log(totalCalls + 1) * 0.2;
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0.0%";
  const formatted = Math.abs(value) >= 1_000
    ? formatCompact(Math.abs(value), 1, 4)
    : Math.abs(value).toFixed(1);
  return `${value > 0 ? "+" : "-"}${formatted}%`;
}

export function formatCompactPercent(value: number) {
  return formatPercent(value);
}

export function formatCompact(
  value: number,
  maximumFractionDigits = 1,
  maximumSignificantDigits?: number
) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits,
    maximumSignificantDigits,
  }).format(value);
}

export function formatMultiple(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
}

export function formatPrice(value: number | null) {
  if (value === null) return "\u2014";
  if (value === 0) return "$0";

  const abs = Math.abs(value);
  if (abs >= 1) {
    if (abs >= 1_000_000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value);
    }
    return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (abs >= 0.000001) {
    return "$" + new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value);
  }
  return "$" + value.toExponential(3);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatNumber(value: number): string {
  return formatCompact(value);
}
