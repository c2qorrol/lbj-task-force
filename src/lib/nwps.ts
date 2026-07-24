/**
 * NWS National Water Prediction Service — flood status and forecasts for river
 * gauges (https://api.water.noaa.gov/nwps/v1, no key required).
 *
 * NWPS is the authority on what a stage reading *means*: it carries the
 * NWS-defined action/minor/moderate/major thresholds per gauge and the current
 * category, which raw USGS readings cannot provide. NWPS and USGS share no
 * usable identifier in the list endpoint, so gauges are joined to USGS sites
 * by position — they are physically the same installations, so coordinates
 * agree to well under a kilometre.
 */

export type FloodCategory = "action" | "minor" | "moderate" | "major";

/** NWS-standard flood colours (yellow / orange / red / purple). */
export const FLOOD_HEX: Record<FloodCategory, string> = {
  action: "#eab308",
  minor: "#f97316",
  moderate: "#ef4444",
  major: "#a21caf",
};

export const FLOOD_LABEL: Record<FloodCategory, string> = {
  action: "Action stage",
  minor: "Minor flooding",
  moderate: "Moderate flooding",
  major: "Major flooding",
};

/** Severity rank for sorting; higher draws later (on top). */
export const FLOOD_RANK: Record<FloodCategory, number> = {
  action: 1,
  minor: 2,
  moderate: 3,
  major: 4,
};

export interface NwpsGauge {
  lid: string;
  name: string;
  lat: number;
  lon: number;
  /** Observed NWS flood category, null when not flooding or not defined. */
  flood: FloodCategory | null;
  /** Whether NWS issues a stage/flow forecast series for this point. */
  hasForecast: boolean;
}

const BASE = "https://api.water.noaa.gov/nwps/v1";
const REVALIDATE = 60 * 15; // flood categories move fast during events

/** Texas plus a margin, so border-river gauges (Red, Sabine, Rio Grande) come back. */
const TX_BBOX = "bbox.xmin=-107.0&bbox.ymin=25.7&bbox.xmax=-93.4&bbox.ymax=36.6&srid=EPSG_4326";

interface RawGauge {
  lid: string;
  name: string;
  latitude: number;
  longitude: number;
  pedts?: { forecast?: string };
  status?: { observed?: { floodCategory?: string } };
}

const CATEGORIES = new Set<string>(["action", "minor", "moderate", "major"]);

/**
 * Every NWPS gauge in and around Texas (~1,000; the response is ~1 MB, safely
 * under Next's 2 MB data-cache ceiling). Other observed states — no_flooding,
 * not_defined, obs_not_current, out_of_service, low_threshold — all mean "not
 * in a flood category" here and come back as null.
 */
export async function getNwpsGauges(): Promise<NwpsGauge[]> {
  const res = await fetch(`${BASE}/gauges?${TX_BBOX}`, {
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`NWPS ${res.status}`);
  const json = (await res.json()) as { gauges?: RawGauge[] };

  return (json.gauges ?? [])
    .filter((g) => Number.isFinite(g.latitude) && Number.isFinite(g.longitude))
    .map((g) => {
      const cat = g.status?.observed?.floodCategory ?? "";
      return {
        lid: g.lid,
        name: g.name,
        lat: g.latitude,
        lon: g.longitude,
        flood: CATEGORIES.has(cat) ? (cat as FloodCategory) : null,
        hasForecast: Boolean(g.pedts?.forecast),
      };
    });
}

export interface ForecastPoint {
  /** ISO valid time. */
  t: string;
  stageFt: number | null;
  flowCfs: number | null;
}

export interface GaugeForecast {
  lid: string;
  issuedTime: string | null;
  points: ForecastPoint[];
  /** Highest forecast point, by stage when present, otherwise by flow. */
  crest: ForecastPoint | null;
}

interface RawStageflow {
  issuedTime?: string;
  primaryName?: string;
  primaryUnits?: string;
  secondaryName?: string;
  secondaryUnits?: string;
  data?: { validTime: string; primary?: number; secondary?: number }[];
}

/** NWPS marks a missing reading as -999 in whichever unit the series uses. */
function reading(v: number | undefined): number | null {
  return v === undefined || !Number.isFinite(v) || v <= -999 ? null : v;
}

const FORECAST_REVALIDATE = 60 * 60; // river forecasts are issued a few times a day

/**
 * The NWS forecast series for one gauge — typically 3-hour steps about five
 * days out. Returns null when the gauge has no active forecast (the endpoint
 * answers 200 with an empty data array rather than 404).
 *
 * Series roles come from the names rather than being assumed: most river
 * gauges are stage-primary/flow-secondary (pedts HGIF*), but pool gauges
 * (HPIF*) and a few flow-primary points exist.
 */
export async function getGaugeForecast(lid: string): Promise<GaugeForecast | null> {
  const res = await fetch(`${BASE}/gauges/${lid}/stageflow/forecast`, {
    next: { revalidate: FORECAST_REVALIDATE },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as RawStageflow;
  const rows = json.data ?? [];
  if (rows.length === 0) return null;

  const primaryIsFlow = (json.primaryName ?? "").toLowerCase().includes("flow");
  // Flow is published in kcfs; stage in ft.
  const toCfs = (v: number | null) => (v === null ? null : v * 1000);

  const points: ForecastPoint[] = rows.map((r) => {
    const primary = reading(r.primary);
    const secondary = reading(r.secondary);
    return {
      t: r.validTime,
      stageFt: primaryIsFlow ? secondary : primary,
      flowCfs: toCfs(primaryIsFlow ? primary : secondary),
    };
  });

  let crest: ForecastPoint | null = null;
  for (const p of points) {
    const key = p.stageFt ?? p.flowCfs;
    if (key === null) continue;
    const best = crest ? (crest.stageFt ?? crest.flowCfs) : null;
    if (best === null || key > best) crest = p;
  }

  return { lid, issuedTime: json.issuedTime ?? null, points, crest };
}

/**
 * The NWPS gauge co-located with a point of interest (a USGS site or a dam),
 * using the same 1 km same-installation rule as the flood-status join.
 */
export function findGaugeNear(
  gauges: NwpsGauge[],
  lat: number | null,
  lon: number | null,
): NwpsGauge | null {
  if (lat === null || lon === null) return null;
  let best: { gauge: NwpsGauge; km: number } | null = null;
  for (const g of gauges) {
    const km = haversineKm(lat, lon, g.lat, g.lon);
    if (km <= JOIN_KM && (!best || km < best.km)) best = { gauge: g, km };
  }
  return best?.gauge ?? null;
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
 * An NWPS gauge and a USGS site describing the same installation sit at the
 * same coordinates give or take datum rounding; 1 km is generous for that
 * while staying far too tight to confuse two different gauges on one river.
 */
const JOIN_KM = 1;

/** Cell size ~2.2 km of latitude, so a 3×3 neighbourhood always covers JOIN_KM. */
const CELL_DEG = 0.02;

const cellKey = (lat: number, lon: number) =>
  `${Math.round(lat / CELL_DEG)},${Math.round(lon / CELL_DEG)}`;

/**
 * Flood category per USGS site id, for the sites that are currently in one.
 * Grid-bucketed so joining ~900 sites against ~1,000 gauges stays linear.
 */
export function joinFloodStatus(
  sites: { siteId: string; lat: number; lon: number }[],
  gauges: NwpsGauge[],
): Map<string, FloodCategory> {
  const flooding = gauges.filter((g) => g.flood !== null);
  const grid = new Map<string, NwpsGauge[]>();
  for (const g of flooding) {
    const key = cellKey(g.lat, g.lon);
    const bucket = grid.get(key);
    if (bucket) bucket.push(g);
    else grid.set(key, [g]);
  }

  const out = new Map<string, FloodCategory>();
  if (flooding.length === 0) return out;

  for (const site of sites) {
    const row = Math.round(site.lat / CELL_DEG);
    const col = Math.round(site.lon / CELL_DEG);
    let best: { flood: FloodCategory; km: number } | null = null;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        for (const g of grid.get(`${row + dr},${col + dc}`) ?? []) {
          const km = haversineKm(site.lat, site.lon, g.lat, g.lon);
          if (km <= JOIN_KM && (!best || km < best.km)) {
            best = { flood: g.flood!, km };
          }
        }
      }
    }
    if (best) out.set(site.siteId, best.flood);
  }
  return out;
}
