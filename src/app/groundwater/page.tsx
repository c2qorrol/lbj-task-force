import Link from "next/link";
import type { Metadata } from "next";
import WellMap from "@/components/WellMap";
import { Card, Stat, SectionHeading } from "@/components/ui";
import {
  FRESH_DAYS,
  aquiferColor,
  freshWells,
  getWells,
  summarizeAquifers,
} from "@/lib/groundwater";
import { fmtNumber } from "@/lib/format";

export const revalidate = 3600;

const DESCRIPTION =
  "Water levels in Texas groundwater monitoring wells, by aquifer, from the TWDB recorder network.";

export const metadata: Metadata = {
  title: "Groundwater",
  description: DESCRIPTION,
  alternates: { canonical: "/groundwater" },
  // No bespoke card for this route; fall back to the site-wide image.
  openGraph: {
    url: "/groundwater",
    title: "Texas groundwater levels",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: { card: "summary_large_image", title: "Texas groundwater levels", description: DESCRIPTION },
};

export default async function GroundwaterPage() {
  const wells = await getWells().catch(() => []);
  const fresh = freshWells(wells);
  const summaries = summarizeAquifers(wells);
  const aquifers = summaries.map((s) => s.aquifer);
  const stale = wells.length - fresh.length;

  if (wells.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold">Groundwater</h1>
        <Card>
          <p className="text-sm text-muted">
            TWDB groundwater data is currently unavailable.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Groundwater</h1>
        <p className="text-sm text-muted mt-1">
          TWDB&apos;s recorder-well network — {wells.length} wells across{" "}
          {aquifers.length} aquifers. Groundwater supplies roughly half of all
          water used in Texas, and it is not captured by reservoir levels at all.
        </p>
      </div>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Monitored wells" value={wells.length} sub={`${aquifers.length} aquifers`} />
        <Stat
          label="Reporting recently"
          value={fresh.length}
          sub={`within ${FRESH_DAYS} days`}
        />
        <Stat
          label="Stale records"
          value={stale}
          sub="latest reading is older"
          tone={stale > 0 ? "text-amber-600 dark:text-amber-400" : ""}
        />
        <Stat
          label="Largest network"
          value={summaries[0]?.aquifer ?? "—"}
          sub={`${summaries[0]?.wells ?? 0} wells`}
        />
      </section>

      <Card>
        <h2 className="font-semibold mb-1">Reading these numbers</h2>
        <p className="text-sm text-muted">
          Levels are <strong className="text-foreground">feet below land
          surface</strong>, so a <em>larger</em> number means a{" "}
          <em>deeper</em> water table — an increase is a decline in groundwater,
          the opposite of how reservoir levels read. Wells also sit at very
          different land elevations, so depths cannot be compared between wells.
          Only a single well&apos;s change over time carries meaning.
        </p>
      </Card>

      <section>
        <SectionHeading
          title="Monitoring network"
          subtitle="Filter by aquifer; select a well for its full history"
        />
        <WellMap wells={fresh} aquifers={aquifers} />
      </section>

      <section>
        <SectionHeading
          title="Aquifers"
          subtitle={`Median depth uses only wells reporting within ${FRESH_DAYS} days`}
        />
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Aquifer</th>
                  <th className="px-3 py-2 text-right font-medium">Wells</th>
                  <th className="px-3 py-2 text-right font-medium">Reporting</th>
                  <th className="px-3 py-2 text-right font-medium">Median depth</th>
                  <th className="px-3 py-2 text-right font-medium">Range</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr
                    key={s.aquifer}
                    className="border-b border-border/60 last:border-0 hover:bg-border/25"
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: aquiferColor(s.aquifer, aquifers) }}
                        />
                        {s.aquifer}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right nums">{s.wells}</td>
                    <td className="px-3 py-2 text-right nums text-muted">
                      {s.freshWells}
                    </td>
                    <td className="px-3 py-2 text-right nums">
                      {s.medianDepthFt === null
                        ? "—"
                        : `${fmtNumber(s.medianDepthFt, 1)} ft`}
                    </td>
                    <td className="px-3 py-2 text-right nums text-muted text-xs">
                      {s.minDepthFt === null
                        ? "—"
                        : `${fmtNumber(s.minDepthFt, 0)}–${fmtNumber(s.maxDepthFt, 0)} ft`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted">
        Data from the{" "}
        <a
          className="underline hover:text-foreground"
          href="https://www.waterdatafortexas.org/groundwater"
          target="_blank"
          rel="noreferrer"
        >
          TWDB groundwater monitoring program
        </a>
        . See also{" "}
        <Link href="/" className="underline hover:text-foreground">
          reservoir conditions
        </Link>
        .
      </p>
    </div>
  );
}
