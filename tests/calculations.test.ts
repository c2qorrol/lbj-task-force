import { describe, expect, it } from "vitest";
import { classifyFlow } from "@/lib/flowstats";
import { computeTrend, summarize } from "@/lib/lakes";
import { computeSupplyOutlook } from "@/lib/supply";
import { exclusiveShares } from "@/lib/drought";
import type { DailyPoint, Reservoir } from "@/lib/types";

/** A reservoir with only the fields the aggregations read. */
function reservoir(over: Partial<Reservoir>): Reservoir {
  return {
    slug: "x",
    name: "X",
    shortName: "X",
    elevation: null,
    area: null,
    storage: null,
    conservationStorage: null,
    conservationCapacity: null,
    conservationPoolElevation: null,
    deadPoolElevation: null,
    percentFull: null,
    isFloodControl: false,
    isTexas: true,
    lat: null,
    lon: null,
    tags: [],
    date: "2026-07-24",
    basin: null,
    region: null,
    climate: null,
    ...over,
  };
}

describe("summarize", () => {
  it("weights statewide fill by storage, not by lake count", () => {
    // A tiny full lake must not offset a huge empty one.
    const stats = summarize([
      reservoir({ conservationStorage: 100, conservationCapacity: 100, percentFull: 100 }),
      reservoir({ conservationStorage: 0, conservationCapacity: 900, percentFull: 0 }),
    ]);

    expect(stats.percentFull).toBeCloseTo(10, 10);
  });

  it("excludes non-Texas reservoirs from every total", () => {
    /*
     * The reason this rule exists: Elephant Butte is 1.96M acre-feet of
     * mostly-empty New Mexico capacity, and counting it moved the statewide
     * figure from TWDB's published 78.3% to 73.8%.
     */
    const withNewMexico = summarize([
      reservoir({ conservationStorage: 780, conservationCapacity: 1000, percentFull: 78 }),
      reservoir({ isTexas: false, conservationStorage: 20, conservationCapacity: 1000, percentFull: 2 }),
    ]);

    expect(withNewMexico.count).toBe(1);
    expect(withNewMexico.totalCapacity).toBe(1000);
    expect(withNewMexico.percentFull).toBeCloseTo(78, 10);
  });

  it("counts status buckets on their documented boundaries", () => {
    const stats = summarize([
      reservoir({ percentFull: 95 }), // full starts at 95
      reservoir({ percentFull: 94.9 }), // neither full nor low
      reservoir({ percentFull: 49.9 }), // low is under 50
      reservoir({ percentFull: 25 }), // still low, not critical
      reservoir({ percentFull: 24.9 }), // critical is under 25
    ]);

    expect({ full: stats.full, low: stats.low, critical: stats.critical }).toEqual({
      full: 1,
      low: 2,
      critical: 1,
    });
  });

  it("reports the newest reading date across the set", () => {
    const stats = summarize([
      reservoir({ date: "2026-07-20" }),
      reservoir({ date: "2026-07-24" }),
      reservoir({ date: "2026-07-22" }),
    ]);
    expect(stats.asOf).toBe("2026-07-24");
  });

  it("does not divide by zero when nothing has capacity", () => {
    expect(summarize([]).percentFull).toBe(0);
  });
});

describe("computeTrend", () => {
  const day = (date: string, waterLevel: number, percentFull: number): DailyPoint => ({
    date,
    waterLevel,
    surfaceArea: null,
    storage: null,
    conservationStorage: null,
    percentFull,
    conservationCapacity: null,
  });

  it("measures from the oldest point inside the window", () => {
    const trend = computeTrend(
      [
        day("2026-06-01", 600, 50), // outside a 7-day window
        day("2026-07-18", 680, 90),
        day("2026-07-24", 681, 92),
      ],
      7,
    );

    expect(trend.change).toBeCloseTo(1, 10);
    expect(trend.percentChange).toBeCloseTo(2, 10);
    expect(trend.direction).toBe("rising");
  });

  it("treats sub-tenth-of-a-foot movement as steady", () => {
    // Inside the noise band of a reservoir stage gage.
    const trend = computeTrend([day("2026-07-18", 681.0, 90), day("2026-07-24", 681.05, 90)], 7);
    expect(trend.direction).toBe("steady");
  });

  it("falls back to the series start when history is shorter than the window", () => {
    const trend = computeTrend([day("2026-07-23", 680, 90), day("2026-07-24", 679, 89)], 30);
    expect(trend.direction).toBe("falling");
    expect(trend.change).toBeCloseTo(-1, 10);
  });

  it("reports unknown rather than guessing from a single reading", () => {
    const trend = computeTrend([day("2026-07-24", 681, 92)], 7);
    expect(trend.direction).toBe("unknown");
    expect(trend.change).toBeNull();
  });
});

describe("computeSupplyOutlook", () => {
  /** A falling series: `days` daily points losing `perDay` acre-feet. */
  function falling(days: number, start: number, perDay: number): DailyPoint[] {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000);
      return {
        date: d.toISOString().slice(0, 10),
        waterLevel: null,
        surfaceArea: null,
        storage: null,
        conservationStorage: start - i * perDay,
        percentFull: null,
        conservationCapacity: null,
      };
    });
  }

  it("projects a depletion date from the drawdown rate", () => {
    const outlook = computeSupplyOutlook(falling(61, 100_000, 100))!;

    expect(outlook.acreFeetPerDay).toBeCloseTo(-100, 6);
    expect(outlook.refilling).toBe(false);
    // 94,000 af remaining at 100 af/day.
    expect(outlook.daysRemaining).toBeCloseTo(940, 0);
  });

  it("gives no depletion date when storage is rising", () => {
    const outlook = computeSupplyOutlook(falling(61, 100_000, -100))!;
    expect(outlook.refilling).toBe(true);
    expect(outlook.daysRemaining).toBeNull();
  });

  it("treats a rate under 1 af/day as flat rather than projecting from noise", () => {
    const outlook = computeSupplyOutlook(falling(61, 100_000, 0.5))!;
    expect(outlook.refilling).toBe(false);
    expect(outlook.daysRemaining).toBeNull();
  });

  it("declines to answer without enough history", () => {
    expect(computeSupplyOutlook(falling(13, 100_000, 100))).toBeNull();
  });

  it("only measures inside the window, ignoring older points", () => {
    const old: DailyPoint[] = [
      {
        date: "2020-01-01",
        waterLevel: null,
        surfaceArea: null,
        storage: null,
        conservationStorage: 5_000_000,
        percentFull: null,
        conservationCapacity: null,
      },
    ];
    const outlook = computeSupplyOutlook([...old, ...falling(61, 100_000, 100)])!;

    // The 2020 point would swamp the rate if it were included.
    expect(outlook.acreFeetPerDay).toBeCloseTo(-100, 6);
    expect(outlook.windowDays).toBe(60);
  });
});

describe("classifyFlow", () => {
  // Site 07308500, July thresholds [p10, p25, p50, p75, p90] = [18, 94, 236, 844, 2230].
  const JULY = new Date("2026-07-15T00:00:00Z");

  it("places readings in the right band", () => {
    expect(classifyFlow("07308500", 10, JULY)!.cls).toBe("much-below");
    expect(classifyFlow("07308500", 50, JULY)!.cls).toBe("below");
    expect(classifyFlow("07308500", 300, JULY)!.cls).toBe("normal");
    expect(classifyFlow("07308500", 1000, JULY)!.cls).toBe("above");
    expect(classifyFlow("07308500", 5000, JULY)!.cls).toBe("much-above");
  });

  it("treats the thresholds themselves as inside the normal range", () => {
    // p25 and p75 are the edges of "normal", not the start of the next band.
    expect(classifyFlow("07308500", 94, JULY)!.cls).toBe("normal");
    expect(classifyFlow("07308500", 844, JULY)!.cls).toBe("normal");
  });

  it("estimates a percentile that tracks the bands and stays in range", () => {
    const low = classifyFlow("07308500", 10, JULY)!;
    const mid = classifyFlow("07308500", 236, JULY)!;
    const high = classifyFlow("07308500", 5000, JULY)!;

    expect(mid.pct).toBe(50);
    expect(low.pct).toBeLessThan(mid.pct);
    expect(high.pct).toBeGreaterThan(mid.pct);
    for (const r of [low, mid, high]) {
      expect(r.pct).toBeGreaterThanOrEqual(1);
      expect(r.pct).toBeLessThanOrEqual(99);
    }
  });

  it("returns null for an unknown site or a missing reading", () => {
    expect(classifyFlow("does-not-exist", 100, JULY)).toBeNull();
    expect(classifyFlow("07308500", null, JULY)).toBeNull();
  });
});

describe("exclusiveShares", () => {
  it("un-nests the cumulative Drought Monitor bands", () => {
    // USDM publishes "D1 or worse", so each band contains the next.
    const shares = exclusiveShares({ none: 0, d0: 100, d1: 80, d2: 50, d3: 20, d4: 5, dsci: 255, worst: "d4" });

    expect(shares).toEqual({ d0: 20, d1: 30, d2: 30, d3: 15, d4: 5 });
    // The exclusive bands must re-sum to the widest cumulative one.
    const total = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it("never returns a negative share when bands are inconsistent", () => {
    const shares = exclusiveShares({ none: 80, d0: 10, d1: 20, d2: 0, d3: 0, d4: 0, dsci: 30, worst: "d1" });
    expect(shares.d0).toBe(0);
  });
});
