import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findGaugeNear,
  getGaugeForecast,
  getNwpsGauges,
  joinFloodStatus,
  type NwpsGauge,
} from "@/lib/nwps";
import { mockFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

/** A stage-primary / flow-secondary forecast, which is the common shape. */
function stageflow(
  data: { validTime: string; primary?: number; secondary?: number }[],
  overrides: Record<string, unknown> = {},
) {
  return {
    pedts: "HGIFF",
    issuedTime: "2026-07-24T12:22:00Z",
    primaryName: "Stage",
    primaryUnits: "ft",
    secondaryName: "Flow",
    secondaryUnits: "kcfs",
    data,
    ...overrides,
  };
}

describe("NWPS gauge list", () => {
  it("keeps only the four real flood categories", async () => {
    mockFetch([
      {
        body: {
          gauges: [
            { lid: "A", name: "a", latitude: 30, longitude: -97, status: { observed: { floodCategory: "major" } } },
            { lid: "B", name: "b", latitude: 30, longitude: -97, status: { observed: { floodCategory: "no_flooding" } } },
            { lid: "C", name: "c", latitude: 30, longitude: -97, status: { observed: { floodCategory: "not_defined" } } },
            { lid: "D", name: "d", latitude: 30, longitude: -97, status: { observed: { floodCategory: "obs_not_current" } } },
          ],
        },
      },
    ]);

    const gauges = await getNwpsGauges();
    // Everything that is not an actual category means "not flooding".
    expect(gauges.map((g) => g.flood)).toEqual(["major", null, null, null]);
  });

  it("drops gauges with no usable position", async () => {
    mockFetch([
      {
        body: {
          gauges: [
            { lid: "A", name: "a", latitude: 30, longitude: -97 },
            { lid: "B", name: "b", latitude: null, longitude: -97 },
          ],
        },
      },
    ]);

    const gauges = await getNwpsGauges();
    expect(gauges.map((g) => g.lid)).toEqual(["A"]);
  });

  it("reports whether a forecast series exists", async () => {
    mockFetch([
      {
        body: {
          gauges: [
            { lid: "A", name: "a", latitude: 30, longitude: -97, pedts: { forecast: "HGIFF" } },
            { lid: "B", name: "b", latitude: 30, longitude: -97, pedts: {} },
          ],
        },
      },
    ]);

    const gauges = await getNwpsGauges();
    expect(gauges.map((g) => g.hasForecast)).toEqual([true, false]);
  });
});

describe("NWPS forecast series", () => {
  it("converts secondary flow from kcfs to cfs", async () => {
    mockFetch([
      { body: stageflow([{ validTime: "2026-07-24T15:00:00Z", primary: 9.6, secondary: 1.46 }]) },
    ]);

    const forecast = await getGaugeForecast("BBZT2");
    expect(forecast!.points[0].stageFt).toBe(9.6);
    expect(forecast!.points[0].flowCfs).toBeCloseTo(1460, 6);
  });

  it("reads the series roles from their names rather than assuming", async () => {
    // Flow-primary gauges exist; assuming stage-primary would swap the units.
    mockFetch([
      {
        body: stageflow(
          [{ validTime: "2026-07-24T15:00:00Z", primary: 2.5, secondary: 11.2 }],
          { primaryName: "Flow", primaryUnits: "kcfs", secondaryName: "Stage", secondaryUnits: "ft" },
        ),
      },
    ]);

    const forecast = await getGaugeForecast("X");
    expect(forecast!.points[0].flowCfs).toBeCloseTo(2500, 6);
    expect(forecast!.points[0].stageFt).toBe(11.2);
  });

  it("turns the -999 sentinel into null", async () => {
    mockFetch([
      { body: stageflow([{ validTime: "2026-07-24T15:00:00Z", primary: 9.6, secondary: -999 }]) },
    ]);

    const forecast = await getGaugeForecast("X");
    expect(forecast!.points[0].flowCfs).toBeNull();
    expect(forecast!.points[0].stageFt).toBe(9.6);
  });

  it("returns null when the gauge has no forecast, which arrives as 200 with an empty array", async () => {
    mockFetch([{ body: stageflow([], { pedts: "", issuedTime: "0001-01-01T00:00:00Z" }) }]);
    await expect(getGaugeForecast("X")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the endpoint errors", async () => {
    mockFetch([{ body: "", status: 500 }]);
    await expect(getGaugeForecast("X")).resolves.toBeNull();
  });

  it("picks the crest, not the last point", async () => {
    mockFetch([
      {
        body: stageflow([
          { validTime: "2026-07-24T15:00:00Z", primary: 9.6 },
          { validTime: "2026-07-25T15:00:00Z", primary: 18.6 },
          { validTime: "2026-07-26T15:00:00Z", primary: 12.1 },
        ]),
      },
    ]);

    const forecast = await getGaugeForecast("X");
    expect(forecast!.crest!.stageFt).toBe(18.6);
    expect(forecast!.crest!.t).toBe("2026-07-25T15:00:00Z");
  });

  it("crests on flow when the series carries no stage", async () => {
    mockFetch([
      {
        body: stageflow([
          { validTime: "2026-07-24T15:00:00Z", primary: -999, secondary: 1.0 },
          { validTime: "2026-07-25T15:00:00Z", primary: -999, secondary: 3.0 },
        ]),
      },
    ]);

    const forecast = await getGaugeForecast("X");
    expect(forecast!.crest!.flowCfs).toBeCloseTo(3000, 6);
  });
});

describe("joining NWPS gauges to USGS sites by position", () => {
  const gauges: NwpsGauge[] = [
    { lid: "NEAR", name: "near", lat: 30.0, lon: -97.0, flood: "minor", hasForecast: true },
    { lid: "FAR", name: "far", lat: 31.0, lon: -97.0, flood: "major", hasForecast: true },
  ];

  it("matches a site at the same installation", () => {
    const flood = joinFloodStatus([{ siteId: "S1", lat: 30.0, lon: -97.0 }], gauges);
    expect(flood.get("S1")).toBe("minor");
  });

  it("does not match a gauge on the other side of the county", () => {
    // ~111 km away — far outside the 1 km same-installation rule.
    const flood = joinFloodStatus([{ siteId: "S1", lat: 30.0, lon: -97.0 }], [gauges[1]]);
    expect(flood.has("S1")).toBe(false);
  });

  it("prefers the nearest gauge when two are within range", () => {
    const flood = joinFloodStatus(
      [{ siteId: "S1", lat: 30.0, lon: -97.0 }],
      [
        { lid: "CLOSE", name: "c", lat: 30.001, lon: -97.0, flood: "action", hasForecast: false },
        { lid: "CLOSER", name: "cc", lat: 30.0, lon: -97.0, flood: "major", hasForecast: false },
      ],
    );
    expect(flood.get("S1")).toBe("major");
  });

  it("returns nothing when no gauge is flooding", () => {
    const quiet = gauges.map((g) => ({ ...g, flood: null }));
    expect(joinFloodStatus([{ siteId: "S1", lat: 30, lon: -97 }], quiet).size).toBe(0);
  });

  it("findGaugeNear ignores a point with no coordinates", () => {
    expect(findGaugeNear(gauges, null, null)).toBeNull();
    expect(findGaugeNear(gauges, 30.0, -97.0)?.lid).toBe("NEAR");
  });
});
