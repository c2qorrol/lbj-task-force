import Link from "next/link";
import type { Metadata } from "next";
import DroughtTrend from "@/components/DroughtTrend";
import StorageVsDrought from "@/components/StorageVsDrought";
import { getStatewideHistoryContext } from "@/lib/history";
import { Card, Stat, SectionHeading } from "@/components/ui";
import { LinkSpinner } from "@/components/Spinner";
import {
  DROUGHT_HEX,
  DROUGHT_LABEL,
  DROUGHT_ORDER,
  alignStorageToWeeks,
  countyForPoint,
  getCountyDrought,
  getStatewideDroughtHistory,
  type CountyDrought,
  type DroughtWeek,
} from "@/lib/drought";
import { getLakeSummaries, summarize } from "@/lib/lakes";
import { fillStatus, fmtDate, fmtPercent, STATUS_CLASS } from "@/lib/format";

export const revalidate = 3600;

const DESCRIPTION =
  "US Drought Monitor conditions across Texas, and how they line up with reservoir storage.";

export const metadata: Metadata = {
  title: "Drought",
  description: DESCRIPTION,
  alternates: { canonical: "/drought" },
  openGraph: { url: "/drought", title: "Texas drought conditions", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Texas drought conditions", description: DESCRIPTION },
};

export default async function DroughtPage() {
  const [counties, weeks, lakes, statewide] = await Promise.all([
    getCountyDrought().catch(() => ({}) as Record<string, CountyDrought>),
    getStatewideDroughtHistory(26).catch(() => [] as DroughtWeek[]),
    getLakeSummaries(),
    getStatewideHistoryContext().catch(() => null),
  ]);

  /*
   * Aligned on the server: the raw statewide series is ~34,000 daily points
   * back to 1933, and serialising it to the client made this page 2.9 MB and
   * left the charts blank for seconds while it hydrated.
   */
  const weeksWithStorage =
    statewide && weeks.length > 0
      ? alignStorageToWeeks(weeks, statewide.series)
      : [];

  const latest = weeks[weeks.length - 1] ?? null;
  const yearAgo = weeks.find(
    (w) => w.date >= shiftYear(latest?.date ?? "", -1),
  );
  const stats = summarize(lakes);

  const countyList = Object.values(counties).sort((a, b) => b.dsci - a.dsci);
  const driest = countyList.slice(0, 12);

  /*
   * Reservoirs in the counties currently under the deepest drought. This is the
   * join the two datasets exist to support: which supplies sit where it is
   * driest.
   */
  const stressed = lakes
    .map((lake) => {
      if (lake.lat === null || lake.lon === null) return null;
      const county = countyForPoint(lake.lat, lake.lon);
      const drought = county ? counties[county.fips] : undefined;
      if (!drought || drought.dsci <= 0) return null;
      return { lake, county: county!.name, drought };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.drought.dsci - a.drought.dsci || (a.lake.percentFull ?? 100) - (b.lake.percentFull ?? 100))
    .slice(0, 12);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">Drought conditions</h1>
        <p className="text-sm text-muted mt-1">
          US Drought Monitor, published weekly
          {latest ? ` · current map ${fmtDate(latest.date)}` : ""} · alongside
          statewide reservoir storage
        </p>
      </div>

      {latest ? (
        <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Stat
            label="Any drought (D1+)"
            value={fmtPercent(latest.d1, 0)}
            sub={
              yearAgo
                ? `${signed(latest.d1 - yearAgo.d1)} vs a year ago`
                : "of Texas area"
            }
          />
          <Stat
            label="Severe+ (D2+)"
            value={fmtPercent(latest.d2, 0)}
            sub="severe, extreme or exceptional"
          />
          <Stat
            label="DSCI"
            value={String(latest.dsci)}
            sub={
              yearAgo ? `${signed(latest.dsci - yearAgo.dsci, 0)} vs a year ago` : "0–500 scale"
            }
          />
          <Stat
            label="Statewide storage"
            value={fmtPercent(stats.percentFull)}
            tone={STATUS_CLASS[fillStatus(stats.percentFull)]}
            sub={
              statewide?.context.percentile !== undefined &&
              statewide?.context.percentile !== null
                ? `${Math.round(statewide.context.percentile)}th percentile for this date`
                : `as of ${stats.asOf ? fmtDate(stats.asOf) : "—"}`
            }
          />
        </section>
      ) : null}

      {statewide ? (
        <Card>
          <h2 className="font-semibold">Statewide storage in context</h2>
          <p className="text-sm mt-2">{statewideHeadline(statewide.context)}</p>
          <p className="text-xs text-muted mt-2">
            TWDB has aggregated statewide storage daily since{" "}
            {fmtDate(statewide.context.firstDate)}. The record low for this date
            is {fmtPercent(statewide.context.recordLow?.value ?? null, 1)} in{" "}
            {statewide.context.recordLow?.date.slice(0, 4) ?? "—"}; the record
            high is {fmtPercent(statewide.context.recordHigh?.value ?? null, 1)}{" "}
            in {statewide.context.recordHigh?.date.slice(0, 4) ?? "—"}.
          </p>
        </Card>
      ) : null}

      {weeksWithStorage.length > 0 ? (
        <StorageVsDrought weeks={weeksWithStorage} />
      ) : null}

      {weeks.length > 0 ? <DroughtTrend weeks={weeks} /> : null}

      {stressed.length > 0 ? (
        <section>
          <SectionHeading
            title="Reservoirs in the driest counties"
            subtitle="Ranked by the drought severity where the reservoir sits, not by how full it is"
          />
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Reservoir</th>
                    <th className="px-3 py-2 text-left font-medium">County</th>
                    <th className="px-3 py-2 text-left font-medium">Drought</th>
                    <th className="px-3 py-2 text-right font-medium">DSCI</th>
                    <th className="px-3 py-2 text-right font-medium">% Full</th>
                  </tr>
                </thead>
                <tbody>
                  {stressed.map(({ lake, county, drought }) => (
                    <tr
                      key={lake.slug}
                      className="border-b border-border/60 last:border-0 hover:bg-border/25"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/lake/${lake.slug}`}
                          className="font-medium hover:text-accent hover:underline inline-flex items-center gap-2"
                        >
                          {lake.name}
                          <LinkSpinner />
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted text-xs">{county}</td>
                      <td className="px-3 py-2">
                        <DroughtChip category={drought.worst} />
                      </td>
                      <td className="px-3 py-2 text-right nums">{drought.dsci}</td>
                      <td
                        className={`px-3 py-2 text-right nums font-semibold ${STATUS_CLASS[fillStatus(lake.percentFull)]}`}
                      >
                        {fmtPercent(lake.percentFull)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Drought where a reservoir sits does not by itself explain its level:
            most reservoirs are filled by a watershed reaching far upstream, and
            releases are managed. Treat this as context, not causation.
          </p>
        </section>
      ) : null}

      {driest.length > 0 ? (
        <section>
          <SectionHeading
            title="Driest counties"
            subtitle="By Drought Severity and Coverage Index (0–500)"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {driest.map((county) => (
              <Card key={county.fips}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{county.county} County</span>
                  <span className="nums font-semibold">{county.dsci}</span>
                </div>
                <div className="mt-2">
                  <DroughtBar county={county} />
                </div>
                <div className="mt-1.5">
                  <DroughtChip category={county.worst} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted">
        Drought data from the{" "}
        <a
          className="underline hover:text-foreground"
          href="https://droughtmonitor.unl.edu/"
          target="_blank"
          rel="noreferrer"
        >
          US Drought Monitor
        </a>
        , a joint product of NDMC, USDA and NOAA. See the{" "}
        <Link href="/map" className="underline hover:text-foreground">
          statewide map
        </Link>{" "}
        for the county overlay.
      </p>
    </div>
  );
}

function statewideHeadline(context: {
  percentile: number | null;
  current: number | null;
  firstDate: string;
  lastLowerYear: number | null;
  lastHigherYear: number | null;
}): string {
  const { percentile, current } = context;
  if (percentile === null || current === null) {
    return "Statewide storage history is unavailable.";
  }
  const rounded = Math.round(percentile);
  const year = context.firstDate.slice(0, 4);
  const level = fmtPercent(current, 1);

  if (rounded < 50) {
    return `Texas reservoirs hold ${level} of conservation capacity — below ${100 - rounded}% of years on this date since ${year}.${context.lastLowerYear ? ` Storage was last this low in ${context.lastLowerYear}.` : ""}`;
  }
  return `Texas reservoirs hold ${level} of conservation capacity — above ${rounded}% of years on this date since ${year}.${context.lastHigherYear ? ` Storage was last this high in ${context.lastHigherYear}.` : ""}`;
}

function signed(value: number, digits = 0): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

function shiftYear(iso: string, delta: number): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

function DroughtChip({ category }: { category: CountyDrought["worst"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className="h-2.5 w-2.5 rounded-sm border border-border"
        style={{ background: DROUGHT_HEX[category] }}
      />
      {DROUGHT_LABEL[category]}
    </span>
  );
}

/** Stacked exclusive shares, so the bar sums to the county's total area. */
function DroughtBar({ county }: { county: CountyDrought }) {
  const segments = DROUGHT_ORDER.map((key, index) => {
    const next = DROUGHT_ORDER[index - 1];
    const width = next ? county[key] - county[next] : county[key];
    return { key, width: Math.max(0, width) };
  }).reverse();

  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-border/70">
      {segments.map((s) =>
        s.width > 0 ? (
          <div
            key={s.key}
            style={{ width: `${s.width}%`, background: DROUGHT_HEX[s.key] }}
            title={`${DROUGHT_LABEL[s.key]}: ${s.width.toFixed(0)}%`}
          />
        ) : null,
      )}
    </div>
  );
}
