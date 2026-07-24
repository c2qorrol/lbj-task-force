import table from "@/data/flow-percentiles.json";
import type { FlowClass } from "./flowclass";

/**
 * Places a discharge reading against the gage's own period-of-record normals
 * for the current month, using precomputed monthly thresholds (see
 * scripts/sync-flow-percentiles.mjs) since USGS retired the WaterWatch service
 * that used to answer this directly.
 *
 * Server-side only: the thresholds table is ~350 KB and must stay out of
 * client bundles — components take the classification as data.
 */

/** [p10, p25, p50, p75, p90] per month, null where the record is too thin. */
type MonthlyThresholds = (number[] | null)[];

const TABLE = table as Record<string, MonthlyThresholds>;

const BOUNDS = [10, 25, 50, 75, 90];

export interface FlowPercentile {
  cls: FlowClass;
  /** Rough percentile, interpolated between the stored thresholds. */
  pct: number;
}

/**
 * Classify a current reading against the site's normals for `date`'s month.
 * Null when the site has no usable record — new gages, and the handful whose
 * statistics fail the 10-year screen.
 */
export function classifyFlow(
  siteId: string,
  flowCfs: number | null,
  date: Date,
): FlowPercentile | null {
  if (flowCfs === null) return null;
  const thresholds = TABLE[siteId]?.[date.getUTCMonth()];
  if (!thresholds) return null;

  const [p10, p25, , p75, p90] = thresholds;
  const cls: FlowClass =
    flowCfs < p10
      ? "much-below"
      : flowCfs < p25
        ? "below"
        : flowCfs <= p75
          ? "normal"
          : flowCfs <= p90
            ? "above"
            : "much-above";

  // Piecewise-linear percentile estimate across the five known points,
  // clamped to 1–99: the tails beyond p10/p90 are unbounded.
  let pct: number;
  if (flowCfs <= thresholds[0]) pct = 10 * (flowCfs / Math.max(thresholds[0], 1e-9));
  else if (flowCfs >= thresholds[4]) pct = 99;
  else {
    pct = 99;
    for (let i = 1; i < thresholds.length; i++) {
      if (flowCfs <= thresholds[i]) {
        const lo = thresholds[i - 1];
        const hi = thresholds[i];
        const frac = hi > lo ? (flowCfs - lo) / (hi - lo) : 0;
        pct = BOUNDS[i - 1] + frac * (BOUNDS[i] - BOUNDS[i - 1]);
        break;
      }
    }
  }
  return { cls, pct: Math.min(99, Math.max(1, Math.round(pct))) };
}
