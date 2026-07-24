import basemap from "@/data/tx-counties.json";

/**
 * US Drought Monitor (droughtmonitor.unl.edu), published weekly on Thursdays.
 *
 * The API reports each severity as a *cumulative* percentage of area: `d1`
 * already includes everything in d2–d4. That matters everywhere below — the
 * exclusive share in a category is `d[n] - d[n+1]`, and the official Drought
 * Severity and Coverage Index is simply the sum of the five cumulative figures
 * (verified against the API's own GetDSCI endpoint: 76.83 → 77).
 */

const API = "https://usdmdataservices.unl.edu/api";
const REVALIDATE = 60 * 60 * 6; // weekly data; 6h keeps Thursday fresh

export type DroughtCategory = "none" | "d0" | "d1" | "d2" | "d3" | "d4";

export const DROUGHT_ORDER: DroughtCategory[] = ["d4", "d3", "d2", "d1", "d0"];

/** Official USDM palette — reused rather than invented, so maps read correctly. */
export const DROUGHT_HEX: Record<DroughtCategory, string> = {
  none: "#ffffff",
  d0: "#ffff00",
  d1: "#fcd37f",
  d2: "#ffaa00",
  d3: "#e60000",
  d4: "#730000",
};

/**
 * Opacity the USDM palette is drawn at when washed over the map.
 *
 * Shared so the legend swatches composite over the same land colour at the same
 * strength. At full opacity the ramp overwhelms the reservoir markers; at 0.45
 * over a dark basemap the yellows read olive, so a legend drawn at 100% would
 * no longer match the map it explains.
 */
export const DROUGHT_MAP_OPACITY = 0.45;

export const DROUGHT_LABEL: Record<DroughtCategory, string> = {
  none: "No drought",
  d0: "D0 Abnormally dry",
  d1: "D1 Moderate drought",
  d2: "D2 Severe drought",
  d3: "D3 Extreme drought",
  d4: "D4 Exceptional drought",
};

export const DROUGHT_SHORT: Record<DroughtCategory, string> = {
  none: "None",
  d0: "D0",
  d1: "D1",
  d2: "D2",
  d3: "D3",
  d4: "D4",
};

export interface DroughtBreakdown {
  none: number;
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  /** 0–500. Sum of the cumulative category percentages. */
  dsci: number;
  /** Worst category present anywhere in the area. */
  worst: DroughtCategory;
}

export interface CountyDrought extends DroughtBreakdown {
  fips: string;
  county: string;
  mapDate: string;
}

export interface DroughtWeek extends DroughtBreakdown {
  date: string;
}

interface RawStat {
  mapDate: string;
  none: number;
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  fips?: string;
  county?: string;
}

/** USDM expects M/D/YYYY. */
function usdmDate(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toBreakdown(raw: RawStat): DroughtBreakdown {
  const d0 = num(raw.d0);
  const d1 = num(raw.d1);
  const d2 = num(raw.d2);
  const d3 = num(raw.d3);
  const d4 = num(raw.d4);

  let worst: DroughtCategory = "none";
  // Categories are cumulative, so the worst present is the deepest non-zero one.
  if (d4 > 0) worst = "d4";
  else if (d3 > 0) worst = "d3";
  else if (d2 > 0) worst = "d2";
  else if (d1 > 0) worst = "d1";
  else if (d0 > 0) worst = "d0";

  return {
    none: num(raw.none),
    d0,
    d1,
    d2,
    d3,
    d4,
    dsci: Math.round(d0 + d1 + d2 + d3 + d4),
    worst,
  };
}

/** Exclusive share of each category, which is what a stacked chart needs. */
export function exclusiveShares(b: DroughtBreakdown) {
  return {
    d0: Math.max(0, b.d0 - b.d1),
    d1: Math.max(0, b.d1 - b.d2),
    d2: Math.max(0, b.d2 - b.d3),
    d3: Math.max(0, b.d3 - b.d4),
    d4: b.d4,
  };
}

async function fetchStats(url: string): Promise<RawStat[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`USDM ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? (json as RawStat[]) : [];
}

/**
 * Latest weekly reading for all 254 Texas counties.
 *
 * The county endpoint rejects a state-wide `aoi`, but does accept a
 * comma-separated FIPS list — so the whole state comes back in one request
 * (~1.7 KB of URL, ~60 KB of response) instead of 254.
 */
export async function getCountyDrought(): Promise<Record<string, CountyDrought>> {
  const fips = (basemap.counties as { fips: string }[]).map((c) => c.fips);
  const now = new Date();
  const from = new Date(now);
  // USDM publishes Thursdays; three weeks back always covers at least one map.
  from.setUTCDate(from.getUTCDate() - 21);

  const url =
    `${API}/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent` +
    `?aoi=${fips.join(",")}&startdate=${usdmDate(from)}&enddate=${usdmDate(now)}` +
    `&statisticsType=1`;

  const rows = await fetchStats(url);
  if (rows.length === 0) return {};

  const latest = rows.reduce(
    (acc, r) => (r.mapDate > acc ? r.mapDate : acc),
    rows[0].mapDate,
  );

  const out: Record<string, CountyDrought> = {};
  for (const row of rows) {
    if (row.mapDate !== latest || !row.fips) continue;
    out[row.fips] = {
      ...toBreakdown(row),
      fips: row.fips,
      county: (row.county ?? "").replace(/ County$/, ""),
      mapDate: latest.slice(0, 10),
    };
  }
  return out;
}

/** Weekly statewide drought coverage, newest last. */
export async function getStatewideDroughtHistory(years = 5): Promise<DroughtWeek[]> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - years);

  const url =
    `${API}/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent` +
    `?aoi=48&startdate=${usdmDate(from)}&enddate=${usdmDate(now)}&statisticsType=1`;

  const rows = await fetchStats(url);
  return rows
    .map((row) => ({ ...toBreakdown(row), date: row.mapDate.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface DroughtWeekWithStorage extends DroughtWeek {
  /** Statewide reservoir storage nearest this drought week, percent. */
  storage: number | null;
}

/**
 * Attach statewide storage to each weekly drought reading, on the server.
 *
 * Drought is weekly and storage is daily back to 1933, so handing the raw
 * storage series to the client shipped ~34,000 points — 2.9 MB of HTML — of
 * which the chart could only ever plot the ~1,300 that line up with a drought
 * week, and never anything before 2000. Aligning here reduces the payload by
 * more than an order of magnitude and removes the hydration stall that left the
 * charts blank for seconds after the page appeared.
 */
export function alignStorageToWeeks(
  weeks: DroughtWeek[],
  storage: { date: string; percentFull: number }[],
  maxGapDays = 7,
): DroughtWeekWithStorage[] {
  // Both are sorted ascending, so one cursor walks the storage series once.
  let cursor = 0;
  return weeks.map((week) => {
    while (cursor < storage.length - 1 && storage[cursor].date < week.date) {
      cursor++;
    }
    const nearest = storage[cursor];
    const gapDays = nearest
      ? Math.abs(Date.parse(nearest.date) - Date.parse(week.date)) / 86_400_000
      : Infinity;
    return {
      ...week,
      storage: nearest && gapDays <= maxGapDays ? nearest.percentFull : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Point-in-county lookup                                              */
/* ------------------------------------------------------------------ */

interface CountyShape {
  fips: string;
  name: string;
  rings: number[][];
}

const COUNTIES = basemap.counties as CountyShape[];

/**
 * Even-odd ray casting across every ring of the county at once.
 *
 * Testing all rings together rather than per-polygon means enclaves and holes
 * fall out naturally: a point inside a hole crosses an even number of edges.
 */
function pointInCounty(lon: number, lat: number, county: CountyShape): boolean {
  let inside = false;
  for (const ring of county.rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > lat !== yj > lat) {
        const x = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (lon < x) inside = !inside;
      }
    }
  }
  return inside;
}

const countyCache = new Map<string, CountyShape | null>();

/**
 * Border tolerance, km.
 *
 * Dams on boundary rivers — Amistad, Texoma, Toledo Bend, Caddo — are gaged
 * essentially on the state or national line, and the basemap's 3-decimal
 * rounding (~90 m) is enough to put those points marginally outside the Texas
 * polygon. A containment test alone therefore loses exactly the lakes people
 * are most likely to look up. Snapping to the nearest county within this radius
 * recovers them, while leaving genuinely out-of-state reservoirs (Elephant
 * Butte, ~180 km into New Mexico) correctly unassigned.
 */
const BORDER_SNAP_KM = 25;

function approxKmToCounty(lat: number, lon: number, county: CountyShape): number {
  // Degrees→km, with longitude compressed by latitude. Vertex distance is a
  // slight over-estimate versus true edge distance, which is fine at this scale.
  const latScale = 111;
  const lonScale = 111 * Math.cos(lat * (Math.PI / 180));
  let best = Infinity;
  for (const ring of county.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const dx = (ring[i] - lon) * lonScale;
      const dy = (ring[i + 1] - lat) * latScale;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** Which Texas county contains this point — or the nearest, for border cases. */
export function countyForPoint(lat: number, lon: number): CountyShape | null {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = countyCache.get(key);
  if (hit !== undefined) return hit;

  let found: CountyShape | null = null;
  for (const county of COUNTIES) {
    if (pointInCounty(lon, lat, county)) {
      found = county;
      break;
    }
  }

  if (!found) {
    let nearest: { county: CountyShape; km: number } | null = null;
    for (const county of COUNTIES) {
      const km = approxKmToCounty(lat, lon, county);
      if (!nearest || km < nearest.km) nearest = { county, km };
    }
    if (nearest && nearest.km <= BORDER_SNAP_KM) found = nearest.county;
  }

  countyCache.set(key, found);
  return found;
}

/** Current drought for the county containing a reservoir. */
export async function getDroughtForPoint(
  lat: number | null,
  lon: number | null,
): Promise<CountyDrought | null> {
  if (lat === null || lon === null) return null;
  const county = countyForPoint(lat, lon);
  if (!county) return null;
  try {
    const byFips = await getCountyDrought();
    return byFips[county.fips] ?? null;
  } catch {
    return null;
  }
}
