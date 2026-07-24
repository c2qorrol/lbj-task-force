/** CSV serialisation for the API's `?format=csv` responses. */

export type CsvValue = string | number | boolean | null;

function escapeCell(v: CsvValue): string {
  if (v === null) return "";
  const s = String(v);
  // RFC 4180: quote cells containing the delimiter, quotes or newlines.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  // Trailing newline so `cat`/`tail` and naive parsers see a complete last row.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * A download response. The route's `revalidate` still applies — this is the
 * same cached data as the JSON shape, just serialised differently.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
