import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WellChart from "@/components/WellChart";
import { Card, Stat, SectionHeading } from "@/components/ui";
import { getWellHistory, getWells } from "@/lib/groundwater";
import { fmtDate, fmtNumber } from "@/lib/format";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ well: string }>;
}): Promise<Metadata> {
  const { well } = await params;
  const title = `Well ${well}`;
  const description = `Groundwater level history for TWDB monitoring well ${well}.`;
  const url = `/groundwater/${well}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function WellPage({
  params,
}: {
  params: Promise<{ well: string }>;
}) {
  const { well: wellNumber } = await params;

  const [wells, history] = await Promise.all([
    getWells().catch(() => []),
    getWellHistory(wellNumber),
  ]);

  const well = wells.find((w) => w.number === wellNumber);
  if (!well && !history) notFound();

  /*
   * Positive change means the water table got deeper. The UI never shows the
   * raw sign — it says "fell" or "rose" — because a bare "+4.2 ft" reads as an
   * improvement when it is the opposite.
   */
  const yearChange = history?.yearChangeFt ?? null;
  const recordChange = history?.recordChangeFt ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/groundwater" className="text-sm text-muted hover:text-foreground">
          ← All monitoring wells
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold mt-2">
          Well {wellNumber}
        </h1>
        {well ? (
          <p className="text-sm text-muted mt-1">
            {[well.aquifer, well.county ? `${well.county} County` : null, well.aquiferType]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat
          label="Current depth"
          value={well ? `${fmtNumber(well.depthFt, 1)} ft` : "—"}
          sub={well ? `below land surface · ${fmtDate(well.date)}` : undefined}
        />
        <Stat
          label="Past year"
          value={yearChange === null ? "—" : changeLabel(yearChange)}
          tone={toneFor(yearChange)}
          sub={yearChange === null ? "insufficient record" : "water table"}
        />
        <Stat
          label="Full record"
          value={recordChange === null ? "—" : changeLabel(recordChange)}
          tone={toneFor(recordChange)}
          sub={
            history ? `since ${history.firstDate.slice(0, 4)}` : "no history"
          }
        />
        <Stat
          label="Record range"
          value={
            history?.shallowest && history?.deepest
              ? `${fmtNumber(history.shallowest.depthFt, 0)}–${fmtNumber(history.deepest.depthFt, 0)} ft`
              : "—"
          }
          sub="shallowest to deepest"
        />
      </section>

      {history ? (
        <section>
          <SectionHeading
            title="History"
            subtitle={`Daily readings, ${fmtDate(history.firstDate)} to ${fmtDate(history.lastDate)}`}
          />
          <WellChart points={history.points} />
        </section>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            No published water-level history for this well.
          </p>
        </Card>
      )}

      {well && well.ageDays > 30 ? (
        <Card>
          <p className="text-sm text-muted">
            This well&apos;s most recent reading is {well.ageDays} days old
            ({fmtDate(well.date)}). TWDB&apos;s feed reports each well&apos;s
            latest value regardless of age, and parts of the network report only
            intermittently.
          </p>
        </Card>
      ) : null}

      <p className="text-xs text-muted">
        {well?.entity ? `Monitored by ${well.entity}. ` : ""}
        Data from the{" "}
        <a
          className="underline hover:text-foreground"
          href={`https://www.waterdatafortexas.org/groundwater/well/${wellNumber}`}
          target="_blank"
          rel="noreferrer"
        >
          TWDB groundwater database
        </a>
        .
      </p>
    </div>
  );
}

/** Depth increasing means the water table fell — state that in words. */
function changeLabel(change: number): string {
  const magnitude = `${Math.abs(change).toFixed(1)} ft`;
  if (Math.abs(change) < 0.1) return "steady";
  return change > 0 ? `${magnitude} lower` : `${magnitude} higher`;
}

function toneFor(change: number | null): string {
  if (change === null || Math.abs(change) < 0.1) return "";
  return change > 0
    ? "text-amber-600 dark:text-amber-400"
    : "text-sky-600 dark:text-sky-400";
}
