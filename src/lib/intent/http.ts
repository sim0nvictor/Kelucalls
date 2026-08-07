/**
 * Shared JSON response helper for the KeluScore API routes.
 *
 * Mirrors the headers already used by src/app/api/tokens/live/route.ts so the
 * new endpoints behave identically to the existing ones. Defined once here
 * rather than copied into each route.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0"
    }
  });
}

const VALID_GRADES = ["A", "B", "C", "D"] as const;

export type ParsedGrade = (typeof VALID_GRADES)[number] | null;

/** Accepts a grade query param, case-insensitively. Anything else is null. */
export function parseGrade(value: string | null): ParsedGrade {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  const match = VALID_GRADES.find((grade) => grade === upper);
  return match ?? null;
}

/** Parses a numeric query param, returning undefined when absent or invalid. */
export function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
