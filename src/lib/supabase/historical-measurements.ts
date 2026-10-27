import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildFixedHorizonMeasurements,
  HISTORICAL_OBSERVATION_TOLERANCE_MS,
  type FixedHorizonCallInput,
  type FixedHorizonMeasurement,
  type HistoricalObservationInput,
} from "../historical-measurements";

export type HistoricalMeasurementCall = FixedHorizonCallInput;

type ObservationRow = {
  token_id: string;
  price_usd: number;
  observed_at: string;
};

export async function getFixedHorizonMeasurements(
  supabase: SupabaseClient,
  calls: readonly HistoricalMeasurementCall[],
): Promise<FixedHorizonMeasurement[]> {
  if (calls.length === 0) return [];

  const now = new Date();
  const latestTarget = Math.max(
    ...calls.map((call) => new Date(call.calledAt).getTime()),
  ) + 7 * 24 * 60 * 60 * 1000;
  const earliestTarget = Math.min(
    ...calls.map((call) => new Date(call.calledAt).getTime()),
  );
  const earliestObservation = new Date(earliestTarget - HISTORICAL_OBSERVATION_TOLERANCE_MS);
  const latestObservation = new Date(Math.min(now.getTime(), latestTarget));
  const tokenIds = [...new Set(calls.map((call) => call.tokenId))];

  const { data, error } = await supabase
    .from("token_price_observations")
    .select("token_id, price_usd, observed_at")
    .in("token_id", tokenIds)
    .gte("observed_at", earliestObservation.toISOString())
    .lte("observed_at", latestObservation.toISOString())
    .order("token_id", { ascending: true })
    .order("observed_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load fixed-horizon observations: ${error.message}`);
  }

  const observations = (data ?? []) as ObservationRow[];
  const observationInputs: HistoricalObservationInput[] = observations.map((row) => ({
    tokenId: row.token_id,
    priceUsd: Number(row.price_usd),
    observedAt: row.observed_at,
  }));

  return buildFixedHorizonMeasurements(calls, observationInputs);
}
