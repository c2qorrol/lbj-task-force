export type ReservoirTags = string[];

/** A statewide reservoir record as reported daily by TWDB. */
export interface Reservoir {
  /** TWDB slug, e.g. "travis". Stable URL key. */
  slug: string;
  name: string;
  shortName: string;
  /** Surface elevation, feet above msl. */
  elevation: number | null;
  /** Surface area, acres. */
  area: number | null;
  /** Total storage incl. flood pool, acre-feet. */
  storage: number | null;
  /** Storage within the conservation pool, acre-feet. */
  conservationStorage: number | null;
  conservationCapacity: number | null;
  conservationPoolElevation: number | null;
  deadPoolElevation: number | null;
  /** Percent of conservation capacity, 0-100+. */
  percentFull: number | null;
  isFloodControl: boolean;
  /**
   * Whether TWDB counts this reservoir as Texas. Elephant Butte is tagged
   * `new_mexico` and is excluded from TWDB's own statewide totals despite
   * supplying El Paso.
   */
  isTexas: boolean;
  lat: number | null;
  lon: number | null;
  tags: ReservoirTags;
  /** Date of the TWDB observation, YYYY-MM-DD. */
  date: string;
  /** Derived groupings, parsed out of `tags`. */
  basin: string | null;
  region: string | null;
  climate: string | null;
}

/** One day of history for a single reservoir. */
export interface DailyPoint {
  date: string;
  waterLevel: number | null;
  surfaceArea: number | null;
  storage: number | null;
  conservationStorage: number | null;
  percentFull: number | null;
  conservationCapacity: number | null;
}

/** A near-real-time USGS reading for a lake gage. */
export interface UsgsReading {
  siteId: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  /** Parameter code, e.g. 62614 (elevation NAVD88). */
  parameterCode: string;
  parameterName: string;
  unit: string;
  value: number | null;
  /** ISO timestamp of the observation. */
  observedAt: string | null;
}

/** A USGS gage time series over a window. */
export interface UsgsSeries extends Omit<UsgsReading, "value" | "observedAt"> {
  points: { t: string; v: number }[];
}

export type TrendDirection = "rising" | "falling" | "steady" | "unknown";

export interface Trend {
  direction: TrendDirection;
  /** Change in the underlying unit over the window. */
  change: number | null;
  /** Percent-full change over the window, when available. */
  percentChange: number | null;
  windowDays: number;
}
