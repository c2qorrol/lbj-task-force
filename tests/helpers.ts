import { vi } from "vitest";

/**
 * Replace global fetch with a queue of canned responses.
 *
 * Every upstream module fetches through the global, so this is enough to drive
 * a parser end to end without a network. Returns the mock so a test can assert
 * on the URL that was requested.
 */
export function mockFetch(
  responses: { body: string | object; status?: number }[],
) {
  const calls: string[] = [];
  let i = 0;

  const fetchMock = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    const status = next.status ?? 200;
    const text =
      typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** A TWDB CSV: ~20 lines of `#` disclaimer, then a header, then rows. */
export function twdbCsv(header: string, rows: string[]): string {
  const preamble = Array.from(
    { length: 20 },
    (_, i) => `# disclaimer line ${i + 1}`,
  ).join("\n");
  return `${preamble}\n${header}\n${rows.join("\n")}\n`;
}

/** One USGS instantaneous-values time series. */
export function nwisSeries(opts: {
  siteId: string;
  siteName?: string;
  paramCode: string;
  values: { value: string; dateTime: string }[];
  lat?: number;
  lon?: number;
  noDataValue?: number;
  unit?: string;
  variableName?: string;
}) {
  return {
    sourceInfo: {
      siteName: opts.siteName ?? `Site ${opts.siteId}`,
      siteCode: [{ value: opts.siteId }],
      geoLocation: {
        geogLocation: {
          latitude: opts.lat ?? 30,
          longitude: opts.lon ?? -97,
        },
      },
    },
    variable: {
      variableCode: [{ value: opts.paramCode }],
      variableName: opts.variableName ?? "Gage height",
      unit: { unitCode: opts.unit ?? "ft" },
      noDataValue: opts.noDataValue,
    },
    values: [{ value: opts.values }],
  };
}
