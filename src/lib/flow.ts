import flowGages from "@/data/flow-gages.json";

/**
 * River discharge around a reservoir.
 *
 * The reservoir→gage attribution is precomputed by `npm run sync:flow` using the
 * USGS Network Linked Data Index, which walks the real hydrography network. See
 * that script for why proximity and name matching are both inadequate here.
 */

const IV = "https://waterservices.usgs.gov/nwis/iv/";
const DISCHARGE = "00060";
const REALTIME = 60 * 10;

export interface FlowGageRef {
  siteId: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  /** Straight-line distance from the dam gage, km. */
  km: number | null;
}

interface FlowMapping {
  lakeGage: string;
  inflow: FlowGageRef | null;
  outflow: FlowGageRef | null;
}

const MAPPINGS = flowGages as Record<string, FlowMapping>;

export interface FlowReading extends FlowGageRef {
  /** Discharge in cubic feet per second. */
  value: number | null;
  observedAt: string | null;
  points: { t: string; v: number }[];
}

export interface LakeFlow {
  inflow: FlowReading | null;
  outflow: FlowReading | null;
  /**
   * Inflow minus outflow, cfs — positive means the gaged reaches are adding
   * more than is being released. Only computed when both gages exist, and
   * explicitly not a closed water balance: ungaged local runoff, rainfall on
   * the surface, evaporation, and direct withdrawals are all missing.
   */
  net: number | null;
  /** Largest gage distance from the dam, for judging how literal to be. */
  maxDistanceKm: number | null;
}

export function hasFlowData(slug: string): boolean {
  return MAPPINGS[slug] !== undefined;
}

/** The precomputed inflow/outflow gage references for a lake, without readings. */
export function getFlowRefs(
  slug: string,
): { inflow: FlowGageRef | null; outflow: FlowGageRef | null } | null {
  const mapping = MAPPINGS[slug];
  if (!mapping) return null;
  return { inflow: mapping.inflow, outflow: mapping.outflow };
}

interface NwisValue {
  value: string;
  dateTime: string;
}

interface NwisSeries {
  sourceInfo: { siteCode: { value: string }[] };
  variable: { noDataValue?: number };
  values: { value: NwisValue[] }[];
}

function clean(raw: string | undefined, noData: number | undefined) {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (noData !== undefined && n === noData) return null;
  // USGS uses -999999 for missing; discharge is also reported as -1 for "ice".
  if (n <= -999) return null;
  return n;
}

export async function getLakeFlow(slug: string, days = 7): Promise<LakeFlow | null> {
  const mapping = MAPPINGS[slug];
  if (!mapping) return null;

  const sites = [mapping.inflow?.siteId, mapping.outflow?.siteId].filter(
    (s): s is string => Boolean(s),
  );
  if (sites.length === 0) return null;

  const url = new URL(IV);
  url.searchParams.set("format", "json");
  url.searchParams.set("sites", sites.join(","));
  url.searchParams.set("parameterCd", DISCHARGE);
  url.searchParams.set("period", `P${days}D`);
  url.searchParams.set("siteStatus", "all");

  let series: NwisSeries[] = [];
  try {
    const res = await fetch(url, { next: { revalidate: REALTIME } });
    if (res.ok) {
      const json = (await res.json()) as { value?: { timeSeries?: NwisSeries[] } };
      series = json.value?.timeSeries ?? [];
    }
  } catch {
    // Flow is enrichment; fall through with whatever we have.
  }

  const build = (ref: FlowGageRef | null): FlowReading | null => {
    if (!ref) return null;
    const match = series.find(
      (s) => s.sourceInfo.siteCode[0]?.value === ref.siteId,
    );
    const noData = match?.variable.noDataValue;
    const points = (match?.values[0]?.value ?? [])
      .map((v) => ({ t: v.dateTime, v: clean(v.value, noData) }))
      .filter((p): p is { t: string; v: number } => p.v !== null);
    const last = points[points.length - 1];
    return {
      ...ref,
      value: last?.v ?? null,
      observedAt: last?.t ?? null,
      points,
    };
  };

  const inflow = build(mapping.inflow);
  const outflow = build(mapping.outflow);
  if (!inflow && !outflow) return null;

  const net =
    inflow?.value !== null && inflow?.value !== undefined &&
    outflow?.value !== null && outflow?.value !== undefined
      ? inflow.value - outflow.value
      : null;

  const distances = [inflow?.km, outflow?.km].filter(
    (k): k is number => typeof k === "number",
  );

  return {
    inflow,
    outflow,
    net,
    maxDistanceKm: distances.length > 0 ? Math.max(...distances) : null,
  };
}

/** Cubic feet per second, with acre-feet per day as the water-supply unit. */
export function cfsToAcreFeetPerDay(cfs: number): number {
  // 1 cfs sustained for 24 h = 1.983471 acre-feet.
  return cfs * 1.983471;
}
