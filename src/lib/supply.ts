import type { DailyPoint } from "./types";

/**
 * How long remaining storage lasts if the recent drawdown rate continues.
 *
 * This is a plain extrapolation, not a forecast. It answers "if the last N days
 * repeated indefinitely, when would the conservation pool empty?" — useful as a
 * severity signal, but it ignores seasonality, rainfall, managed releases, and
 * the fact that drawdown usually slows as a reservoir falls.
 */

export interface SupplyOutlook {
  /** Mean change in conservation storage, acre-feet per day (negative = falling). */
  acreFeetPerDay: number;
  /** Mean change in percent-full points per day. */
  pointsPerDay: number;
  /** Days until conservation storage reaches zero, if the rate holds. */
  daysRemaining: number | null;
  /** Days used to measure the rate. */
  windowDays: number;
  /** True when storage rose over the window, so no depletion date applies. */
  refilling: boolean;
}

/**
 * A 60-day window: long enough that a single rain event or release doesn't
 * dominate, short enough to reflect current conditions rather than last season.
 */
const WINDOW_DAYS = 60;

/** Below this, the trend is indistinguishable from measurement noise. */
const MIN_RATE_AF_PER_DAY = 1;

export function computeSupplyOutlook(
  history: DailyPoint[],
  windowDays = WINDOW_DAYS,
): SupplyOutlook | null {
  const usable = history.filter((p) => p.conservationStorage !== null);
  if (usable.length < 14) return null;

  const latest = usable[usable.length - 1];
  const cutoff = new Date(`${latest.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const inWindow = usable.filter((p) => p.date >= cutoffIso);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const elapsedDays =
    (Date.parse(latest.date) - Date.parse(first.date)) / 86_400_000;
  if (elapsedDays <= 0) return null;

  const storageChange =
    (latest.conservationStorage as number) - (first.conservationStorage as number);
  const acreFeetPerDay = storageChange / elapsedDays;

  const pointsPerDay =
    latest.percentFull !== null && first.percentFull !== null
      ? (latest.percentFull - first.percentFull) / elapsedDays
      : 0;

  const refilling = acreFeetPerDay >= 0;
  const falling = acreFeetPerDay < -MIN_RATE_AF_PER_DAY;

  return {
    acreFeetPerDay,
    pointsPerDay,
    daysRemaining: falling
      ? Math.max(0, (latest.conservationStorage as number) / -acreFeetPerDay)
      : null,
    windowDays: Math.round(elapsedDays),
    refilling,
  };
}

/** Plain-language summary for the UI. */
export function describeOutlook(outlook: SupplyOutlook): string {
  if (outlook.refilling) {
    return `Storage rose over the past ${outlook.windowDays} days, gaining about ${Math.round(outlook.acreFeetPerDay).toLocaleString("en-US")} acre-feet per day.`;
  }
  if (outlook.daysRemaining === null) {
    return `Storage has been essentially flat over the past ${outlook.windowDays} days.`;
  }
  const years = outlook.daysRemaining / 365;
  const horizon =
    years >= 2
      ? `about ${years.toFixed(1)} years`
      : `about ${Math.round(outlook.daysRemaining)} days`;
  return `Falling roughly ${Math.abs(Math.round(outlook.acreFeetPerDay)).toLocaleString("en-US")} acre-feet per day. At that rate the conservation pool would be exhausted in ${horizon}.`;
}
