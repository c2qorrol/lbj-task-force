import type { Metadata } from "next";
import CompareView from "@/components/CompareView";
import { getAllReservoirs, getHistory } from "@/lib/twdb";

export const revalidate = 3600;

const DESCRIPTION =
  "Overlay percent-full and storage history for up to four Texas reservoirs on one chart.";

export const metadata: Metadata = {
  title: "Compare",
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  /*
   * `opengraph-image` files apply to their own segment only — they are not
   * inherited by sibling routes — so routes without a bespoke card point at the
   * site-wide one explicitly. Without this the unfurl has no image at all.
   */
  openGraph: {
    url: "/compare",
    title: "Compare Texas reservoirs",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare Texas reservoirs",
    description: DESCRIPTION,
  },
};

/**
 * More than four lines and the chart stops being readable — colours run out
 * faster than that, and each extra lake is another TWDB history request.
 */
const MAX_LAKES = 4;

/**
 * A default pair so the page (and its sitemap entry) lands on a working chart
 * rather than an empty picker. Travis and Buchanan are the two Highland Lakes
 * storage reservoirs — the comparison people most often want.
 */
const DEFAULT_SLUGS = ["travis", "buchanan"];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ lakes?: string | string[] }>;
}) {
  const { lakes: lakesParam } = await searchParams;
  // Names and percent-full come straight from the TWDB feed; the USGS gage
  // join that getLakeSummaries performs is dead weight here.
  const reservoirs = await getAllReservoirs();
  const bySlug = new Map(reservoirs.map((l) => [l.slug, l]));

  const requested = (Array.isArray(lakesParam) ? lakesParam.join(",") : (lakesParam ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => bySlug.has(s));
  const unique = [...new Set(requested)].slice(0, MAX_LAKES);
  const slugs =
    unique.length > 0 ? unique : DEFAULT_SLUGS.filter((s) => bySlug.has(s));

  // A handful of parallel history fetches is well under TWDB's burst threshold,
  // and each is cached at the data layer for 12 h.
  const histories = await Promise.all(
    slugs.map((slug) => getHistory(slug, "1year").catch(() => [])),
  );

  const series = slugs.map((slug, i) => {
    const r = bySlug.get(slug)!;
    return {
      slug,
      name: r.name,
      percentFull: r.percentFull,
      points: histories[i]
        .filter((p) => p.percentFull !== null || p.conservationStorage !== null)
        .map((p) => ({
          date: p.date,
          pct: p.percentFull,
          storage: p.conservationStorage,
        })),
    };
  });

  const options = reservoirs
    .map((l) => ({ slug: l.slug, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Compare reservoirs</h1>
        <p className="text-sm text-muted mt-1">
          Up to {MAX_LAKES} reservoirs on one chart, from a year of daily TWDB
          observations.
        </p>
      </div>
      <CompareView options={options} series={series} maxLakes={MAX_LAKES} />
    </div>
  );
}
