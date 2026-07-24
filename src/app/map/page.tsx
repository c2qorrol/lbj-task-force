import type { Metadata } from "next";
import LakeMap from "@/components/LakeMap";
import { getLakeSummaries, summarize } from "@/lib/lakes";
import { getCountyDrought, type CountyDrought } from "@/lib/drought";
import { compactForMap, getRiverGages } from "@/lib/rivers";
import { getNwpsGauges, joinFloodStatus, type NwpsGauge } from "@/lib/nwps";
import {
  compactForMap as compactRainForMap,
  getRainfall,
} from "@/lib/rainfall";
import { fmtDate, fmtPercent } from "@/lib/format";

export const revalidate = 3600;

const DESCRIPTION =
  "Every major Texas reservoir plotted by location and fill status, with a US Drought Monitor overlay by county.";

export const metadata: Metadata = {
  title: "Map",
  description: DESCRIPTION,
  alternates: { canonical: "/map" },
  /*
   * `opengraph-image` files apply to their own segment only — they are not
   * inherited by sibling routes — so routes without a bespoke card point at the
   * site-wide one explicitly. Without this the unfurl has no image at all.
   */
  openGraph: {
    url: "/map",
    title: "Texas reservoir map",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: { card: "summary_large_image", title: "Texas reservoir map", description: DESCRIPTION },
};

export default async function MapPage() {
  const [lakes, drought, rivers, rainfall, nwps] = await Promise.all([
    getLakeSummaries(),
    // Overlays are optional chrome; an upstream outage must not break the map.
    getCountyDrought().catch(() => ({}) as Record<string, CountyDrought>),
    getRiverGages().catch(() => []),
    getRainfall().catch(() => []),
    getNwpsGauges().catch(() => [] as NwpsGauge[]),
  ]);
  const floodBySite = joinFloodStatus(rivers, nwps);
  const stats = summarize(lakes);
  const droughtDate = Object.values(drought)[0]?.mapDate ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Statewide map</h1>
        <p className="text-sm text-muted mt-1">
          {stats.count} reservoirs · statewide storage {fmtPercent(stats.percentFull)} ·
          as of {stats.asOf ? fmtDate(stats.asOf) : "—"}
        </p>
      </div>
      <LakeMap
        lakes={lakes}
        drought={drought}
        droughtDate={droughtDate}
        rivers={compactForMap(rivers, floodBySite)}
        rainfall={compactRainForMap(rainfall)}
      />
    </div>
  );
}
