import { NextResponse } from "next/server";
import { getLakeDetail } from "@/lib/lakes";
import { getHistory, type HistoryRange } from "@/lib/twdb";
import { getGageSeries } from "@/lib/usgs";
import { getHistoricalContext } from "@/lib/history";
import { getLakeFlow } from "@/lib/flow";
import { csvResponse, toCsv } from "@/lib/csv";

export const revalidate = 900;

const RANGES: HistoryRange[] = ["30day", "1year", "all"];

/**
 * GET /api/lakes/:slug
 *
 * Optional:
 *   ?range=30day|1year|all   daily history window (default 1year)
 *   ?gage=1                  include the 7-day real-time gage trace
 *   ?context=1               include period-of-record percentile context
 *   ?flow=1                  include inflow/release river gages
 *   ?format=csv              the daily history alone, as a download
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") as HistoryRange | null;
  const range = rangeParam && RANGES.includes(rangeParam) ? rangeParam : "1year";
  const wantGage = searchParams.get("gage") === "1";
  const wantContext = searchParams.get("context") === "1";
  const wantFlow = searchParams.get("flow") === "1";
  const wantCsv = searchParams.get("format") === "csv";

  try {
    const detail = await getLakeDetail(slug);
    if (!detail) {
      return NextResponse.json({ error: `Unknown reservoir: ${slug}` }, { status: 404 });
    }

    // getLakeDetail already loaded 1-year history; only refetch on a different range.
    const history =
      range === "1year" ? detail.history : await getHistory(slug, range);

    if (wantCsv) {
      return csvResponse(
        toCsv(
          [
            "date",
            "water_level_ft",
            "surface_area_ac",
            "reservoir_storage_af",
            "conservation_storage_af",
            "percent_full",
            "conservation_capacity_af",
          ],
          history.map((p) => [
            p.date,
            p.waterLevel,
            p.surfaceArea,
            p.storage,
            p.conservationStorage,
            p.percentFull,
            p.conservationCapacity,
          ]),
        ),
        `${slug}-${range}.csv`,
      );
    }

    const gageSeries =
      wantGage && detail.gage
        ? await getGageSeries([detail.gage.siteId], 7).catch(() => [])
        : undefined;

    const [historical, flow] = await Promise.all([
      wantContext ? getHistoricalContext(slug).catch(() => null) : null,
      wantFlow ? getLakeFlow(slug).catch(() => null) : null,
    ]);

    return NextResponse.json({
      reservoir: detail.reservoir,
      gage: detail.gage,
      trends: { sevenDay: detail.trend7, thirtyDay: detail.trend30 },
      history,
      ...(gageSeries ? { gageSeries } : {}),
      ...(historical ? { historicalContext: historical.context } : {}),
      ...(flow ? { flow } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upstream data unavailable", detail: String(error) },
      { status: 502 },
    );
  }
}
