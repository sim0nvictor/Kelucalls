export type FixedHorizon = {
  minutes: number;
  label: "T+5m" | "T+15m" | "T+1h" | "T+24h" | "T+7d";
};

export const FIXED_HORIZONS: readonly FixedHorizon[] = [
  { minutes: 5, label: "T+5m" },
  { minutes: 15, label: "T+15m" },
  { minutes: 60, label: "T+1h" },
  { minutes: 1440, label: "T+24h" },
  { minutes: 10080, label: "T+7d" },
] as const;

export type FixedHorizonCallInput = {
  id: string;
  tokenId: string;
  calledAt: string;
  entryPriceUsd: number | null;
};

export type HistoricalObservationInput = {
  tokenId: string;
  priceUsd: number;
  observedAt: string;
};

export type FixedHorizonMeasurementStatus = "pending" | "measurable" | "unmeasurable";

export type FixedHorizonMeasurement = {
  callId: string;
  horizonMinutes: number;
  label: FixedHorizon["label"];
  status: FixedHorizonMeasurementStatus;
  observedAt: string | null;
  priceUsd: number | null;
  entryPriceUsd: number | null;
  roiPct: number | null;
  targetAt: string;
};

export type FixedHorizonMeasurementContext = {
  now?: Date;
};

export const HISTORICAL_OBSERVATION_TOLERANCE_MS = 5 * 60_000;

function asTimestamp(value: string | Date): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function toUtcIso(value: Date): string {
  return value.toISOString();
}

function measurementStatus(
  call: FixedHorizonCallInput,
  horizon: FixedHorizon,
  observation: HistoricalObservationInput | null,
  now: Date,
): FixedHorizonMeasurementStatus {
  const calledAt = asTimestamp(call.calledAt);
  const targetAt = calledAt + horizon.minutes * 60_000;
  const entryPrice = Number(call.entryPriceUsd);

  if (targetAt > now.getTime()) return "pending";
  if (!observation || !Number.isFinite(entryPrice) || entryPrice <= 0) return "unmeasurable";
  return "measurable";
}

export function buildFixedHorizonMeasurements(
  calls: readonly FixedHorizonCallInput[],
  observations: readonly HistoricalObservationInput[],
  context: FixedHorizonMeasurementContext = {},
): FixedHorizonMeasurement[] {
  const now = context.now ?? new Date();
  const observationsByToken = new Map<string, HistoricalObservationInput[]>();

  for (const observation of observations) {
    const tokenObservations = observationsByToken.get(observation.tokenId) ?? [];
    tokenObservations.push(observation);
    observationsByToken.set(observation.tokenId, tokenObservations);
  }

  return calls.flatMap((call) => FIXED_HORIZONS.map((horizon) => {
    const calledAt = asTimestamp(call.calledAt);
    const targetAt = calledAt + horizon.minutes * 60_000;
    const targetTimestamp = new Date(targetAt);
    const tokenObservations = observationsByToken.get(call.tokenId) ?? [];
    const observation = tokenObservations
      .filter((candidate) => {
        const candidateTimestamp = asTimestamp(candidate.observedAt);
        return candidateTimestamp <= targetAt && candidateTimestamp >= targetAt - HISTORICAL_OBSERVATION_TOLERANCE_MS;
      })
      .sort((left, right) => asTimestamp(right.observedAt) - asTimestamp(left.observedAt))[0] ?? null;

    const status = measurementStatus(call, horizon, observation, now);
    const entryPrice = Number(call.entryPriceUsd);
    const price = observation ? Number(observation.priceUsd) : null;
    const roiPct = status === "measurable" && Number.isFinite(entryPrice) && entryPrice > 0 && price !== null && Number.isFinite(price) && price > 0
      ? ((price - entryPrice) / entryPrice) * 100
      : null;

    return {
      callId: call.id,
      horizonMinutes: horizon.minutes,
      label: horizon.label,
      status,
      observedAt: observation?.observedAt ?? null,
      priceUsd: observation?.priceUsd ?? null,
      entryPriceUsd: call.entryPriceUsd,
      roiPct,
      targetAt: toUtcIso(targetTimestamp),
    };
  }));
}
