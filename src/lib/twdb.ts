import { RESERVOIR_SLUGS } from "./slugs";
import type { DailyPoint, Reservoir } from "./types";

const BASE = "https://www.waterdatafortexas.org/reservoirs";
const UA = "tx-lake-monitor (https://github.com/; contact via site)";

/**
 * TWDB throttles aggressive clients (we saw 502/503 after ~100 rapid requests),
 * so every fetch here is cached at the data layer and nothing fans out across
 * all 122 reservoirs at once. Statewide conditions update once daily; per-lake
 * history is only fetched on demand for the lake being viewed.
 */
const DAILY = 60 * 60 * 6; // 6h — TWDB posts one observation per day
const HISTORY = 60 * 60 * 12;

async function fetchText(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`TWDB ${res.status} for ${url}`);
  }
  return res.text();
}

interface RawReservoir {
  area: number | null;
  condensed_name: string;
  conservation_capacity: number | null;
  conservation_pool_elevation: number | null;
  conservation_storage: number | null;
  dead_pool_elevation: number | null;
  elevation: number | null;
  flood_control_lake: unknown;
  full_name: string;
  gauge_location: { coordinates: [number, number]; type: string } | null;
  percent_full: number | null;
  short_name: string;
  tags: string[];
  timestamp: string;
  volume: number | null;
}

function tagValue(tags: string[], prefix: string): string | null {
  const hit = tags.find((t) => t.startsWith(`${prefix}_`));
  if (!hit) return null;
  return titleize(hit.slice(prefix.length + 1));
}

function titleize(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toReservoir(key: string, raw: RawReservoir): Reservoir {
  const tags = raw.tags ?? [];
  const coords = raw.gauge_location?.coordinates;
  return {
    slug: RESERVOIR_SLUGS[key] ?? key.toLowerCase(),
    name: raw.full_name,
    shortName: raw.short_name,
    elevation: raw.elevation,
    area: raw.area,
    storage: raw.volume,
    conservationStorage: raw.conservation_storage,
    conservationCapacity: raw.conservation_capacity,
    conservationPoolElevation: raw.conservation_pool_elevation,
    deadPoolElevation: raw.dead_pool_elevation,
    percentFull: raw.percent_full,
    isFloodControl: Boolean(raw.flood_control_lake),
    isTexas: tags.includes("texas"),
    lat: coords ? coords[1] : null,
    lon: coords ? coords[0] : null,
    tags,
    date: raw.timestamp,
    basin: tagValue(tags, "basin"),
    region: tagValue(tags, "region"),
    climate: tagValue(tags, "climate"),
  };
}

/** Every major Texas reservoir with its most recent daily observation. */
export async function getAllReservoirs(): Promise<Reservoir[]> {
  const text = await fetchText(`${BASE}/recent-conditions.json`, DAILY);
  const raw = JSON.parse(text) as Record<string, RawReservoir>;
  return Object.entries(raw)
    .map(([key, value]) => toReservoir(key, value))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getReservoir(slug: string): Promise<Reservoir | null> {
  const all = await getAllReservoirs();
  return all.find((r) => r.slug === slug) ?? null;
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * TWDB CSVs open with a ~20-line `#`-prefixed disclaimer, then a header row:
 * date,water_level,surface_area,reservoir_storage,conservation_storage,
 * percent_full,conservation_capacity,dead_pool_capacity
 */
function parseCsv(text: string): DailyPoint[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date");
  const iLevel = idx("water_level");
  const iArea = idx("surface_area");
  const iStorage = idx("reservoir_storage");
  const iCons = idx("conservation_storage");
  const iPct = idx("percent_full");
  const iCap = idx("conservation_capacity");

  const points: DailyPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = cells[iDate]?.trim();
    if (!date) continue;
    points.push({
      date,
      waterLevel: num(cells[iLevel]),
      surfaceArea: num(cells[iArea]),
      storage: num(cells[iStorage]),
      conservationStorage: num(cells[iCons]),
      percentFull: num(cells[iPct]),
      conservationCapacity: num(cells[iCap]),
    });
  }
  return points;
}

/**
 * Statewide totals, daily back to 1933-07-01 (~34,000 rows, ~1.4 MB).
 *
 * TWDB aggregates this itself, which matters: deriving it from the 122
 * individual reservoirs would mean 122 requests and would silently change
 * meaning as reservoirs are added to the monitored set over the decades.
 *
 * The file carries only storage columns — no elevation or surface area — so
 * `waterLevel` and `surfaceArea` come back null. `parseCsv` handles that by
 * looking columns up by name.
 */
export async function getStatewideHistory(): Promise<DailyPoint[]> {
  const text = await fetchText(`${BASE}/statewide.csv`, HISTORY);
  return parseCsv(text);
}

export type HistoryRange = "30day" | "1year" | "all";

/**
 * Daily history for one reservoir. "all" is the full period of record, which
 * runs to decades for some lakes — cached hard and only requested on demand.
 */
export async function getHistory(
  slug: string,
  range: HistoryRange = "1year",
): Promise<DailyPoint[]> {
  const path = range === "all" ? `${slug}.csv` : `${slug}-${range}.csv`;
  const text = await fetchText(`${BASE}/individual/${path}`, HISTORY);
  return parseCsv(text);
}
