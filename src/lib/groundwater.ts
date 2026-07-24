/**
 * TWDB groundwater monitoring — 400-odd recorder wells across 24 aquifers.
 *
 * IMPORTANT: levels are **feet below land surface**. A larger number means the
 * water table is deeper, so an increase is a decline in groundwater. Every
 * comparison and label in this module and its UI has to invert accordingly.
 */

import { unstable_cache } from "next/cache";

const BASE = "https://www.waterdatafortexas.org/groundwater";
const UA = "tx-lake-monitor";
const DAILY = 60 * 60 * 6;
const HISTORY_TTL_SECONDS = 12 * 60 * 60;
const HISTORY_TTL_MS = HISTORY_TTL_SECONDS * 1000;

export interface Well {
  number: string;
  aquifer: string;
  aquiferType: string | null;
  county: string | null;
  entity: string | null;
  status: string | null;
  lat: number;
  lon: number;
}

export interface WellCurrent extends Well {
  /** Depth to water, feet below land surface. */
  depthFt: number;
  date: string;
  /** Age of the reading in days — many wells report only sporadically. */
  ageDays: number;
}

interface RecentConditions {
  values: {
    date: string;
    state_well_number: string;
    "daily_high_water_level(ft below land surface)": number | null;
  }[];
}

interface WellFeature {
  properties: {
    well_number: string;
    aquifer?: string;
    aquifer_type?: string;
    county?: string;
    entity?: string;
    status?: string;
  };
  geometry: { coordinates: [number, number] };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: DAILY },
  });
  if (!res.ok) throw new Error(`TWDB groundwater ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function daysSince(date: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(date)) / 86_400_000));
}

/**
 * Current level for every well that has both a location and a reading.
 *
 * The two feeds disagree slightly — 425 wells report levels but only 401 have
 * published locations — so the join drops the unlocatable remainder rather than
 * placing them arbitrarily.
 */
export async function getWells(): Promise<WellCurrent[]> {
  const [conditions, geo] = await Promise.all([
    fetchJson<RecentConditions>(`${BASE}/recent-conditions.json`),
    fetchJson<{ features: WellFeature[] }>(`${BASE}/wells.geojson`),
  ]);

  const meta = new Map<string, Well>();
  for (const feature of geo.features) {
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    if (!p.well_number || lat === undefined || lon === undefined) continue;
    meta.set(p.well_number, {
      number: p.well_number,
      aquifer: p.aquifer || "Other",
      aquiferType: p.aquifer_type ?? null,
      county: p.county ?? null,
      entity: p.entity ?? null,
      status: p.status ?? null,
      lat,
      lon,
    });
  }

  const out: WellCurrent[] = [];
  for (const value of conditions.values ?? []) {
    const depth = value["daily_high_water_level(ft below land surface)"];
    const base = meta.get(value.state_well_number);
    if (!base || depth === null || !Number.isFinite(depth)) continue;
    out.push({
      ...base,
      depthFt: depth,
      date: value.date,
      ageDays: daysSince(value.date),
    });
  }

  return out.sort((a, b) => a.aquifer.localeCompare(b.aquifer) || a.number.localeCompare(b.number));
}

/**
 * Wells whose newest reading is genuinely recent.
 *
 * The "recent conditions" feed returns each well's *latest* value regardless of
 * age, and roughly a third of those are over a year old — some go back to 2008.
 * Presenting those as current conditions would be plainly misleading.
 */
export const FRESH_DAYS = 30;

export function freshWells(wells: WellCurrent[], maxAgeDays = FRESH_DAYS) {
  return wells.filter((w) => w.ageDays <= maxAgeDays);
}

export interface AquiferSummary {
  aquifer: string;
  wells: number;
  freshWells: number;
  medianDepthFt: number | null;
  minDepthFt: number | null;
  maxDepthFt: number | null;
  counties: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function summarizeAquifers(wells: WellCurrent[]): AquiferSummary[] {
  const groups = new Map<string, WellCurrent[]>();
  for (const well of wells) {
    const bucket = groups.get(well.aquifer);
    if (bucket) bucket.push(well);
    else groups.set(well.aquifer, [well]);
  }

  return [...groups.entries()]
    .map(([aquifer, group]) => {
      const fresh = freshWells(group);
      const depths = fresh.map((w) => w.depthFt);
      return {
        aquifer,
        wells: group.length,
        freshWells: fresh.length,
        medianDepthFt: median(depths),
        minDepthFt: depths.length ? Math.min(...depths) : null,
        maxDepthFt: depths.length ? Math.max(...depths) : null,
        counties: new Set(group.map((w) => w.county).filter(Boolean)).size,
      };
    })
    .sort((a, b) => b.wells - a.wells);
}

/* ------------------------------------------------------------------ */
/* Per-well history                                                    */
/* ------------------------------------------------------------------ */

export interface WellHistoryPoint {
  date: string;
  depthFt: number;
}

export interface WellHistory {
  number: string;
  points: WellHistoryPoint[];
  firstDate: string;
  lastDate: string;
  /** Change over the trailing year, feet. Positive = water table fell. */
  yearChangeFt: number | null;
  /** Change over the full record, feet. Positive = water table fell. */
  recordChangeFt: number | null;
  shallowest: WellHistoryPoint | null;
  deepest: WellHistoryPoint | null;
}

const historyMemo = new Map<string, { at: number; value: WellHistory | null }>();

/**
 * Daily history for one well.
 *
 * TWDB serves the full hourly record with no date filtering — over 100,000 rows
 * and ~5 MB for a long-running well — so this reduces to one reading per day.
 * Rows arrive newest-first.
 */
async function deriveWellHistory(number: string): Promise<WellHistory | null> {
  let history: WellHistory | null = null;
  try {
    const res = await fetch(`${BASE}/well/${encodeURIComponent(number)}.csv`, {
      headers: { "User-Agent": UA },
      // Far larger than Next's per-entry data cache will hold, so don't ask it to.
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();

    const lines = text.split("\n");
    const byDay = new Map<string, number>();
    let header: string[] | null = null;
    let levelIndex = -1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      if (!header) {
        header = trimmed.split(",").map((h) => h.trim());
        levelIndex = header.findIndex((h) => h.startsWith("water_level"));
        continue;
      }
      const cells = trimmed.split(",");
      const day = cells[0]?.slice(0, 10);
      const value = Number(cells[levelIndex]);
      if (!day || !Number.isFinite(value)) continue;
      // Rows are newest-first, so the first value seen for a day wins.
      if (!byDay.has(day)) byDay.set(day, value);
    }

    const points = [...byDay.entries()]
      .map(([date, depthFt]) => ({ date, depthFt }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length >= 2) {
      const latest = points[points.length - 1];
      const yearAgoIso = new Date(Date.parse(latest.date) - 365 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const yearAgo = points.find((p) => p.date >= yearAgoIso);

      let shallowest = points[0];
      let deepest = points[0];
      for (const p of points) {
        if (p.depthFt < shallowest.depthFt) shallowest = p;
        if (p.depthFt > deepest.depthFt) deepest = p;
      }

      history = {
        number,
        points,
        firstDate: points[0].date,
        lastDate: latest.date,
        yearChangeFt:
          yearAgo && yearAgo !== latest ? latest.depthFt - yearAgo.depthFt : null,
        recordChangeFt: latest.depthFt - points[0].depthFt,
        shallowest,
        deepest,
      };
    }
  } catch {
    history = null;
  }

  return history;
}

/**
 * Persistent cache for the reduced daily series.
 *
 * Same reasoning as the reservoir history: the in-process memo is an L1 that a
 * short-lived Workers isolate rarely hits, so without this every well page
 * re-downloads and re-parses a ~5 MB, 100,000-row CSV.
 */
const cachedWellHistory = unstable_cache(
  deriveWellHistory,
  ["well-history-v1"],
  { revalidate: HISTORY_TTL_SECONDS, tags: ["well-history"] },
);

export async function getWellHistory(number: string): Promise<WellHistory | null> {
  const hit = historyMemo.get(number);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.value;

  const history = await cachedWellHistory(number);
  historyMemo.set(number, { at: Date.now(), value: history });
  return history;
}

/** Distinct colour per aquifer for the map, stable across renders. */
export const AQUIFER_COLORS = [
  "#0ea5e9", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981",
  "#f43f5e", "#6366f1", "#84cc16", "#06b6d4", "#a855f7", "#eab308",
];

export function aquiferColor(aquifer: string, all: string[]): string {
  const index = all.indexOf(aquifer);
  return index < 0
    ? "#94a3b8"
    : AQUIFER_COLORS[index % AQUIFER_COLORS.length];
}
