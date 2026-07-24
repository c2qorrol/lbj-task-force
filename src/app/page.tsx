import Link from "next/link";
import LakeTable from "@/components/LakeTable";
import { Card, Stat, StatusPill, FillBar, SectionHeading } from "@/components/ui";
import { LinkSpinner } from "@/components/Spinner";
import { getLakeSummaries, summarize, type LakeSummary } from "@/lib/lakes";
import {
  fillStatus,
  fmtAcreFeet,
  fmtDate,
  fmtPercent,
  STATUS_CLASS,
} from "@/lib/format";

// TWDB publishes one observation per day; revalidating hourly keeps the page
// fresh shortly after they post without hammering their servers.
export const revalidate = 3600;

export default async function DashboardPage() {
  const lakes = await getLakeSummaries();
  const stats = summarize(lakes);

  const ranked = lakes.filter((l) => l.percentFull !== null);
  const lowest = [...ranked].sort((a, b) => a.percentFull! - b.percentFull!).slice(0, 6);
  const highest = [...ranked].sort((a, b) => b.percentFull! - a.percentFull!).slice(0, 6);
  const liveCount = lakes.filter((l) => l.gage).length;

  return (
    <div className="space-y-8">
      <section className="flex flex-col items-center text-center pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static
            pre-sized PNG, same reasoning as the header logo in layout.tsx. */}
        <img
          src="/emblem-large.png"
          alt="LBJ Task Force emblem"
          width={208}
          height={208}
          className="w-40 h-40 sm:w-52 sm:h-52"
        />
        <h1 className="mt-4 text-2xl sm:text-3xl font-semibold">
          Texas<span className="text-accent"> Lake Levels</span>
        </h1>
        <p className="text-muted text-sm sm:text-base mt-2 max-w-2xl">
          An LBJ Task Force project keeping watch over water across Texas —
          live levels, storage, and trends for every major reservoir,
          combining TWDB daily conditions with real-time USGS gage data.
        </p>
      </section>

      <section>
        <h2 className="text-xl sm:text-2xl font-semibold">
          Texas reservoir conditions
        </h2>
        <p className="text-muted text-sm mt-1">
          {stats.count} major reservoirs · {liveCount} with real-time gages · TWDB
          conditions as of {stats.asOf ? fmtDate(stats.asOf) : "—"}
        </p>
      </section>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat
          label="Statewide storage"
          value={fmtPercent(stats.percentFull)}
          tone={STATUS_CLASS[fillStatus(stats.percentFull)]}
          sub={`${fmtAcreFeet(stats.totalStorage)} of ${fmtAcreFeet(stats.totalCapacity)}`}
        />
        <Stat
          label="Near full"
          value={stats.full}
          tone="text-emerald-600 dark:text-emerald-400"
          sub="at or above 95% of conservation pool"
        />
        <Stat
          label="Low"
          value={stats.low}
          tone="text-amber-600 dark:text-amber-400"
          sub="between 25% and 50% full"
        />
        <Stat
          label="Critically low"
          value={stats.critical}
          tone="text-rose-600 dark:text-rose-400"
          sub="below 25% full"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <RankCard
          title="Lowest reservoirs"
          subtitle="Smallest share of conservation pool remaining"
          lakes={lowest}
        />
        <RankCard
          title="Fullest reservoirs"
          subtitle="At or above conservation pool"
          lakes={highest}
        />
      </section>

      <section>
        <SectionHeading
          title="All reservoirs"
          subtitle="Sort, filter by basin or status, and search across the state"
          right={
            <span className="flex items-center gap-4">
              <a
                href="/api/lakes?format=csv"
                className="text-sm text-accent hover:underline"
                download
              >
                Download CSV
              </a>
              <Link href="/map" className="text-sm text-accent hover:underline">
                View on map →
              </Link>
            </span>
          }
        />
        <LakeTable lakes={lakes} />
      </section>
    </div>
  );
}

function RankCard({
  title,
  subtitle,
  lakes,
}: {
  title: string;
  subtitle: string;
  lakes: LakeSummary[];
}) {
  return (
    <Card>
      <div className="mb-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <ul className="space-y-2.5">
        {lakes.map((l) => (
          <li key={l.slug}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <Link
                href={`/lake/${l.slug}`}
                className="truncate hover:text-accent hover:underline inline-flex items-center gap-2"
              >
                {l.name}
                <LinkSpinner />
              </Link>
              <span
                className={`nums font-semibold shrink-0 ${STATUS_CLASS[fillStatus(l.percentFull)]}`}
              >
                {fmtPercent(l.percentFull)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <FillBar percentFull={l.percentFull} />
              <span className="shrink-0">
                <StatusPill percentFull={l.percentFull} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
