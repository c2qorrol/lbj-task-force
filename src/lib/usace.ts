import usaceGages from "@/data/usace-gages.json";

/**
 * USACE CWMS Data API — real-time pool elevation for reservoirs that have no
 * USGS lake gage.
 *
 * The reservoir→series mapping is precomputed by `npm run sync:usace`, which
 * validates every candidate against TWDB's own elevation before accepting it.
 * That matters because a dam publishes headwater and tailwater series with
 * near-identical identifiers, and the wrong one is wrong by tens of feet.
 *
 * Coverage is deliberately small. Of the ten reservoirs with no USGS gage, only
 * Texoma and O. H. Ivie actually publish elevation through CWMS; the rest
 * (Amistad, Falcon, Toledo Bend, Caddo, Lake Houston…) exist in CWMS only as
 * metadata records with no time series, or are operated by IBWC and Reclamation,
 * which publish elsewhere.
 */

const CWMS = "https://cwms-data.usace.army.mil/cwms-data";
const REVALIDATE = 60 * 15;

interface UsaceMapping {
  office: string;
  tsId: string;
  locationName: string;
  publicName: string;
  units: string;
  lat: number;
  lon: number;
  km: number;
}

const MAPPINGS = usaceGages as Record<string, UsaceMapping>;

export interface UsaceReading {
  office: string;
  tsId: string;
  siteName: string;
  units: string;
  lat: number;
  lon: number;
  value: number | null;
  observedAt: string | null;
  points: { t: string; v: number }[];
}

export function hasUsaceGage(slug: string): boolean {
  return MAPPINGS[slug] !== undefined;
}

export async function getUsaceReading(
  slug: string,
  days = 7,
): Promise<UsaceReading | null> {
  const mapping = MAPPINGS[slug];
  if (!mapping) return null;

  const end = new Date();
  const begin = new Date(end.getTime() - days * 86_400_000);
  const url =
    `${CWMS}/timeseries?office=${mapping.office}` +
    `&name=${encodeURIComponent(mapping.tsId)}` +
    `&begin=${begin.toISOString()}&end=${end.toISOString()}&page-size=5000`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json;version=2" },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      units?: string;
      values?: [number, number | null, number?][];
    };

    // CWMS returns [epochMillis, value, qualityCode] triples.
    const points = (json.values ?? [])
      .filter((v): v is [number, number, number?] => v[1] !== null)
      .map((v) => ({ t: new Date(v[0]).toISOString(), v: v[1] }));

    const last = points[points.length - 1];
    return {
      office: mapping.office,
      tsId: mapping.tsId,
      siteName: mapping.publicName,
      units: json.units ?? mapping.units,
      lat: mapping.lat,
      lon: mapping.lon,
      value: last?.v ?? null,
      observedAt: last?.t ?? null,
      points,
    };
  } catch {
    return null;
  }
}
