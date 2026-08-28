/**
 * Signal Engine entrypoint.
 *
 * Public surface
 * --------------
 *   runSignalEngine(current, baseline | null, generatedAt)
 *     -> ResearchSignalReport
 *
 * Pure function. Reads the normalized provider snapshots the collectors
 * already produced, runs every registered detector, and returns the
 * combined signal report. No LLM, no I/O, no Date.now() — the
 * `generatedAt` timestamp is supplied by the caller.
 *
 * Detector registry
 * -----------------
 * Each detector is a pure function with the signature
 *   (current, baseline, generatedAt) => ResearchSignal[]
 * The orchestrator calls them in a stable order and concatenates the
 * results, sorting by (score desc, signal_type asc) so the report is
 * stable for snapshot comparison.
 */

import type { DailyResearchSnapshot } from "../types";
import type { ResearchSignal, ResearchSignalReport } from "./types";
import { detectTokenAttention } from "./detectors/token-attention";
import { detectChannelParticipationRising } from "./detectors/channel-participation";
import { detectCallVelocityAnomaly } from "./detectors/call-velocity-anomaly";
import { detectTokenActivityAcceleration } from "./detectors/token-activity";
import { detectMarketSocialDivergence, detectSentimentDivergence } from "./detectors/divergence";
import { detectNarrativeAcceleration } from "./detectors/narrative-acceleration";
import { detectCrossSourceConfirmation } from "./detectors/cross-source-confirmation";

type Detector = (
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
) => ResearchSignal[];

const DETECTORS: ReadonlyArray<Detector> = [
  detectTokenAttention,
  detectChannelParticipationRising,
  detectCallVelocityAnomaly,
  detectTokenActivityAcceleration,
  detectMarketSocialDivergence,
  detectSentimentDivergence,
  detectNarrativeAcceleration,
  detectCrossSourceConfirmation
];

export function runSignalEngine(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignalReport {
  const signals: ResearchSignal[] = [];

  for (const detector of DETECTORS) {
    try {
      const produced = detector(current, baseline, generatedAt);
      signals.push(...produced);
    } catch (error) {
      // Defensive: a single bad input (NaN, etc.) must not poison the
      // whole report. We log the detector name so the failure is
      // traceable but never include the error message in the signal
      // payload.
      const detectorName = detector.name || "anonymous";
      console.warn(`[signal-engine] detector ${detectorName} failed`, {
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Stable sort: highest score first, then signal_type for stable
  // ordering when scores tie.
  signals.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.signal_type.localeCompare(b.signal_type);
  });

  return {
    generatedAt,
    baselineSnapshotDate: baseline?.snapshotDate ?? null,
    signals
  };
}
