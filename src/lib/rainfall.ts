/**
 * Rainfall from CoCoRaHS — the Community Collaborative Rain, Hail & Snow
 * Network, a volunteer observer network coordinated by Colorado State
 * University. Roughly 2,000 Texas stations report a manual 24-hour total each
 * morning.
 *
 * Chosen over the obvious alternative, USGS precipitation (parameter 00045),
 * for two concrete reasons found while testing:
 *
 *  - **USGS mixes incremental and cumulative series.** Summing 00045 across a
 *    day produced a 56-inch total for one Texas site — physically impossible,
 *    and a world record if it were real. Some gages report the interval total,
 *    others a running total since reset, and the API does not cleanly say
 *    which. CoCoRaHS publishes an already-accumulated 24-hour total, so there
 *    is nothing to infer.
 *  - **Payload.** A 7-day USGS window for Texas is ~26 MB across 330,000
 *    datapoints; the same window from CoCoRaHS is ~2 MB and aggregates to one
 *    number per station.
 *
 * The trade-off is that these are human observations read once daily, not
 * telemetry — they are timestamped accordingly and are not real-time.
 */

import { unstable_cache } from "next/cache";

const BASE = "https://data.cocorahs.org/cocorahs/export/exportreports.aspx";
const REVALIDATE = 60 * 60 * 3;

/** Ignore trace amounts; below this a station reads as "no rain" on the map. */
export const RAIN_THRESHOLD_IN = 0.01;

export interface RainStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Total for the most recent report day, inches. */
  day1: number;
  /** Total across the requested window, inches. */
  day7: number;
  /** Date of the station's most recent report, YYYY-MM-DD. */
  lastReport: string;
}

interface RawReport {
  st_num: string;
  st_name: string;
  obs_date: string;
  lat: number | string;
  lng: number | string;
  totalpcpn: number | string | null;
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Null and empty string are absent readings, not zero.
 *
 * `Number(null)` is 0 and `Number("")` is 0, so without these guards a station
 * that filed no measurement counted as a station reporting no rain — dragging
 * the "average of N stations" figure down — and a row with no coordinates was
 * placed at 0°, 0°.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Station totals for the trailing week.
 *
 * One request covers both windows: the API returns a row per station per day,
 * so the 24-hour figure is the newest row and the weekly figure is their sum.
 */
async function fetchRainfall(days: number): Promise<RainStation[]> {
  const url =
    `${BASE}?ReportType=Daily&dtf=1&Format=JSON&State=TX` +
    `&ReportDateType=reportdate&StartDate=${iso(days)}&EndDate=${iso(1)}`;

  let reports: RawReport[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "tx-lake-monitor" },
      /*
       * Deliberately NOT `cache: "no-store"`. Next treats a no-store fetch as
       * making its whole scope dynamic, which silently opted the surrounding
       * `unstable_cache` out of caching entirely — every cold isolate then
       * re-downloaded ~2 MB and lake pages regressed to 5–57 s.
       */
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { reports?: RawReport[] } };
    reports = json.data?.reports ?? [];
  } catch {
    return [];
  }

  const byStation = new Map<string, RainStation>();

  for (const report of reports) {
    const lat = num(report.lat);
    const lon = num(report.lng);
    const value = num(report.totalpcpn);
    if (lat === null || lon === null || value === null || value < 0) continue;

    const existing = byStation.get(report.st_num);
    if (!existing) {
      byStation.set(report.st_num, {
        id: report.st_num,
        name: report.st_name,
        lat,
        lon,
        day1: value,
        day7: value,
        lastReport: report.obs_date,
      });
      continue;
    }

    existing.day7 += value;
    // Rows are not guaranteed ordered, so track the newest explicitly.
    if (report.obs_date > existing.lastReport) {
      existing.lastReport = report.obs_date;
      existing.day1 = value;
    }
  }

  return [...byStation.values()];
}

/**
 * Persistent cache for the aggregated station totals.
 *
 * The raw response is ~2 MB of per-station-per-day rows, which Next will not
 * retain in its data cache — so without this every cold isolate re-downloaded
 * it, and adding rainfall to lake pages pushed them from ~0.9 s back to 9–20 s.
 * Caching the aggregate (one row per station, ~180 KB) keeps the download off
 * the request path.
 */
const cachedRainfall = unstable_cache(fetchRainfall, ["rainfall-v1"], {
  revalidate: REVALIDATE,
  tags: ["rainfall"],
});

const memo = new Map<number, { at: number; value: RainStation[] }>();

export async function getRainfall(days = 7): Promise<RainStation[]> {
  const hit = memo.get(days);
  if (hit && Date.now() - hit.at < REVALIDATE * 1000) return hit.value;

  const stations = await cachedRainfall(days);
  memo.set(days, { at: Date.now(), value: stations });
  return stations;
}

/**
 * Trim for the map: only stations that actually recorded rain.
 *
 * Roughly 2,000 stations report, and on a dry day all but a handful read zero.
 * Plotting those is noise on a rainfall layer and would treble the payload, so
 * absence of a marker means no measurable rain rather than no station.
 */
export function compactForMap(stations: RainStation[]) {
  return stations
    .filter((s) => s.day7 >= RAIN_THRESHOLD_IN)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: Math.round(s.lat * 1e4) / 1e4,
      lon: Math.round(s.lon * 1e4) / 1e4,
      day1: Math.round(s.day1 * 100) / 100,
      day7: Math.round(s.day7 * 100) / 100,
      lastReport: s.lastReport,
    }));
}

export interface RainfallSummary {
  /** Stations within the radius that reported at all. */
  stations: number;
  /** Mean weekly total across those stations, inches. */
  meanWeekIn: number;
  /** Largest weekly total nearby, inches. */
  maxWeekIn: number;
  /** Mean of the most recent 24-hour totals, inches. */
  meanDayIn: number;
  radiusKm: number;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Rainfall around a point — used for reservoir context.
 *
 * Deliberately a local average rather than a watershed total: a reservoir is
 * fed by a catchment that can extend hundreds of kilometres upstream, and
 * nothing here models that. This answers "has it rained near the lake", which
 * is a weaker claim and the one the UI makes.
 */
export function summarizeNear(
  stations: RainStation[],
  lat: number | null,
  lon: number | null,
  radiusKm = 60,
): RainfallSummary | null {
  if (lat === null || lon === null) return null;

  const nearby = stations.filter(
    (s) => haversineKm(lat, lon, s.lat, s.lon) <= radiusKm,
  );
  if (nearby.length === 0) return null;

  const weekTotal = nearby.reduce((sum, s) => sum + s.day7, 0);
  const dayTotal = nearby.reduce((sum, s) => sum + s.day1, 0);

  return {
    stations: nearby.length,
    meanWeekIn: weekTotal / nearby.length,
    maxWeekIn: Math.max(...nearby.map((s) => s.day7)),
    meanDayIn: dayTotal / nearby.length,
    radiusKm,
  };
}
