/**
 * Real-time river gages — stage and discharge — across Texas.
 *
 * These are the sites LCRA's Hydromet plots for its own basin, except that
 * USGS covers the whole state: roughly 790 gage-height sites and 620 discharge
 * sites, many of them the same station reporting both.
 */

import type { FloodCategory } from "./nwps";
import { classifyFlow } from "./flowstats";
import type { FlowClass } from "./flowclass";

const IV = "https://waterservices.usgs.gov/nwis/iv/";

/** 00065 = gage height (stage), ft. 00060 = discharge, cfs. */
const STAGE = "00065";
const DISCHARGE = "00060";

const REVALIDATE = 60 * 15;

export interface RiverGage {
  siteId: string;
  siteName: string;
  lat: number;
  lon: number;
  /** Gage height in feet, where reported. */
  stageFt: number | null;
  /** Discharge in cubic feet per second, where reported. */
  flowCfs: number | null;
  /** Newest observation time across the parameters this site reports. */
  observedAt: string | null;
  /** NWS flood category, when the joined NWPS gauge is in one. */
  flood?: FloodCategory;
  /** Where the current discharge sits against this month's normals. */
  flowClass?: FlowClass;
  /** Rough percentile of the current discharge, 1–99. */
  flowPct?: number;
}

interface NwisSeries {
  sourceInfo: {
    siteName: string;
    siteCode: { value: string }[];
    geoLocation?: { geogLocation?: { latitude: number; longitude: number } };
  };
  variable: { variableCode: { value: string }[]; noDataValue?: number };
  values: { value: { value: string; dateTime: string }[] }[];
}

function clean(raw: string | undefined, noData: number | undefined) {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (noData !== undefined && n === noData) return null;
  // USGS uses -999999 for missing and reports -1 for ice-affected discharge.
  if (n <= -999) return null;
  return n;
}

/**
 * Every active Texas river gage with a current reading.
 *
 * Both parameters come back in a single request; USGS returns one series per
 * site *per parameter*, so a station reporting stage and flow appears twice and
 * is merged here into one marker.
 */
export async function getRiverGages(): Promise<RiverGage[]> {
  const url = new URL(IV);
  url.searchParams.set("format", "json");
  url.searchParams.set("stateCd", "tx");
  url.searchParams.set("parameterCd", `${STAGE},${DISCHARGE}`);
  url.searchParams.set("siteStatus", "active");

  let series: NwisSeries[] = [];
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    const json = (await res.json()) as { value?: { timeSeries?: NwisSeries[] } };
    series = json.value?.timeSeries ?? [];
  } catch {
    return [];
  }

  const bySite = new Map<string, RiverGage>();

  for (const ts of series) {
    const siteId = ts.sourceInfo.siteCode[0]?.value;
    const geo = ts.sourceInfo.geoLocation?.geogLocation;
    if (!siteId || !geo) continue;

    const code = ts.variable.variableCode[0]?.value;
    const latest = ts.values[0]?.value?.at(-1);
    const value = clean(latest?.value, ts.variable.noDataValue);
    if (value === null) continue;

    const existing = bySite.get(siteId);
    const gage: RiverGage = existing ?? {
      siteId,
      siteName: ts.sourceInfo.siteName,
      lat: geo.latitude,
      lon: geo.longitude,
      stageFt: null,
      flowCfs: null,
      observedAt: null,
    };

    if (code === STAGE) gage.stageFt = value;
    else if (code === DISCHARGE) gage.flowCfs = value;

    const at = latest?.dateTime ?? null;
    if (at && (!gage.observedAt || at > gage.observedAt)) gage.observedAt = at;

    bySite.set(siteId, gage);
  }

  return [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
}

/**
 * Trim to what the map actually renders.
 *
 * The full response is large and every field of it would otherwise be
 * serialised into the page; coordinates beyond four decimals (~11 m) and
 * sub-unit precision on readings are wasted bytes at this scale.
 */
export function compactForMap(
  gages: RiverGage[],
  flood?: Map<string, FloodCategory>,
) {
  const now = new Date();
  return gages.map((g) => {
    const pctile = classifyFlow(g.siteId, g.flowCfs, now);
    return {
      siteId: g.siteId,
      siteName: g.siteName,
      lat: Math.round(g.lat * 1e4) / 1e4,
      lon: Math.round(g.lon * 1e4) / 1e4,
      stageFt: g.stageFt === null ? null : Math.round(g.stageFt * 100) / 100,
      flowCfs: g.flowCfs === null ? null : Math.round(g.flowCfs * 10) / 10,
      observedAt: g.observedAt,
      // Only present on the handful of sites actually in a category, so the
      // field costs nothing in the serialised page on a quiet day.
      ...(flood?.has(g.siteId) ? { flood: flood.get(g.siteId) } : {}),
      ...(pctile ? { flowClass: pctile.cls, flowPct: pctile.pct } : {}),
    };
  });
}
