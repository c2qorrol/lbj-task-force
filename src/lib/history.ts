import { unstable_cache } from "next/cache";
import { getHistory, getStatewideHistory } from "./twdb";
import { siteUrl } from "./og";
import type { DailyPoint } from "./types";

/**
 * Historical context from TWDB's full period of record — 86 years of daily
 * observations for the older reservoirs (Travis starts 1940-09-30, ~30,600 rows).
 *
 * This is what separates "Lake Travis is 62% full" from "Lake Travis is lower on
 * this date than 78% of years since 1940, and was last this low in 2015".
 */

/** Days either side of the target date pooled into one comparison sample. */
const WINDOW_DAYS = 3;

export interface DayStats {
  /** Calendar day key, MM-DD. */
  day: string;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  count: number;
}

export interface HistoricalContext {
  firstDate: string;
  lastDate: string;
  yearsOfRecord: number;
  /** Current percent full, repeated here so the UI has one source. */
  current: number | null;
  /** 0–100: share of same-date historical readings below the current one. */
  percentile: number | null;
  /** How many historical readings the percentile is based on. */
  sampleCount: number;
  /** Typical range for this date, from the pooled window. */
  normal: DayStats | null;
  recordLow: { value: number; date: string } | null;
  recordHigh: { value: number; date: string } | null;
  /** Most recent earlier year that was at or below today's level, on this date. */
  lastLowerYear: number | null;
  /** Most recent earlier year that was at or above today's level, on this date. */
  lastHigherYear: number | null;
}

/** Per-calendar-day percentile bands, for drawing a normal range behind a chart. */
export type DayStatsByDay = Record<string, DayStats>;

function dayKey(date: string): string {
  return date.slice(5, 10);
}

/** Day-of-year index, ignoring leap years — only used for window proximity. */
function dayOfYear(day: string): number {
  const [m, d] = day.split("-").map(Number);
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cumulative[m - 1] + d;
}

/** Percentile of a pre-sorted ascending array, by linear interpolation. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

function summarize(day: string, values: number[]): DayStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    day,
    min: sorted[0],
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

/**
 * Pool each calendar day with the ±3 days around it before computing bands.
 *
 * A single calendar day only has one reading per year — about 86 samples at
 * best, and far fewer for newer reservoirs — which makes the tails very noisy.
 * Widening to a 7-day window multiplies the sample without meaningfully
 * smoothing seasonal signal, since reservoir levels move slowly.
 */
export function computeDayStats(history: DailyPoint[]): DayStatsByDay {
  const byDay = new Map<string, number[]>();
  for (const point of history) {
    if (point.percentFull === null) continue;
    const key = dayKey(point.date);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(point.percentFull);
    else byDay.set(key, [point.percentFull]);
  }

  const days = [...byDay.keys()];
  const stats: DayStatsByDay = {};
  for (const day of days) {
    const target = dayOfYear(day);
    const pooled: number[] = [];
    for (const other of days) {
      // Wrap around the year end so 12-31 still pools with 01-01.
      const raw = Math.abs(dayOfYear(other) - target);
      const distance = Math.min(raw, 365 - raw);
      if (distance <= WINDOW_DAYS) pooled.push(...byDay.get(other)!);
    }
    if (pooled.length > 0) stats[day] = summarize(day, pooled);
  }
  return stats;
}

/** Readings from the ±window around a calendar day, tagged with their year. */
function pooledForDay(history: DailyPoint[], day: string) {
  const target = dayOfYear(day);
  const out: { year: number; value: number; date: string }[] = [];
  for (const point of history) {
    if (point.percentFull === null) continue;
    const raw = Math.abs(dayOfYear(dayKey(point.date)) - target);
    const distance = Math.min(raw, 365 - raw);
    if (distance <= WINDOW_DAYS) {
      out.push({
        year: Number(point.date.slice(0, 4)),
        value: point.percentFull,
        date: point.date,
      });
    }
  }
  return out;
}

export function computeContext(
  history: DailyPoint[],
  /** Pass the precomputed bands to avoid recomputing them per call. */
  precomputed?: DayStatsByDay,
): HistoricalContext | null {
  const usable = history.filter((p) => p.percentFull !== null);
  if (usable.length < 365) return null;

  const latest = usable[usable.length - 1];
  const firstDate = usable[0].date;
  const lastDate = latest.date;
  const current = latest.percentFull;
  const currentYear = Number(lastDate.slice(0, 4));

  const pooled = pooledForDay(usable, dayKey(lastDate));
  // Exclude the current year so "last time it was this low" can't answer
  // "yesterday" — the question is about other years, not this drawdown.
  const priorYears = pooled.filter((p) => p.year !== currentYear);

  let percentile: number | null = null;
  if (current !== null && priorYears.length > 0) {
    const below = priorYears.filter((p) => p.value < current).length;
    percentile = (below / priorYears.length) * 100;
  }

  let recordLow: { value: number; date: string } | null = null;
  let recordHigh: { value: number; date: string } | null = null;
  for (const entry of pooled) {
    if (!recordLow || entry.value < recordLow.value) {
      recordLow = { value: entry.value, date: entry.date };
    }
    if (!recordHigh || entry.value > recordHigh.value) {
      recordHigh = { value: entry.value, date: entry.date };
    }
  }

  let lastLowerYear: number | null = null;
  let lastHigherYear: number | null = null;
  if (current !== null) {
    for (const entry of priorYears) {
      if (entry.value <= current && (lastLowerYear === null || entry.year > lastLowerYear)) {
        lastLowerYear = entry.year;
      }
      if (entry.value >= current && (lastHigherYear === null || entry.year > lastHigherYear)) {
        lastHigherYear = entry.year;
      }
    }
  }

  const stats = precomputed ?? computeDayStats(usable);

  return {
    firstDate,
    lastDate,
    yearsOfRecord: currentYear - Number(firstDate.slice(0, 4)),
    current,
    percentile,
    sampleCount: priorYears.length,
    normal: stats[dayKey(lastDate)] ?? null,
    recordLow,
    recordHigh,
    lastLowerYear,
    lastHigherYear,
  };
}

export interface HistoricalBundle {
  context: HistoricalContext;
  dayStats: DayStatsByDay;
}

/**
 * In-process memo for computed statistics.
 *
 * The full-history CSV is ~1.9 MB, which is close enough to Next's per-entry
 * data-cache ceiling that we cannot rely on the fetch itself staying cached —
 * and re-pulling it per request would be both slow and exactly the burst
 * behaviour TWDB throttles. Caching the *derived* statistics instead keeps only
 * a few KB per lake in memory, and Fluid Compute reuses instances so the hit
 * rate is high in practice.
 */
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const memo = new Map<string, { at: number; value: HistoricalBundle | null }>();

const DAY_MS = 86_400_000;

interface PrecomputedSeries {
  /** Date of index 0, YYYY-MM-DD. */
  first: string;
  /** Percent full in tenths, indexed by days since `first`; null where absent. */
  values: (number | null)[];
}

/**
 * Load the precomputed period-of-record series, generated by
 * `npm run sync:history` and served as a static asset from the edge.
 *
 * This is the whole point of precomputing: the equivalent TWDB CSV is ~1.9 MB
 * across ~30,600 eight-column rows, and parsing it per request cost 10–30 s on
 * a cold Worker isolate. Returns null if the asset is missing, so the CSV path
 * below still works for a reservoir that has not been precomputed yet.
 */
async function loadPrecomputedSeries(slug: string): Promise<DailyPoint[] | null> {
  try {
    const res = await fetch(`${siteUrl()}/history/${slug}.json`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;

    const { first, values } = (await res.json()) as PrecomputedSeries;
    const start = Date.parse(`${first}T00:00:00Z`);
    if (!Number.isFinite(start) || !Array.isArray(values)) return null;

    const points: DailyPoint[] = [];
    for (let i = 0; i < values.length; i++) {
      const tenths = values[i];
      if (tenths === null) continue;
      points.push({
        date: new Date(start + i * DAY_MS).toISOString().slice(0, 10),
        waterLevel: null,
        surfaceArea: null,
        storage: null,
        conservationStorage: null,
        percentFull: tenths / 10,
        conservationCapacity: null,
      });
    }
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

/** Merge two ascending series, preferring `recent` where dates collide. */
function mergeByDate(base: DailyPoint[], recent: DailyPoint[]): DailyPoint[] {
  const byDate = new Map(base.map((p) => [p.date, p]));
  for (const point of recent) byDate.set(point.date, point);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Assemble the full series for a reservoir.
 *
 * Precomputed data is frozen at whenever `sync:history` last ran, so the small
 * 30-day CSV (a few KB) is layered on top to carry the series up to today.
 * Without that the "current" reading used for percentile comparisons would be
 * however stale the last precompute was.
 */
async function loadSeries(slug: string): Promise<DailyPoint[]> {
  const precomputed = await loadPrecomputedSeries(slug);
  if (!precomputed) return getHistory(slug, "all");

  const recent = await getHistory(slug, "30day").catch(() => [] as DailyPoint[]);
  return recent.length > 0 ? mergeByDate(precomputed, recent) : precomputed;
}

async function deriveHistoricalBundle(
  slug: string,
): Promise<HistoricalBundle | null> {
  try {
    const full = await loadSeries(slug);
    const dayStats = computeDayStats(full);
    const context = computeContext(full, dayStats);
    return context ? { context, dayStats } : null;
  } catch {
    // Period-of-record data is enrichment; the lake page must still render.
    return null;
  }
}

/**
 * Persistent cache for the *derived* bundle (tens of KB), not the CSV.
 *
 * The in-process memo below is only an L1: on Cloudflare Workers each isolate
 * is short-lived and gets its own memory, so almost every request missed it and
 * paid the full download-and-parse. Measured on the deployed Worker that was
 * 28–39 s per lake page. `unstable_cache` persists the result through the
 * incremental cache (Workers KV in production), so the expensive path runs once
 * per revalidate window across all isolates instead of once per request.
 */
const cachedHistoricalBundle = unstable_cache(
  deriveHistoricalBundle,
  ["lake-historical-context-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: ["lake-history"] },
);

export async function getHistoricalContext(
  slug: string,
): Promise<HistoricalBundle | null> {
  const hit = memo.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const bundle = await cachedHistoricalBundle(slug);
  memo.set(slug, { at: Date.now(), value: bundle });
  return bundle;
}

export interface StatewideHistoryBundle extends HistoricalBundle {
  /** Daily statewide series, for charting against drought coverage. */
  series: { date: string; percentFull: number; conservationStorage: number | null }[];
}

const STATEWIDE_KEY = "__statewide__";
const statewideMemo = new Map<
  string,
  { at: number; value: StatewideHistoryBundle | null }
>();

/**
 * Statewide storage with the same percentile treatment as an individual lake.
 *
 * Uses the same in-process memo as per-lake history and for the same reason:
 * the source CSV is ~1.4 MB, too large to rely on Next's data cache holding it.
 */
export async function getStatewideHistoryContext(): Promise<StatewideHistoryBundle | null> {
  const hit = statewideMemo.get(STATEWIDE_KEY);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let bundle: StatewideHistoryBundle | null = null;
  try {
    const full = await getStatewideHistory();
    const dayStats = computeDayStats(full);
    const context = computeContext(full, dayStats);
    if (context) {
      bundle = {
        context,
        dayStats,
        series: full
          .filter((p) => p.percentFull !== null)
          .map((p) => ({
            date: p.date,
            percentFull: p.percentFull as number,
            conservationStorage: p.conservationStorage,
          })),
      };
    }
  } catch {
    bundle = null;
  }

  statewideMemo.set(STATEWIDE_KEY, { at: Date.now(), value: bundle });
  return bundle;
}

/**
 * Years whose conditions on this date most closely resembled today's, as a
 * plain-language analog ("today looks most like 2013"). Compares the full
 * ±3-day pooled reading, so it reflects the season rather than a single day.
 */
export function findAnalogYears(
  history: DailyPoint[],
  limit = 3,
): { year: number; value: number; delta: number }[] {
  const usable = history.filter((p) => p.percentFull !== null);
  if (usable.length === 0) return [];

  const latest = usable[usable.length - 1];
  const currentYear = Number(latest.date.slice(0, 4));
  const current = latest.percentFull as number;

  const byYear = new Map<number, number>();
  for (const entry of pooledForDay(usable, dayKey(latest.date))) {
    if (entry.year === currentYear) continue;
    // Keep the reading closest to today's value within each year.
    const existing = byYear.get(entry.year);
    if (
      existing === undefined ||
      Math.abs(entry.value - current) < Math.abs(existing - current)
    ) {
      byYear.set(entry.year, entry.value);
    }
  }

  return [...byYear.entries()]
    .map(([year, value]) => ({ year, value, delta: value - current }))
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
    .slice(0, limit);
}
