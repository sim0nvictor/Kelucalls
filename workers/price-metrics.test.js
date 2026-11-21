import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateCallPerformance } from "./price-metrics.js";

test("returns unknown performance when the call has no recorded entry price", () => {
  const result = calculateCallPerformance({
    entryPriceUsd: null,
    currentPriceUsd: 0.00002,
    peakPriceUsd: 0.00003,
  });

  assert.equal(result.currentRoiPct, null);
  assert.equal(result.peakRoiPct, null);
  assert.equal(result.currentMultiple, null);
  assert.equal(result.peakMultiple, null);
  assert.equal(result.isWin, null);
  assert.equal(result.simulatedCurrentPnlUsd, null);
});

test("calculates current and peak ROI from the recorded entry price", () => {
  const result = calculateCallPerformance({
    entryPriceUsd: 0.00001,
    currentPriceUsd: 0.000015,
    peakPriceUsd: 0.00002,
    investmentUsd: 10,
  });

  assert.ok(Math.abs(result.currentRoiPct - 50) < 1e-9);
  assert.ok(Math.abs(result.peakRoiPct - 100) < 1e-9);
  assert.equal(result.currentMultiple, 1.5);
  assert.equal(result.peakMultiple, 2);
  assert.equal(result.isWin, true);
  assert.equal(result.hit2x, true);
  assert.equal(result.simulatedCurrentValueUsd, 15);
  assert.equal(result.simulatedCurrentPnlUsd, 5);
});

test("rejects zero or invalid prices instead of generating fake ROI", () => {
  const result = calculateCallPerformance({
    entryPriceUsd: 0,
    currentPriceUsd: 1,
    peakPriceUsd: 1,
  });

  assert.equal(result.currentRoiPct, null);
  assert.equal(result.peakRoiPct, null);
  assert.equal(result.currentMultiple, null);
});
