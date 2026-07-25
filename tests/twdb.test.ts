import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllReservoirs, getStatewideHistory, getHistory } from "@/lib/twdb";
import { mockFetch, twdbCsv } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const FULL_HEADER =
  "date,water_level,surface_area,reservoir_storage,conservation_storage,percent_full,conservation_capacity,dead_pool_capacity";

describe("TWDB CSV parsing", () => {
  it("skips the comment preamble and parses rows", async () => {
    mockFetch([
      {
        body: twdbCsv(FULL_HEADER, [
          "2026-07-01,681.2,18929,1102000,1100000,99.5,1105000,0",
          "2026-07-02,681.5,18950,1104000,1102000,99.7,1105000,0",
        ]),
      },
    ]);

    const points = await getStatewideHistory();

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      date: "2026-07-01",
      waterLevel: 681.2,
      surfaceArea: 18929,
      conservationStorage: 1_100_000,
      percentFull: 99.5,
    });
  });

  it("returns null for empty cells rather than 0 or NaN", async () => {
    mockFetch([
      { body: twdbCsv(FULL_HEADER, ["2026-07-01,,,,,,,"]) },
    ]);

    const [point] = await getStatewideHistory();

    // A gap in the record must not read as "the lake is empty".
    expect(point.waterLevel).toBeNull();
    expect(point.conservationStorage).toBeNull();
    expect(point.percentFull).toBeNull();
  });

  it("resolves columns by name, so a file missing some still parses", async () => {
    // The statewide file carries only storage columns — no elevation or area.
    mockFetch([
      {
        body: twdbCsv(
          "date,reservoir_storage,conservation_storage,percent_full,conservation_capacity",
          ["2026-07-01,24690000,24600000,78.2,31560000"],
        ),
      },
    ]);

    const [point] = await getStatewideHistory();

    expect(point.conservationStorage).toBe(24_600_000);
    expect(point.percentFull).toBe(78.2);
    expect(point.waterLevel).toBeNull();
    expect(point.surfaceArea).toBeNull();
  });

  it("ignores blank lines and rows with no date", async () => {
    mockFetch([
      {
        body: twdbCsv(FULL_HEADER, [
          "2026-07-01,681.2,18929,1102000,1100000,99.5,1105000,0",
          "",
          ",,,,,,,",
        ]),
      },
    ]);

    const points = await getStatewideHistory();
    expect(points).toHaveLength(1);
  });

  it("returns nothing for a file that is all preamble", async () => {
    mockFetch([{ body: twdbCsv(FULL_HEADER, []).split("\n").slice(0, 20).join("\n") }]);
    await expect(getStatewideHistory()).resolves.toEqual([]);
  });

  it("throws on an upstream error rather than reporting an empty lake", async () => {
    mockFetch([{ body: "upstream is unwell", status: 503 }]);
    await expect(getStatewideHistory()).rejects.toThrow(/TWDB 503/);
  });

  it("requests the range-specific file, and the bare slug for the full record", async () => {
    const { calls } = mockFetch([
      { body: twdbCsv(FULL_HEADER, ["2026-07-01,1,2,3,4,5,6,0"]) },
    ]);

    await getHistory("travis", "30day");
    expect(calls[0]).toContain("/individual/travis-30day.csv");

    await getHistory("travis", "all");
    expect(calls[1]).toContain("/individual/travis.csv");
  });
});

describe("TWDB conditions JSON", () => {
  const raw = {
    travis: {
      full_name: "Lake Travis",
      short_name: "Travis",
      elevation: 681.2,
      area: 18929,
      volume: 1_102_000,
      conservation_storage: 1_100_000,
      conservation_capacity: 1_105_000,
      conservation_pool_elevation: 681,
      dead_pool_elevation: 0,
      percent_full: 99.5,
      flood_control_lake: true,
      // GeoJSON order: [lon, lat]. Swapping these puts Texas lakes in Asia.
      gauge_location: { coordinates: [-97.9, 30.4], type: "Point" },
      tags: ["texas", "major", "basin_colorado", "region_lower_colorado", "climate_south_central"],
      timestamp: "2026-07-24",
    },
    "elephant-butte": {
      full_name: "Elephant Butte Lake",
      short_name: "Elephant Butte",
      elevation: null,
      area: null,
      volume: null,
      conservation_storage: 32_212,
      conservation_capacity: 1_960_900,
      conservation_pool_elevation: null,
      dead_pool_elevation: null,
      percent_full: 1.6,
      flood_control_lake: null,
      gauge_location: null,
      tags: ["new_mexico", "major", "municipal_el_paso"],
      timestamp: "2026-07-24",
    },
  };

  it("maps coordinates from GeoJSON [lon, lat] order", async () => {
    mockFetch([{ body: raw }]);
    const all = await getAllReservoirs();
    const travis = all.find((r) => r.name === "Lake Travis")!;

    expect(travis.lat).toBe(30.4);
    expect(travis.lon).toBe(-97.9);
  });

  it("derives basin, region and climate from tags", async () => {
    mockFetch([{ body: raw }]);
    const travis = (await getAllReservoirs()).find((r) => r.name === "Lake Travis")!;

    expect(travis.basin).toBe("Colorado");
    expect(travis.region).toBe("Lower Colorado");
    expect(travis.climate).toBe("South Central");
  });

  it("flags Texas membership from the tag, not from having coordinates", async () => {
    mockFetch([{ body: raw }]);
    const all = await getAllReservoirs();

    expect(all.find((r) => r.name === "Lake Travis")!.isTexas).toBe(true);
    // Tracked as a Texas water source but located in New Mexico.
    expect(all.find((r) => r.name === "Elephant Butte Lake")!.isTexas).toBe(false);
  });

  it("tolerates a reservoir with no gauge location or figures", async () => {
    mockFetch([{ body: raw }]);
    const butte = (await getAllReservoirs()).find(
      (r) => r.name === "Elephant Butte Lake",
    )!;

    expect(butte.lat).toBeNull();
    expect(butte.lon).toBeNull();
    expect(butte.elevation).toBeNull();
    expect(butte.basin).toBeNull();
    expect(butte.isFloodControl).toBe(false);
  });

  it("sorts by name so list order does not depend on object key order", async () => {
    mockFetch([{ body: raw }]);
    const names = (await getAllReservoirs()).map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
