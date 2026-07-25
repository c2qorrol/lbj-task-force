import { describe, expect, it } from "vitest";
import { parseRdb, median, compact } from "../scripts/sync-flow-percentiles.mjs";

/**
 * RDB is USGS's tab-separated format: `#` comment lines, a header row, then a
 * row of column *widths* that looks like data and must be skipped, then the
 * rows themselves.
 */
function rdb(rows: string[][], header?: string[]) {
  const cols =
    header ??
    ["agency_cd", "site_no", "parameter_cd", "month_nu", "day_nu", "count_nu",
     "p10_va", "p25_va", "p50_va", "p75_va", "p90_va"];
  return [
    "# US Geological Survey",
    "# retrieved: 2026-07-24",
    cols.join("\t"),
    cols.map(() => "5s").join("\t"),
    ...rows.map((r) => r.join("\t")),
  ].join("\n");
}

const row = (opts: {
  site?: string;
  month?: string;
  day?: string;
  years?: string;
  p?: [string, string, string, string, string];
}) => [
  "USGS",
  opts.site ?? "08158000",
  "00060",
  opts.month ?? "7",
  opts.day ?? "1",
  opts.years ?? "50",
  ...(opts.p ?? ["18", "94", "236", "844", "2230"]),
];

describe("parseRdb", () => {
  it("skips the comment preamble and the column-width row", () => {
    const out = new Map();
    parseRdb(rdb([row({ day: "1" }), row({ day: "2" })]), out);

    // Two day-rows for July, and the width row must not have become a third.
    expect(out.get("08158000").get(7)).toHaveLength(2);
  });

  it("groups by site and month", () => {
    const out = new Map();
    parseRdb(
      rdb([
        row({ site: "A", month: "7" }),
        row({ site: "A", month: "8" }),
        row({ site: "B", month: "7" }),
      ]),
      out,
    );

    expect([...out.keys()].sort()).toEqual(["A", "B"]);
    expect([...out.get("A").keys()].sort()).toEqual([7, 8]);
  });

  it("resolves columns by name, so a reordered response still parses", () => {
    // USGS is free to add or move columns; positional parsing would break.
    const header = ["site_no", "p90_va", "p75_va", "p50_va", "p25_va", "p10_va", "count_nu", "month_nu"];
    const out = new Map();
    parseRdb(
      [
        "# comment",
        header.join("\t"),
        header.map(() => "5s").join("\t"),
        ["08158000", "2230", "844", "236", "94", "18", "50", "7"].join("\t"),
      ].join("\n"),
      out,
    );

    expect(out.get("08158000").get(7)[0]).toEqual([18, 94, 236, 844, 2230]);
  });

  it("drops rows with too short a period of record", () => {
    const out = new Map();
    parseRdb(rdb([row({ years: "9" }), row({ years: "10", day: "2" })]), out);

    // 10 years is the documented floor, so 9 goes and 10 stays.
    expect(out.get("08158000").get(7)).toHaveLength(1);
  });

  it("drops rows with a non-numeric threshold", () => {
    const out = new Map();
    parseRdb(rdb([row({ p: ["18", "94", "", "844", "2230"] }), row({ day: "2" })]), out);

    expect(out.get("08158000").get(7)).toHaveLength(1);
  });

  it("ignores an impossible month", () => {
    const out = new Map();
    parseRdb(rdb([row({ month: "0" }), row({ month: "13" })]), out);
    expect(out.size).toBe(0);
  });

  it("returns quietly on a response missing the columns it needs", () => {
    const out = new Map();
    // An error page, or a parameter with no statistics.
    parseRdb(rdb([["USGS", "08158000"]], ["agency_cd", "site_no"]), out);
    expect(out.size).toBe(0);
  });

  it("returns quietly on an empty response", () => {
    const out = new Map();
    parseRdb("", out);
    parseRdb("# only comments\n", out);
    expect(out.size).toBe(0);
  });

  it("accumulates across calls, since sites arrive in batches of ten", () => {
    const out = new Map();
    parseRdb(rdb([row({ site: "A" })]), out);
    parseRdb(rdb([row({ site: "B" })]), out);
    expect([...out.keys()].sort()).toEqual(["A", "B"]);
  });
});

describe("median", () => {
  it("takes the middle of an odd-length set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate the caller's array", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("sorts numerically, not lexicographically", () => {
    // The default Array#sort would put 100 before 9 and return the wrong value.
    expect(median([9, 100, 11])).toBe(11);
  });
});

describe("compact", () => {
  it("rounds large flows to whole cfs", () => {
    expect(compact(2230.4)).toBe(2230);
    expect(compact(100)).toBe(100);
  });

  it("keeps a decimal on small flows, where it still means something", () => {
    expect(compact(18.44)).toBe(18.4);
    expect(compact(0.06)).toBe(0.1);
  });
});
