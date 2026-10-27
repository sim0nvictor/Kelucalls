import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIXED_HORIZONS,
  buildFixedHorizonMeasurements,
  type FixedHorizonCallInput,
} from "../src/lib/historical-measurements";

const calledAt = new Date("2026-10-06T08:00:00.000Z");

function callInput(overrides: Partial<FixedHorizonCallInput> = {}): FixedHorizonCallInput {
  return {
    id: "call-1",
    tokenId: "token-1",
    calledAt: calledAt.toISOString(),
    entryPriceUsd: 10,
    ...overrides,
  };
}

describe("fixed-horizon measurements", () => {
  it("calculates all five horizons from observations at or before each target", () => {
    const observations = [
      { tokenId: "token-1", priceUsd: 10, observedAt: "2026-10-06T08:05:00.000Z" },
      { tokenId: "token-1", priceUsd: 12, observedAt: "2026-10-06T08:15:00.000Z" },
      { tokenId: "token-1", priceUsd: 14, observedAt: "2026-10-06T09:00:00.000Z" },
      { tokenId: "token-1", priceUsd: 18, observedAt: "2026-10-07T08:00:00.000Z" },
      { tokenId: "token-1", priceUsd: 20, observedAt: "2026-10-13T08:00:00.000Z" },
    ];
    const now = new Date("2026-10-13T08:00:00.000Z");

    const measurements = buildFixedHorizonMeasurements([callInput()], observations, { now });

    assert.deepEqual(measurements.map(({ horizonMinutes, status, roiPct }) => ({ horizonMinutes, status, roiPct })), [
      { horizonMinutes: 5, status: "measurable", roiPct: 0 },
      { horizonMinutes: 15, status: "measurable", roiPct: 20 },
      { horizonMinutes: 60, status: "measurable", roiPct: 40 },
      { horizonMinutes: 1440, status: "measurable", roiPct: 80 },
      { horizonMinutes: 10080, status: "measurable", roiPct: 100 },
    ]);
  });

  it("keeps future observations out of the measurement", () => {
    const observations = [
      { tokenId: "token-1", priceUsd: 20, observedAt: "2026-10-06T08:06:00.000Z" },
    ];

    const measurements = buildFixedHorizonMeasurements([callInput()], observations);

    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 5)?.status, "unmeasurable");
    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 5)?.observedAt, null);
  });

  it("distinguishes pending calls from mature calls without observations", () => {
    const now = new Date("2026-10-06T08:01:00.000Z");
    const recent = buildFixedHorizonMeasurements([callInput()], [], { now });
    const mature = buildFixedHorizonMeasurements([
      callInput({ calledAt: new Date("2026-10-06T08:00:00.000Z").toISOString() }),
    ], [], { now: new Date("2026-10-13T08:00:00.000Z") });

    assert.equal(recent.every((measurement) => measurement.status === "pending"), true);
    assert.equal(mature.every((measurement) => measurement.status === "unmeasurable"), true);
    assert.equal(mature.every((measurement) => measurement.observedAt === null), true);
  });

  it("does not calculate a fixed horizon from a missing or invalid entry price", () => {
    const now = new Date("2026-10-13T08:00:00.000Z");
    const measurements = buildFixedHorizonMeasurements([
      callInput({ entryPriceUsd: null }),
    ], [
      { tokenId: "token-1", priceUsd: 20, observedAt: "2026-10-06T08:05:00.000Z" },
    ], { now });

    assert.equal(measurements.every((measurement) => measurement.status === "unmeasurable"), true);
    assert.equal(measurements.every((measurement) => measurement.roiPct === null), true);
  });

  it("uses the newest observation within each horizon and ignores duplicate timestamps", () => {
    const observations = [
      { tokenId: "token-1", priceUsd: 10, observedAt: "2026-10-06T08:05:00.000Z" },
      { tokenId: "token-1", priceUsd: 11, observedAt: "2026-10-06T08:05:00.000Z" },
      { tokenId: "token-1", priceUsd: 12, observedAt: "2026-10-06T08:14:00.000Z" },
    ];

    const measurements = buildFixedHorizonMeasurements([callInput()], observations);

    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 5)?.observedAt, "2026-10-06T08:05:00.000Z");
    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 5)?.roiPct, 0);
    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 15)?.observedAt, "2026-10-06T08:14:00.000Z");
    assert.equal(measurements.find((measurement) => measurement.horizonMinutes === 15)?.roiPct, 20);
  });

  it("defines the exact five requested horizons", () => {
    assert.deepEqual(FIXED_HORIZONS.map(({ minutes }) => minutes), [5, 15, 60, 1440, 10080]);
  });
});
