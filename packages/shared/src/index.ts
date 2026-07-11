export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
}

export function compactAddress(value: string | null | undefined): string {
  if (!value) return "n/a";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function splitCommandArgs(text: string | undefined): string[] {
  return (text ?? "")
    .trim()
    .split(/\s+/)
    .slice(1)
    .filter(Boolean);
}
