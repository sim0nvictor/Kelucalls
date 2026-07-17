import { getSimulatedInvestmentPerCall } from "@/lib/server-env";

export function toNumber(value: unknown, fallback = 0) {
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
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatMultiple(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
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
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}
