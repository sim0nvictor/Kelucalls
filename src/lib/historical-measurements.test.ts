import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFixedHorizonMeasurements } from "./historical-measurements";

test("historical measurement helper preserves pending and unmeasurable states", () => {
  const calledAt = new Date("2026-10-06T08:00:00.000Z");
  const now = new Date("2026-10-06T08:01:00.000Z");
  const recent = buildFixedHorizonMeasurements([
    { id: "recent", tokenId: "token-1", calledAt: calledAt.toISOString(), entryPriceUsd: 10 },
  ], [], { now });

  assert.equal(recent.every((measurement) => measurement.status === "pending"), true);
  assert.equal(recent.every((measurement) => measurement.roiPct === null), true);

  const matureNow = new Date("2026-10-13T08:00:00.000Z");
  const mature = buildFixedHorizonMeasurements([
    { id: "mature", tokenId: "token-1", calledAt: new Date("2026-10-06T08:00:00.000Z").toISOString(), entryPriceUsd: 10 },
  ], [], { now: matureNow });

  assert.equal(mature.every((measurement) => measurement.status === "unmeasurable"), true);
});

test("historical measurement helper rejects forward-looking observations", () => {
  const calledAt = new Date("2026-10-06T08:00:00.000Z");
  const now = new Date("2026-10-06T08:10:00.000Z");
  const measurements = buildFixedHorizonMeasurements([
    { id: "call-1", tokenId: "token-1", calledAt: calledAt.toISOString(), entryPriceUsd: 10 },
  ], [
    { tokenId: "token-1", priceUsd: 20, observedAt: new Date("2026-10-06T08:06:00.000Z").toISOString() },
  ], { now });

  assert.equal(measurements.find((measurement) => measurement.label === "T+5m")?.status, "unmeasurable");
});
