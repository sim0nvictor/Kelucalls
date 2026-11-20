/**
 * Pure call-performance calculations.
 *
 * A market quote is not a call entry. Without a valid recorded entry price,
 * derived ROI, multiples, win state and simulated PnL must remain unknown.
 */
export function calculateCallPerformance({
  entryPriceUsd,
  currentPriceUsd,
  peakPriceUsd,
  investmentUsd = 10,
}) {
  const entry = Number(entryPriceUsd);
  const current = Number(currentPriceUsd);
  const peak = Number(peakPriceUsd);

  if (
    !Number.isFinite(entry) || entry <= 0 ||
    !Number.isFinite(current) || current <= 0 ||
    !Number.isFinite(peak) || peak <= 0
  ) {
    return {
      currentRoiPct: null,
      peakRoiPct: null,
      currentMultiple: null,
      peakMultiple: null,
      isWin: null,
      hit2x: null,
      hit5x: null,
      hit10x: null,
      hit50x: null,
      hit100x: null,
      simulatedCurrentValueUsd: null,
      simulatedPeakValueUsd: null,
      simulatedCurrentPnlUsd: null,
      simulatedPeakPnlUsd: null,
    };
  }

  const currentMultiple = current / entry;
  const peakMultiple = peak / entry;
  const currentValue = investmentUsd * currentMultiple;
  const peakValue = investmentUsd * peakMultiple;

  return {
    currentRoiPct: ((current - entry) / entry) * 100,
    peakRoiPct: ((peak - entry) / entry) * 100,
    currentMultiple,
    peakMultiple,
    isWin: currentMultiple >= 1,
    hit2x: peakMultiple >= 2,
    hit5x: peakMultiple >= 5,
    hit10x: peakMultiple >= 10,
    hit50x: peakMultiple >= 50,
    hit100x: peakMultiple >= 100,
    simulatedCurrentValueUsd: currentValue,
    simulatedPeakValueUsd: peakValue,
    simulatedCurrentPnlUsd: currentValue - investmentUsd,
    simulatedPeakPnlUsd: peakValue - investmentUsd,
  };
}
