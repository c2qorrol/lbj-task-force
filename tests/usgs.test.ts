import { afterEach, describe, expect, it, vi } from "vitest";
import { getGageSeries, getTexasLakeGages } from "@/lib/usgs";
import { mockFetch, nwisSeries } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("USGS instantaneous values", () => {
  it("takes the newest reading, not the first", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "08154900",
                paramCode: "62614",
                values: [
                  { value: "492.10", dateTime: "2026-07-24T10:00:00.000-05:00" },
                  { value: "492.39", dateTime: "2026-07-24T17:40:00.000-05:00" },
                ],
              }),
            ],
          },
        },
      },
    ]);

    const [reading] = await getTexasLakeGages();
    expect(reading.value).toBe(492.39);
    expect(reading.observedAt).toBe("2026-07-24T17:40:00.000-05:00");
  });

  it("drops the -999999 missing sentinel instead of charting it", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "08154900",
                paramCode: "62614",
                values: [{ value: "-999999", dateTime: "2026-07-24T17:40:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    // A sentinel elevation must remove the gage, not report it at -999999 ft.
    await expect(getTexasLakeGages()).resolves.toEqual([]);
  });

  it("honours a per-series noDataValue", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "08154900",
                paramCode: "62614",
                noDataValue: -99999,
                values: [{ value: "-99999", dateTime: "2026-07-24T17:40:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    await expect(getTexasLakeGages()).resolves.toEqual([]);
  });

  it("labels known parameter codes and falls back to the feed's own name", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "a",
                paramCode: "62614",
                values: [{ value: "1", dateTime: "2026-07-24T00:00:00Z" }],
              }),
              nwisSeries({
                siteId: "b",
                paramCode: "99999",
                variableName: "Something unmapped",
                values: [{ value: "2", dateTime: "2026-07-24T00:00:00Z" }],
              }),
            ],
          },
        },
      },
    ]);

    const readings = await getTexasLakeGages();
    const byId = Object.fromEntries(readings.map((r) => [r.siteId, r]));
    expect(byId.a.parameterName).toBe("Lake elevation (NAVD88)");
    expect(byId.b.parameterName).toBe("Something unmapped");
  });

  it("treats 404 as 'no data for this site', not as an outage", async () => {
    mockFetch([{ body: "", status: 404 }]);
    await expect(getTexasLakeGages()).resolves.toEqual([]);
  });

  it("throws on a real upstream failure", async () => {
    mockFetch([{ body: "", status: 500 }]);
    await expect(getTexasLakeGages()).rejects.toThrow(/USGS 500/);
  });

  it("skips the request entirely when asked for no sites", async () => {
    const { fetchMock } = mockFetch([{ body: {} }]);
    await expect(getGageSeries([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters sentinels out of a series while keeping the surrounding points", async () => {
    mockFetch([
      {
        body: {
          value: {
            timeSeries: [
              nwisSeries({
                siteId: "08154900",
                paramCode: "62614",
                values: [
                  { value: "492.10", dateTime: "2026-07-24T10:00:00Z" },
                  { value: "-999999", dateTime: "2026-07-24T10:15:00Z" },
                  { value: "492.20", dateTime: "2026-07-24T10:30:00Z" },
                ],
              }),
            ],
          },
        },
      },
    ]);

    const [series] = await getGageSeries(["08154900"]);
    expect(series.points.map((p) => p.v)).toEqual([492.1, 492.2]);
  });
});
