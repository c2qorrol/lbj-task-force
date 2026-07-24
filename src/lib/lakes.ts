import { getAllReservoirs, getHistory, getReservoir } from "./twdb";
import { getTexasLakeGages } from "./usgs";
import type { DailyPoint, Reservoir, Trend, UsgsReading } from "./types";

export interface LakeSummary extends Reservoir {
  /** Nearest matching real-time USGS gage, when one exists. */
  gage: UsgsReading | null;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Words that carry no identifying signal when comparing lake to gage names. */
const STOPWORDS = new Set([
  "lake", "lk", "reservoir", "res", "the", "of", "near", "nr", "at", "abv",
  "above", "below", "blw", "tx", "texas", "creek", "ck", "river", "rv", "north",
  "south", "east", "west", "n", "s", "e", "w", "fk", "fork", "lcra", "city",
]);

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function nameOverlap(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/**
 * Pair each TWDB reservoir with a USGS gage.
 *
 * TWDB and USGS use unrelated identifiers and quite different names ("Lake
 * Lyndon B Johnson" vs "LCRA Lk LBJ nr Marble Falls"), so we match on position
 * first and use names only to break ties or to rescue a distant-but-obvious
 * match. TWDB's gauge_location is the dam gage, which is where USGS sites sit,
 * so a tight radius is safe; the wider radius requires a shared name token.
 */
const TIGHT_KM = 8;
const LOOSE_KM = 30;

export function matchGage(
  reservoir: Reservoir,
  gages: UsgsReading[],
): UsgsReading | null {
  if (reservoir.lat === null || reservoir.lon === null) return null;

  let best: { gage: UsgsReading; km: number } | null = null;
  for (const gage of gages) {
    if (gage.lat === null || gage.lon === null) continue;
    const km = haversineKm(reservoir.lat, reservoir.lon, gage.lat, gage.lon);
    if (km > LOOSE_KM) continue;
    if (km > TIGHT_KM && !nameOverlap(reservoir.name, gage.siteName)) continue;
    if (!best || km < best.km) best = { gage, km };
  }
  return best?.gage ?? null;
}

/** Statewide list, each reservoir joined to its real-time gage when available. */
export async function getLakeSummaries(): Promise<LakeSummary[]> {
  const [reservoirs, gages] = await Promise.all([
    getAllReservoirs(),
    getTexasLakeGages().catch(() => [] as UsgsReading[]),
  ]);
  return reservoirs.map((r) => ({ ...r, gage: matchGage(r, gages) }));
}

export interface LakeDetail {
  reservoir: Reservoir;
  gage: UsgsReading | null;
  history: DailyPoint[];
  trend7: Trend;
  trend30: Trend;
}

/** Change over the trailing `days` of daily observations. */
export function computeTrend(history: DailyPoint[], days: number): Trend {
  const withLevel = history.filter((p) => p.waterLevel !== null);
  if (withLevel.length < 2) {
    return { direction: "unknown", change: null, percentChange: null, windowDays: days };
  }

  const latest = withLevel.at(-1)!;
  const cutoff = new Date(latest.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  // Oldest point still inside the window, falling back to the series start
  // when the history is shorter than the requested window.
  const inWindow = withLevel.filter((p) => new Date(p.date) >= cutoff);
  const earliest = inWindow.length >= 2 ? inWindow[0] : withLevel[0];

  const change = latest.waterLevel! - earliest.waterLevel!;
  const percentChange =
    latest.percentFull !== null && earliest.percentFull !== null
      ? latest.percentFull - earliest.percentFull
      : null;

  // A tenth of a foot is inside the noise band of a reservoir stage gage.
  const direction = change > 0.1 ? "rising" : change < -0.1 ? "falling" : "steady";
  return { direction, change, percentChange, windowDays: days };
}

export async function getLakeDetail(slug: string): Promise<LakeDetail | null> {
  const reservoir = await getReservoir(slug);
  if (!reservoir) return null;

  const [history, gages] = await Promise.all([
    getHistory(slug, "1year").catch(() => [] as DailyPoint[]),
    getTexasLakeGages().catch(() => [] as UsgsReading[]),
  ]);

  return {
    reservoir,
    gage: matchGage(reservoir, gages),
    history,
    trend7: computeTrend(history, 7),
    trend30: computeTrend(history, 30),
  };
}

export interface StatewideStats {
  count: number;
  /** Storage-weighted statewide fill, which is the figure TWDB headlines. */
  percentFull: number;
  totalStorage: number;
  totalCapacity: number;
  full: number;
  low: number;
  critical: number;
  asOf: string;
}

/**
 * Aggregate over a set of reservoirs.
 *
 * Non-Texas reservoirs are excluded from the totals to match TWDB's own
 * statewide accounting. This is not cosmetic: Elephant Butte sits in New Mexico
 * with 1.96 million acre-feet of capacity and is currently around 2% full, so
 * including it pulled the statewide figure to 73.8% against TWDB's published
 * 78.3%. Filtering on the `texas` tag reproduces their number exactly. Such
 * reservoirs are still listed and browsable — they just don't count as Texas
 * supply.
 */
export function summarize(lakes: Reservoir[]): StatewideStats {
  let totalStorage = 0;
  let totalCapacity = 0;
  let full = 0;
  let low = 0;
  let critical = 0;
  let counted = 0;

  for (const l of lakes) {
    if (!l.isTexas) continue;
    counted++;
    if (l.conservationStorage !== null) totalStorage += l.conservationStorage;
    if (l.conservationCapacity !== null) totalCapacity += l.conservationCapacity;
    if (l.percentFull === null) continue;
    if (l.percentFull >= 95) full++;
    else if (l.percentFull < 25) critical++;
    else if (l.percentFull < 50) low++;
  }

  const asOf = lakes.map((l) => l.date).sort().at(-1) ?? "";
  return {
    count: counted,
    percentFull: totalCapacity > 0 ? (totalStorage / totalCapacity) * 100 : 0,
    totalStorage,
    totalCapacity,
    full,
    low,
    critical,
    asOf,
  };
}

export function groupBy(
  lakes: LakeSummary[],
  key: "basin" | "region" | "climate",
): { name: string; lakes: LakeSummary[]; stats: StatewideStats }[] {
  const groups = new Map<string, LakeSummary[]>();
  for (const l of lakes) {
    const name = l[key] ?? "Unclassified";
    const bucket = groups.get(name);
    if (bucket) bucket.push(l);
    else groups.set(name, [l]);
  }
  return [...groups.entries()]
    .map(([name, group]) => ({ name, lakes: group, stats: summarize(group) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
