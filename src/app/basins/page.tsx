import Link from "next/link";
import type { Metadata } from "next";
import { Card, FillBar } from "@/components/ui";
import { LinkSpinner } from "@/components/Spinner";
import { getLakeSummaries, groupBy } from "@/lib/lakes";
import { fillStatus, fmtAcreFeet, fmtPercent, STATUS_CLASS } from "@/lib/format";

export const revalidate = 3600;

const DESCRIPTION =
  "Texas reservoir storage aggregated by river basin, showing which watersheds are gaining and which are drawing down.";

export const metadata: Metadata = {
  title: "Basins",
  description: DESCRIPTION,
  alternates: { canonical: "/basins" },
  // No bespoke card for this route; fall back to the site-wide image.
  openGraph: {
    url: "/basins",
    title: "Texas storage by river basin",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: { card: "summary_large_image", title: "Texas storage by river basin", description: DESCRIPTION },
};

export default async function BasinsPage() {
  const lakes = await getLakeSummaries();
  const basins = groupBy(lakes, "basin").sort(
    (a, b) => a.stats.percentFull - b.stats.percentFull,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Storage by river basin</h1>
        <p className="text-sm text-muted mt-1">
          Each basin&apos;s figure is storage-weighted: total conservation storage
          divided by total conservation capacity, so large reservoirs count for
          more than small ones. Sorted driest first.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {basins.map((basin) => (
          <Card key={basin.name}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{basin.name}</h2>
              <span
                className={`nums font-semibold ${STATUS_CLASS[fillStatus(basin.stats.percentFull)]}`}
              >
                {fmtPercent(basin.stats.percentFull)}
              </span>
            </div>
            <FillBar percentFull={basin.stats.percentFull} className="mt-2" />
            <p className="text-xs text-muted mt-2">
              {basin.stats.count} reservoir{basin.stats.count === 1 ? "" : "s"} ·{" "}
              {fmtAcreFeet(basin.stats.totalStorage)} of{" "}
              {fmtAcreFeet(basin.stats.totalCapacity)}
            </p>

            <ul className="mt-3 space-y-1.5 text-sm">
              {[...basin.lakes]
                .sort((a, b) => (a.percentFull ?? 999) - (b.percentFull ?? 999))
                .map((l) => (
                  <li key={l.slug} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/lake/${l.slug}`}
                      className="truncate text-muted hover:text-accent hover:underline inline-flex items-center gap-2"
                    >
                      {l.name}
                      <LinkSpinner />
                    </Link>
                    <span
                      className={`nums text-xs shrink-0 ${STATUS_CLASS[fillStatus(l.percentFull)]}`}
                    >
                      {fmtPercent(l.percentFull)}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
