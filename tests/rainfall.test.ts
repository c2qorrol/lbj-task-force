import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "./helpers";

// The module caches through Next's unstable_cache, which needs a request
// context this test has no use for. Unwrap it to the plain function.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

/**
 * A fresh module per test: rainfall.ts memoises by window length at module
 * scope, so without this the first test's stations leak into the next.
 */
async function freshRainfall() {
  vi.resetModules();
  return import("@/lib/rainfall");
}

afterEach(() => vi.unstubAllGlobals());

function reports(rows: Record<string, unknown>[]) {
  return { data: { reports: rows } };
}

describe("CoCoRaHS station aggregation", () => {
  it("sums the window and reports the newest day separately", async () => {
    mockFetch([
      {
        body: reports([
          { st_num: "TX-TV-1", st_name: "Austin 1.2 NW", obs_date: "2026-07-22", lat: 30.3, lng: -97.7, totalpcpn: 0.5 },
          { st_num: "TX-TV-1", st_name: "Austin 1.2 NW", obs_date: "2026-07-23", lat: 30.3, lng: -97.7, totalpcpn: 1.25 },
        ]),
      },
    ]);

    const { getRainfall } = await freshRainfall();
    const [station] = await getRainfall();

    expect(station.day7).toBeCloseTo(1.75, 10);
    expect(station.day1).toBe(1.25);
    expect(station.lastReport).toBe("2026-07-23");
  });

  it("finds the newest day even when rows arrive out of order", async () => {
    // The export is not guaranteed ordered, so day1 cannot just be the last row.
    mockFetch([
      {
        body: reports([
          { st_num: "S", st_name: "S", obs_date: "2026-07-23", lat: 30, lng: -97, totalpcpn: 2 },
          { st_num: "S", st_name: "S", obs_date: "2026-07-21", lat: 30, lng: -97, totalpcpn: 1 },
        ]),
      },
    ]);

    const { getRainfall } = await freshRainfall();
    const [station] = await getRainfall();

    expect(station.day1).toBe(2);
    expect(station.lastReport).toBe("2026-07-23");
    expect(station.day7).toBeCloseTo(3, 10);
  });

  it("accepts numbers delivered as strings", async () => {
    mockFetch([
      {
        body: reports([
          { st_num: "S", st_name: "S", obs_date: "2026-07-23", lat: "30.25", lng: "-97.75", totalpcpn: "0.75" },
        ]),
      },
    ]);

    const { getRainfall } = await freshRainfall();
    const [station] = await getRainfall();

    expect(station.lat).toBe(30.25);
    expect(station.lon).toBe(-97.75);
    expect(station.day7).toBe(0.75);
  });

  it("skips rows with no reading or no position", async () => {
    mockFetch([
      {
        body: reports([
          { st_num: "A", st_name: "A", obs_date: "2026-07-23", lat: 30, lng: -97, totalpcpn: null },
          { st_num: "B", st_name: "B", obs_date: "2026-07-23", lat: null, lng: -97, totalpcpn: 1 },
          { st_num: "C", st_name: "C", obs_date: "2026-07-23", lat: 30, lng: -97, totalpcpn: -1 },
          { st_num: "D", st_name: "D", obs_date: "2026-07-23", lat: 30, lng: -97, totalpcpn: 0.2 },
        ]),
      },
    ]);

    const { getRainfall } = await freshRainfall();
    const stations = await getRainfall();

    expect(stations.map((s) => s.id)).toEqual(["D"]);
  });

  it("returns nothing rather than throwing when the export fails", async () => {
    mockFetch([{ body: "", status: 500 }]);
    const { getRainfall } = await freshRainfall();
    await expect(getRainfall()).resolves.toEqual([]);
  });
});

describe("compactForMap", () => {
  it("plots only stations with measurable rain", async () => {
    const { compactForMap, RAIN_THRESHOLD_IN } = await freshRainfall();

    const out = compactForMap([
      { id: "wet", name: "wet", lat: 30, lon: -97, day1: 0.5, day7: 1.5, lastReport: "2026-07-23" },
      { id: "dry", name: "dry", lat: 30, lon: -97, day1: 0, day7: 0, lastReport: "2026-07-23" },
      { id: "trace", name: "trace", lat: 30, lon: -97, day1: 0, day7: RAIN_THRESHOLD_IN / 2, lastReport: "2026-07-23" },
    ]);

    // On a dry day nearly every station reads zero; plotting them would treble
    // the payload and say nothing.
    expect(out.map((s) => s.id)).toEqual(["wet"]);
  });

  it("rounds to the precision the map renders", async () => {
    const { compactForMap } = await freshRainfall();
    const [out] = compactForMap([
      { id: "s", name: "s", lat: 30.123456, lon: -97.654321, day1: 0.123, day7: 1.567, lastReport: "2026-07-23" },
    ]);

    expect(out.lat).toBe(30.1235);
    expect(out.lon).toBe(-97.6543);
    expect(out.day1).toBe(0.12);
    expect(out.day7).toBe(1.57);
  });
});
