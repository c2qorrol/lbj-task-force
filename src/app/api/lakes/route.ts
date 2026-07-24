import { NextResponse } from "next/server";
import { getLakeSummaries, summarize, type LakeSummary } from "@/lib/lakes";
import { fillStatus } from "@/lib/format";
import { csvResponse, toCsv, type CsvValue } from "@/lib/csv";

export const revalidate = 3600;

function toCsvRows(lakes: LakeSummary[]): CsvValue[][] {
  return lakes.map((l) => [
    l.slug,
    l.name,
    l.basin,
    l.region,
    l.date,
    l.percentFull,
    fillStatus(l.percentFull),
    l.elevation,
    l.conservationPoolElevation,
    l.conservationStorage,
    l.conservationCapacity,
    l.area,
    l.isTexas,
    l.gage?.siteId ?? null,
  ]);
}

const CSV_HEADER = [
  "slug",
  "name",
  "basin",
  "region",
  "date",
  "percent_full",
  "status",
  "elevation_ft",
  "conservation_pool_elevation_ft",
  "conservation_storage_af",
  "conservation_capacity_af",
  "surface_area_ac",
  "is_texas",
  "usgs_gage",
];

/**
 * GET /api/lakes
 *
 * Statewide snapshot. Optional filters:
 *   ?basin=Colorado   restrict to one river basin
 *   ?status=critical  flood | full | normal | low | critical
 *   ?format=csv       spreadsheet-friendly download instead of JSON
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const basin = searchParams.get("basin");
  const status = searchParams.get("status");
  const wantCsv = searchParams.get("format") === "csv";

  try {
    const all = await getLakeSummaries();
    const lakes = all.filter((l) => {
      if (basin && l.basin?.toLowerCase() !== basin.toLowerCase()) return false;
      if (status && fillStatus(l.percentFull) !== status) return false;
      return true;
    });

    if (wantCsv) {
      const asOf = summarize(lakes).asOf || "latest";
      return csvResponse(
        toCsv(CSV_HEADER, toCsvRows(lakes)),
        `texas-reservoirs-${asOf}.csv`,
      );
    }

    return NextResponse.json({
      summary: summarize(lakes),
      lakes,
      sources: {
        twdb: "https://www.waterdatafortexas.org/reservoirs/statewide",
        usgs: "https://waterservices.usgs.gov/nwis/iv/",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upstream data unavailable", detail: String(error) },
      { status: 502 },
    );
  }
}
