import type { UsgsReading, UsgsSeries } from "./types";

const IV = "https://waterservices.usgs.gov/nwis/iv/";

/**
 * Lake/reservoir parameters we care about. USGS splits lake elevation across
 * three codes depending on datum and vintage, and no single one covers Texas:
 * 62614 is the widest (~106 sites), 62615 adds ~53, 00062 covers the six LCRA
 * Highland Lakes that hydromet.lcra.org reports.
 */
export const ELEVATION_PARAMS = ["62614", "62615", "00062"] as const;
export const STORAGE_PARAM = "00054";

export const PARAM_LABELS: Record<string, string> = {
  "62614": "Lake elevation (NAVD88)",
  "62615": "Lake elevation (NGVD29)",
  "00062": "Lake elevation",
  "00054": "Reservoir storage",
};

/** USGS asks for a short window; readings are typically every 15 minutes. */
const REALTIME = 60 * 10;

interface NwisValue {
  value: string;
  dateTime: string;
  qualifiers?: string[];
}

interface NwisTimeSeries {
  sourceInfo: {
    siteName: string;
    siteCode: { value: string }[];
    geoLocation?: { geogLocation?: { latitude: number; longitude: number } };
  };
  variable: {
    variableCode: { value: string }[];
    variableName: string;
    unit?: { unitCode?: string };
    noDataValue?: number;
  };
  values: { value: NwisValue[] }[];
}

interface NwisResponse {
  value: { timeSeries: NwisTimeSeries[] };
}

async function fetchNwis(
  params: Record<string, string>,
  revalidate: number,
): Promise<NwisTimeSeries[]> {
  const url = new URL(IV);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { next: { revalidate } });
  // USGS returns 404 when a site/parameter combination simply has no data.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`USGS ${res.status} for ${url}`);

  const json = (await res.json()) as NwisResponse;
  return json.value?.timeSeries ?? [];
}

function cleanValue(raw: string | undefined, noData: number | undefined) {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // USGS encodes missing readings as a sentinel, almost always -999999.
  if (noData !== undefined && n === noData) return null;
  if (n <= -999999) return null;
  return n;
}

function toReading(ts: NwisTimeSeries): UsgsReading {
  const geo = ts.sourceInfo.geoLocation?.geogLocation;
  const code = ts.variable.variableCode[0]?.value ?? "";
  const latest = ts.values[0]?.value?.at(-1);
  return {
    siteId: ts.sourceInfo.siteCode[0]?.value ?? "",
    siteName: ts.sourceInfo.siteName,
    lat: geo?.latitude ?? null,
    lon: geo?.longitude ?? null,
    parameterCode: code,
    parameterName: PARAM_LABELS[code] ?? ts.variable.variableName,
    unit: ts.variable.unit?.unitCode ?? "",
    value: cleanValue(latest?.value, ts.variable.noDataValue),
    observedAt: latest?.dateTime ?? null,
  };
}

/** Latest reading from every real-time lake-elevation gage in Texas. */
export async function getTexasLakeGages(): Promise<UsgsReading[]> {
  const series = await fetchNwis(
    {
      stateCd: "tx",
      parameterCd: ELEVATION_PARAMS.join(","),
      siteStatus: "active",
    },
    REALTIME,
  );
  return series
    .map(toReading)
    .filter((r) => r.value !== null)
    .sort((a, b) => a.siteName.localeCompare(b.siteName));
}

/** Time series for specific gages over the trailing `days`. */
export async function getGageSeries(
  siteIds: string[],
  days = 7,
): Promise<UsgsSeries[]> {
  if (siteIds.length === 0) return [];
  const series = await fetchNwis(
    {
      sites: siteIds.join(","),
      parameterCd: [...ELEVATION_PARAMS, STORAGE_PARAM].join(","),
      period: `P${days}D`,
      siteStatus: "all",
    },
    REALTIME,
  );

  return series.map((ts) => {
    const base = toReading(ts);
    const noData = ts.variable.noDataValue;
    const points = (ts.values[0]?.value ?? [])
      .map((v) => ({ t: v.dateTime, v: cleanValue(v.value, noData) }))
      .filter((p): p is { t: string; v: number } => p.v !== null);
    return {
      siteId: base.siteId,
      siteName: base.siteName,
      lat: base.lat,
      lon: base.lon,
      parameterCode: base.parameterCode,
      parameterName: base.parameterName,
      unit: base.unit,
      points,
    };
  });
}
