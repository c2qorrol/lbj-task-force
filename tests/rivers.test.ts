import { afterEach, describe, expect, it, vi } from "vitest";
import { compactForMap, getRiverGages } from "@/lib/rivers";
import { mockFetch, nwisSeries } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const STAGE = "00065";
const DISCHARGE = "00060";

describe("river gage merging", () => {
  it("merges a site's stage and discharge series into one marker", async () => {
    // USGS returns one series per site *per parameter*, so a station that
    // reports both appears twice and must not become two map markers.
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "08158000",
                siteName: "Colorado Rv at Austin, TX",
                paramCode: STAGE,
                values: [{ value: "12.81", dateTime: "2026-07-24T22:45:00Z" }],
              }),
              nwisSeries({
                siteId: "08158000",
                siteName: "Colorado Rv at Austin, TX",
                paramCode: DISCHARGE,
                values: [{ value: "1460", dateTime: "2026-07-24T23:00:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    const gages = await getRiverGages();

    expect(gages).toHaveLength(1);
    expect(gages[0].stageFt).toBe(12.81);
    expect(gages[0].flowCfs).toBe(1460);
    // The newest observation across both parameters wins.
    expect(gages[0].observedAt).toBe("2026-07-24T23:00:00Z");
  });

  it("keeps a site that reports only stage", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "1",
                paramCode: STAGE,
                values: [{ value: "3.2", dateTime: "2026-07-24T22:45:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    const [gage] = await getRiverGages();
    expect(gage.stageFt).toBe(3.2);
    expect(gage.flowCfs).toBeNull();
  });

  it("drops the missing-data sentinel", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "1",
                paramCode: DISCHARGE,
                values: [{ value: "-999999", dateTime: "2026-07-24T22:45:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    await expect(getRiverGages()).resolves.toEqual([]);
  });

  it("keeps small negative discharge", async () => {
    /*
     * Pins current behaviour: the filter is `<= -999`, so -1 survives. Note
     * the module comment claims -1 is the ice-affected code and implies it is
     * filtered — it is not. Left as-is deliberately, because negative
     * discharge is legitimate at tidal sites and blanket-filtering it would
     * lose real readings. If the ice case ever matters, filter on the
     * qualifier, not the magnitude.
     */
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "1",
                paramCode: DISCHARGE,
                values: [{ value: "-1", dateTime: "2026-07-24T22:45:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    const [gage] = await getRiverGages();
    expect(gage.flowCfs).toBe(-1);
  });

  it("degrades to an empty layer instead of failing the map", async () => {
    mockFetch([{ body: "", status: 503 }]);
    await expect(getRiverGages()).resolves.toEqual([]);
  });
});

describe("compactForMap", () => {
  const gage = {
    siteId: "08158000",
    siteName: "Colorado Rv at Austin, TX",
    lat: 30.244171666,
    lon: -97.694455,
    stageFt: 12.8149,
    flowCfs: 1460.44,
    observedAt: "2026-07-24T23:00:00Z",
  };

  it("rounds coordinates and readings to the precision the map can show", () => {
    const [out] = compactForMap([gage]);
    expect(out.lat).toBe(30.2442);
    expect(out.lon).toBe(-97.6945);
    expect(out.stageFt).toBe(12.81);
    expect(out.flowCfs).toBe(1460.4);
  });

  it("omits the flood field entirely when nothing is flooding", () => {
    const [out] = compactForMap([gage]);
    // Absent rather than null: on a quiet day this field costs nothing across
    // ~900 serialised sites.
    expect("flood" in out).toBe(false);
  });

  it("attaches a flood category when the site has one", () => {
    const [out] = compactForMap([gage], new Map([["08158000", "moderate"]]));
    expect(out.flood).toBe("moderate");
  });

  it("leaves the percentile fields off a site with no published normals", () => {
    const [out] = compactForMap([{ ...gage, siteId: "00000000" }]);
    expect("flowClass" in out).toBe(false);
    expect("flowPct" in out).toBe(false);
  });
});
