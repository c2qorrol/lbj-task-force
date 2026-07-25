import { describe, expect, it } from "vitest";
import { parse as parseHistory, encode } from "../scripts/sync-history-stats.mjs";
import { compactRing, round } from "../scripts/sync-counties.mjs";
import { rankSeries } from "../scripts/sync-usace.mjs";
import { tokens, nameOverlap, matchLakeGage } from "../scripts/sync-flow-gages.mjs";

function twdbCsv(rows: string[]) {
  return [
    "# disclaimer",
    "# more disclaimer",
    "date,water_level,surface_area,reservoir_storage,conservation_storage,percent_full,conservation_capacity,dead_pool_capacity",
    ...rows,
  ].join("\n");
}

describe("history: parse", () => {
  it("pulls date and percent full out of the full-width CSV", () => {
    const rows = parseHistory(
      twdbCsv(["1940-09-30,681.2,18929,1102000,1100000,21.6,1105000,0"]),
    );
    expect(rows).toEqual([{ date: "1940-09-30", value: 21.6 }]);
  });

  it("keeps a gap as null instead of zero", () => {
    // A missing reading must not be encoded as an empty reservoir.
    const rows = parseHistory(twdbCsv(["1940-09-30,,,,,,,"]));
    expect(rows[0].value).toBeNull();
  });

  it("sorts by date, since the encoding assumes ascending order", () => {
    const rows = parseHistory(
      twdbCsv([
        "1941-01-01,,,,,50,,",
        "1940-09-30,,,,,21.6,,",
        "1940-12-31,,,,,40,,",
      ]),
    );
    expect(rows.map((r: { date: string }) => r.date)).toEqual([
      "1940-09-30",
      "1940-12-31",
      "1941-01-01",
    ]);
  });

  it("returns nothing when the columns it needs are absent", () => {
    expect(parseHistory("# only comments\ndate,something_else\n2020-01-01,5")).toEqual([]);
  });
});

describe("history: encode", () => {
  const day = (offset: number) =>
    new Date(Date.UTC(2020, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);

  /** Encoding needs a year of readings, so fixtures have to be long. */
  const year = (from: number, value = 50) =>
    Array.from({ length: 400 }, (_, i) => ({ date: day(from + i), value }));

  it("indexes by days since the first reading and stores tenths", () => {
    const encoded = encode([
      { date: day(0), value: 21.6 },
      { date: day(1), value: null }, // a gap in the record
      ...year(2, 22.0),
    ])!;

    expect(encoded.first).toBe("2020-01-01");
    expect(encoded.values[0]).toBe(216); // 21.6% stored as tenths
    expect(encoded.values[1]).toBeNull(); // the gap survives as a gap
    expect(encoded.values[2]).toBe(220);
  });

  it("anchors on the first row that actually has a value", () => {
    const encoded = encode([{ date: "2019-12-31", value: null }, ...year(0)])!;

    // The leading null must not shift every index by one.
    expect(encoded.first).toBe("2020-01-01");
    expect(encoded.values[0]).toBe(500);
    expect(encoded.values).toHaveLength(400);
  });

  it("refuses a series with under a year of readings", () => {
    // Percentile bands drawn from a handful of points would be meaningless.
    expect(encode([{ date: "2020-01-01", value: 50 }])).toBeNull();
  });

  it("round-trips a long series without drifting", () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      date: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
      value: 50 + (i % 10) / 10,
    }));
    const encoded = encode(rows)!;

    expect(encoded.values).toHaveLength(400);
    expect(encoded.values[0]).toBe(500);
    expect(encoded.values[399]).toBe(Math.round(rows[399].value * 10));
    expect(encoded.values.filter((v: number | null) => v === null)).toHaveLength(0);
  });
});

describe("counties: geometry compaction", () => {
  it("rounds to three decimals, about 100 m", () => {
    expect(round(-97.694455)).toBe(-97.694);
  });

  it("flattens rings to [lon, lat, lon, lat, …]", () => {
    expect(compactRing([[-97.1, 30.1], [-97.2, 30.2]])).toEqual([-97.1, 30.1, -97.2, 30.2]);
  });

  it("drops points that rounding made duplicates", () => {
    // The whole point of the pass: neighbouring vertices collapse at 3dp.
    const flat = compactRing([
      [-97.10001, 30.10001],
      [-97.10002, 30.10002],
      [-97.2, 30.2],
    ]);
    expect(flat).toEqual([-97.1, 30.1, -97.2, 30.2]);
  });

  it("keeps a point that returns to an earlier position", () => {
    // Only *consecutive* duplicates go; a ring legitimately revisits.
    const flat = compactRing([[-97.1, 30.1], [-97.2, 30.2], [-97.1, 30.1]]);
    expect(flat).toHaveLength(6);
  });
});

describe("USACE: series ranking", () => {
  const POOL = "LAKE.Elev.Inst.15Minutes.0.Ccp-Rev";

  it("rejects anything that is not an instantaneous elevation", () => {
    expect(rankSeries("LAKE.Stor.Inst.15Minutes.0.Ccp-Rev")).toBe(-1);
    expect(rankSeries("LAKE.Flow.Inst.1Hour.0.Rev-SCADA")).toBe(-1);
  });

  it("rejects tailwater, alternate datums and forecasts", () => {
    // These are elevations, but not the pool elevation we report.
    expect(rankSeries("LAKE-Tailwater.Elev.Inst.15Minutes.0.Ccp-Rev")).toBe(-1);
    expect(rankSeries("LAKE.Elev-Alt.Inst.15Minutes.0.Ccp-Rev")).toBe(-1);
    expect(rankSeries("LAKE.Elev.Inst.1Hour.0.Forecast")).toBe(-1);
  });

  it("prefers revised data over raw telemetry", () => {
    expect(rankSeries(POOL)).toBeGreaterThan(
      rankSeries("LAKE.Elev.Inst.15Minutes.0.Rev-SCADA"),
    );
    expect(rankSeries("LAKE.Elev.Inst.15Minutes.0.Rev-SCADA")).toBeGreaterThan(
      rankSeries("LAKE.Elev.Inst.15Minutes.0.Decodes-Raw"),
    );
  });

  it("prefers finer intervals, and penalises monthly", () => {
    expect(rankSeries(POOL)).toBeGreaterThan(rankSeries("LAKE.Elev.Inst.1Hour.0.Ccp-Rev"));
    expect(rankSeries("LAKE.Elev.Inst.1Month.0.Ccp-Rev")).toBeLessThan(
      rankSeries("LAKE.Elev.Inst.1Day.0.Ccp-Rev"),
    );
  });

  it("ranks the ideal series above every alternative", () => {
    const others = [
      "LAKE.Elev.Inst.1Hour.0.Rev-SCADA",
      "LAKE.Elev.Inst.1Day.0.Decodes-Raw",
      "LAKE.Elev.Inst.1Month.0.Ccp-Rev",
    ];
    for (const other of others) expect(rankSeries(POOL)).toBeGreaterThan(rankSeries(other));
  });
});

describe("flow gages: name matching", () => {
  it("strips the words that carry no signal", () => {
    // "Lake", "near", "TX" appear in half the catalogue.
    expect([...tokens("Lake Travis nr Austin, TX")]).toEqual(["travis", "austin"]);
  });

  it("matches on a shared distinctive word", () => {
    expect(nameOverlap("Lake Travis", "LCRA Lk Travis nr Austin, TX")).toBe(true);
  });

  it("does not match two lakes that share only filler words", () => {
    expect(nameOverlap("Lake Somerville", "Lk Georgetown nr Georgetown, TX")).toBe(false);
  });
});

describe("flow gages: gage matching", () => {
  const reservoir = {
    full_name: "Lake Travis",
    // GeoJSON order: [lon, lat].
    gauge_location: { coordinates: [-97.9, 30.4] },
  };

  it("takes a nearby gage without needing the name to agree", () => {
    const gage = { siteId: "1", siteName: "Completely Different Name", lat: 30.41, lon: -97.9 };
    expect(matchLakeGage(reservoir, [gage])?.siteId).toBe("1");
  });

  it("requires a shared name for a distant gage", () => {
    // ~22 km away: inside the loose radius, outside the tight one.
    const far = { siteId: "2", siteName: "Unrelated Creek", lat: 30.6, lon: -97.9 };
    expect(matchLakeGage(reservoir, [far])).toBeNull();

    const farButNamed = { siteId: "3", siteName: "LCRA Lk Travis", lat: 30.6, lon: -97.9 };
    expect(matchLakeGage(reservoir, [farButNamed])?.siteId).toBe("3");
  });

  it("ignores a gage beyond the outer radius even when the name matches", () => {
    const veryFar = { siteId: "4", siteName: "Lake Travis", lat: 31.5, lon: -97.9 };
    expect(matchLakeGage(reservoir, [veryFar])).toBeNull();
  });

  it("prefers the closest candidate", () => {
    const gages = [
      { siteId: "near", siteName: "Travis A", lat: 30.405, lon: -97.9 },
      { siteId: "nearer", siteName: "Travis B", lat: 30.4, lon: -97.9 },
    ];
    expect(matchLakeGage(reservoir, gages)?.siteId).toBe("nearer");
  });

  it("returns null for a reservoir with no published location", () => {
    expect(matchLakeGage({ full_name: "X", gauge_location: null }, [])).toBeNull();
  });
});
