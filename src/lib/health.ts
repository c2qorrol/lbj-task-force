import { getAllReservoirs, getStatewideHistory } from "./twdb";
import { getTexasLakeGages } from "./usgs";
import { getRiverGages } from "./rivers";
import { getNwpsGauges } from "./nwps";
import { getCountyDrought } from "./drought";
import { getRainfall } from "./rainfall";
import { getWells } from "./groundwater";

/**
 * Upstream health.
 *
 * The failure this exists to catch is not an outage — an outage is loud, and
 * every enrichment panel already degrades gracefully. It is the quiet one: an
 * agency renames a field, the request still returns 200, the parser still
 * runs, and the site serves confident nulls. So each check asserts a *shape*
 * ("at least 100 reservoirs, and most of them have a percent-full figure"),
 * never merely that a request succeeded.
 *
 * Checks call the same cached data-layer functions the pages call, so what is
 * reported is the data the site is actually serving rather than a fresh fetch
 * nobody sees. When a cache holds good data the site is genuinely fine; when
 * it expires against a broken upstream, the pages and this endpoint degrade
 * together.
 */

export interface HealthCheck {
  source: string;
  ok: boolean;
  /** Whether the site is substantially broken without this feed. */
  critical: boolean;
  detail: string;
  ms: number;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  checks: HealthCheck[];
}

/** Thresholds are set well below current volumes, so normal drift is quiet. */
async function check(
  source: string,
  critical: boolean,
  run: () => Promise<string>,
): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const detail = await run();
    return { source, ok: true, critical, detail, ms: Date.now() - started };
  } catch (error) {
    return {
      source,
      ok: false,
      critical,
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks = await Promise.all([
    check("TWDB reservoir conditions", true, async () => {
      const reservoirs = await getAllReservoirs();
      const withFill = reservoirs.filter((r) => r.percentFull !== null).length;
      const texas = reservoirs.filter((r) => r.isTexas).length;
      expect(reservoirs.length >= 100, `only ${reservoirs.length} reservoirs`);
      expect(withFill >= 100, `only ${withFill} have percent full`);
      // The `texas` tag scopes every statewide total; losing it would silently
      // change the headline figure rather than break anything.
      expect(texas >= 100, `only ${texas} tagged texas`);
      return `${reservoirs.length} reservoirs, ${withFill} with fill, ${texas} in Texas`;
    }),

    check("TWDB statewide history", false, async () => {
      const points = await getStatewideHistory();
      const withStorage = points.filter((p) => p.conservationStorage !== null);
      expect(points.length >= 10_000, `only ${points.length} daily points`);
      expect(withStorage.length >= 10_000, `only ${withStorage.length} have storage`);
      return `${points.length} days, latest ${points.at(-1)?.date}`;
    }),

    check("USGS lake gages", false, async () => {
      const gages = await getTexasLakeGages();
      expect(gages.length >= 50, `only ${gages.length} reporting`);
      return `${gages.length} lake gages reporting`;
    }),

    check("USGS river gages", false, async () => {
      const gages = await getRiverGages();
      const withFlow = gages.filter((g) => g.flowCfs !== null).length;
      expect(gages.length >= 300, `only ${gages.length} reporting`);
      return `${gages.length} river gages, ${withFlow} with discharge`;
    }),

    check("NWS NWPS gauges", false, async () => {
      const gauges = await getNwpsGauges();
      const forecasts = gauges.filter((g) => g.hasForecast).length;
      expect(gauges.length >= 300, `only ${gauges.length} gauges`);
      return `${gauges.length} gauges, ${forecasts} with forecasts`;
    }),

    check("US Drought Monitor", false, async () => {
      const counties = await getCountyDrought();
      const n = Object.keys(counties).length;
      expect(n >= 200, `only ${n} counties`);
      return `${n} counties, week of ${Object.values(counties)[0]?.mapDate}`;
    }),

    check("CoCoRaHS rainfall", false, async () => {
      const stations = await getRainfall();
      expect(stations.length >= 50, `only ${stations.length} stations`);
      return `${stations.length} stations reporting`;
    }),

    check("TWDB groundwater", false, async () => {
      const wells = await getWells();
      expect(wells.length >= 100, `only ${wells.length} wells`);
      return `${wells.length} monitoring wells`;
    }),
  ]);

  return { status: deriveStatus(checks), checkedAt: new Date().toISOString(), checks };
}

/**
 * `down` means the site cannot do its job; `degraded` means an enrichment
 * panel is missing and the pages still stand up. Keeping them distinct is the
 * point — paging someone because CoCoRaHS is having a morning would train
 * everyone to ignore the alert.
 */
export function deriveStatus(checks: HealthCheck[]): HealthReport["status"] {
  if (checks.some((c) => !c.ok && c.critical)) return "down";
  if (checks.some((c) => !c.ok)) return "degraded";
  return "ok";
}
