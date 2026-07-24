import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LakeCharts, { GageChart } from "@/components/LakeCharts";
import HistoricalContextCard from "@/components/HistoricalContext";
import FlowPanel from "@/components/FlowPanel";
import { getHistoricalContext } from "@/lib/history";
import { getLakeFlow } from "@/lib/flow";
import { getUsaceReading } from "@/lib/usace";
import { computeSupplyOutlook, describeOutlook } from "@/lib/supply";
import { Suspense } from "react";
import RainfallPanel, { RainfallPanelSkeleton } from "@/components/RainfallPanel";
import ForecastPanel, { ForecastPanelSkeleton } from "@/components/ForecastPanel";
import {
  DROUGHT_HEX,
  DROUGHT_LABEL,
  DROUGHT_ORDER,
  getDroughtForPoint,
} from "@/lib/drought";
import { Card, FillBar, SectionHeading, Stat, StatusPill, TrendBadge } from "@/components/ui";
import { getLakeDetail } from "@/lib/lakes";
import { getGageSeries } from "@/lib/usgs";
import {
  fillStatus,
  fmtAcreFeet,
  fmtDate,
  fmtFeet,
  fmtNumber,
  fmtPercent,
  fmtSigned,
  fmtTimestamp,
  STATUS_CLASS,
} from "@/lib/format";

export const revalidate = 900;

/*
 * Deliberately not using generateStaticParams: pre-rendering all 122 lakes
 * would fire 122 history requests at TWDB during every build, which is exactly
 * the burst pattern that gets throttled (502/503). Pages render on first
 * request and are then cached by the revalidate window above.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getLakeDetail(slug).catch(() => null);
  if (!detail) return { title: "Reservoir not found" };

  const { reservoir } = detail;
  const title = reservoir.name;
  const description = `${reservoir.name} is ${fmtPercent(reservoir.percentFull)} full at ${fmtFeet(reservoir.elevation)} msl as of ${fmtDate(reservoir.date)}.`;
  const url = `/lake/${slug}`;

  // og:image comes from the sibling opengraph-image.tsx automatically.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getLakeDetail(slug);
  if (!detail) notFound();

  const { reservoir, gage, history, trend7, trend30 } = detail;

  // Enrichment panels; an upstream hiccup must not fail the page.
  const [series, historical, flow, localDrought, usace] = await Promise.all([
    gage ? getGageSeries([gage.siteId], 7).catch(() => []) : Promise.resolve([]),
    getHistoricalContext(slug),
    getLakeFlow(slug).catch(() => null),
    getDroughtForPoint(reservoir.lat, reservoir.lon).catch(() => null),
    // Only consulted for reservoirs with no USGS gage of their own.
    gage ? Promise.resolve(null) : getUsaceReading(slug).catch(() => null),
  ]);

  const outlook = computeSupplyOutlook(history);
  const elevationSeries = series.find((s) => s.parameterCode === gage?.parameterCode);

  const headroom =
    reservoir.conservationPoolElevation !== null && reservoir.elevation !== null
      ? reservoir.elevation - reservoir.conservationPoolElevation
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← All reservoirs
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">{reservoir.name}</h1>
            <p className="text-sm text-muted mt-1">
              {[reservoir.basin && `${reservoir.basin} basin`, reservoir.region, reservoir.climate]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <StatusPill percentFull={reservoir.percentFull} />
            <p className="text-xs text-muted mt-1">
              TWDB reading {fmtDate(reservoir.date)}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat
          label="Percent full"
          value={fmtPercent(reservoir.percentFull)}
          tone={STATUS_CLASS[fillStatus(reservoir.percentFull)]}
          sub={
            <FillBar percentFull={reservoir.percentFull} className="mt-1.5" />
          }
        />
        <Stat
          label="Elevation"
          value={fmtFeet(reservoir.elevation)}
          sub={
            headroom === null
              ? "above mean sea level"
              : `${fmtSigned(headroom)} vs conservation pool`
          }
        />
        <Stat
          label="Conservation storage"
          value={fmtAcreFeet(reservoir.conservationStorage)}
          sub={`capacity ${fmtAcreFeet(reservoir.conservationCapacity)}`}
        />
        <Stat
          label="Surface area"
          value={`${fmtNumber(reservoir.area)} ac`}
          sub={
            reservoir.storage !== null
              ? `total storage ${fmtAcreFeet(reservoir.storage)}`
              : undefined
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted">
            7-day change
          </div>
          <div className="text-xl font-semibold mt-1">
            <TrendBadge direction={trend7.direction}>
              {fmtSigned(trend7.change)}
            </TrendBadge>
          </div>
          <div className="text-xs text-muted mt-1">
            {trend7.percentChange === null
              ? "elevation change"
              : `${fmtSigned(trend7.percentChange, 1, "pts")} of conservation pool`}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted">
            30-day change
          </div>
          <div className="text-xl font-semibold mt-1">
            <TrendBadge direction={trend30.direction}>
              {fmtSigned(trend30.change)}
            </TrendBadge>
          </div>
          <div className="text-xs text-muted mt-1">
            {trend30.percentChange === null
              ? "elevation change"
              : `${fmtSigned(trend30.percentChange, 1, "pts")} of conservation pool`}
          </div>
        </Card>
      </section>

      {gage ? (
        <section>
          <SectionHeading
            title="Real-time gage"
            subtitle={`USGS ${gage.siteId} — ${gage.siteName}`}
            right={
              <a
                href={`https://waterdata.usgs.gov/monitoring-location/${gage.siteId}/`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent hover:underline"
              >
                USGS site →
              </a>
            }
          />
          <Card>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
              <div className="nums text-2xl font-semibold">
                {gage.value === null ? "—" : `${gage.value.toFixed(2)} ${gage.unit || "ft"}`}
              </div>
              <div className="text-sm text-muted">
                {gage.parameterName} · {fmtTimestamp(gage.observedAt)}
              </div>
            </div>
            <GageChart
              points={elevationSeries?.points ?? []}
              unit={gage.unit || "ft"}
              label={gage.parameterName}
            />
            <p className="text-xs text-muted mt-2">
              Past 7 days, typically 15-minute readings. USGS elevations use a
              published datum that may differ slightly from the TWDB daily value
              above.
            </p>
          </Card>
        </section>
      ) : usace ? (
        <section>
          <SectionHeading
            title="Real-time gage"
            subtitle={`US Army Corps of Engineers ${usace.office} — ${usace.siteName}`}
          />
          <Card>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
              <div className="nums text-2xl font-semibold">
                {usace.value === null
                  ? "—"
                  : `${usace.value.toFixed(2)} ${usace.units}`}
              </div>
              <div className="text-sm text-muted">
                Pool elevation · {fmtTimestamp(usace.observedAt)}
              </div>
            </div>
            <GageChart
              points={usace.points}
              unit={usace.units}
              label="Pool elevation"
            />
            <p className="text-xs text-muted mt-2">
              This reservoir has no USGS lake gage, so readings come from the
              USACE CWMS system ({usace.tsId}). Validated against the TWDB daily
              elevation when the mapping was built.
            </p>
          </Card>
        </section>
      ) : (
        <section>
          <SectionHeading
            title="Real-time gage"
            subtitle="No real-time lake-elevation gage is matched to this reservoir"
          />
          <Card>
            <p className="text-sm text-muted">
              This reservoir reports through TWDB&apos;s daily process only.
              Amistad and Falcon are operated by the International Boundary and
              Water Commission, and Elephant Butte by the Bureau of Reclamation;
              those agencies publish through systems this site does not ingest.
              Several others appear in USACE&apos;s catalogue as location records
              with no published time series.
            </p>
          </Card>
        </section>
      )}

      {outlook ? (
        <section>
          <SectionHeading
            title="Supply outlook"
            subtitle={`Extrapolated from the past ${outlook.windowDays} days`}
          />
          <Card>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">
                  {outlook.refilling ? "Gaining" : "Losing"}
                </div>
                <div className="nums text-xl font-semibold mt-0.5">
                  {fmtNumber(Math.abs(outlook.acreFeetPerDay))} af/day
                </div>
              </div>
              {outlook.daysRemaining !== null ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Pool exhausted in
                  </div>
                  <div
                    className={`nums text-xl font-semibold mt-0.5 ${
                      outlook.daysRemaining < 365
                        ? "text-rose-600 dark:text-rose-400"
                        : outlook.daysRemaining < 365 * 3
                          ? "text-amber-600 dark:text-amber-400"
                          : ""
                    }`}
                  >
                    {outlook.daysRemaining >= 730
                      ? `${(outlook.daysRemaining / 365).toFixed(1)} yr`
                      : `${Math.round(outlook.daysRemaining)} days`}
                  </div>
                </div>
              ) : null}
            </div>
            <p className="text-sm mt-3">{describeOutlook(outlook)}</p>
            <p className="text-xs text-muted mt-2">
              A straight-line extrapolation, not a forecast. It assumes the
              recent rate continues unchanged, ignoring seasonality, rainfall and
              managed releases — and drawdown normally slows as a reservoir
              falls. Treat it as a severity signal, not a date.
            </p>
          </Card>
        </section>
      ) : null}

      {/* Streamed: rainfall depends on a ~2 MB statewide feed and must not
          hold the rest of the page if it is cold or slow. */}
      <Suspense fallback={<RainfallPanelSkeleton />}>
        <RainfallPanel lat={reservoir.lat} lon={reservoir.lon} />
      </Suspense>

      {localDrought ? (
        <section>
          <SectionHeading
            title="Local drought"
            subtitle={`US Drought Monitor for ${localDrought.county} County, ${fmtDate(localDrought.mapDate)}`}
          />
          <Card>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-border"
                  style={{ background: DROUGHT_HEX[localDrought.worst] }}
                />
                <span className="font-medium">
                  {DROUGHT_LABEL[localDrought.worst]}
                </span>
              </span>
              <span className="nums text-sm text-muted">
                DSCI {localDrought.dsci}
                <span className="text-muted/60"> / 500</span>
              </span>
              {localDrought.worst !== "none" ? (
                <span className="nums text-sm text-muted">
                  {DROUGHT_ORDER.filter((c) => localDrought[c] > 0)
                    .map((c) => `${c.toUpperCase()} ${localDrought[c].toFixed(0)}%`)
                    .join(" · ")}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted mt-3">
              Conditions in the county containing the dam. A reservoir is filled
              by a watershed that often reaches well beyond one county, and
              releases are managed, so local drought is context rather than an
              explanation of the level.
            </p>
          </Card>
        </section>
      ) : null}

      {flow ? (
        <section>
          <SectionHeading
            title="River flows"
            subtitle="Nearest gaged reaches above and below the dam"
          />
          <FlowPanel flow={flow} />
        </section>
      ) : null}

      {/* Streamed: needs the NWPS gauge list plus one request per forecast,
          and renders nothing at all for most lakes — NWS forecasts only a
          subset of gauges. */}
      <Suspense fallback={<ForecastPanelSkeleton />}>
        <ForecastPanel
          slug={slug}
          lakeLat={reservoir.lat}
          lakeLon={reservoir.lon}
        />
      </Suspense>

      {historical ? (
        <section>
          <SectionHeading
            title="Historical context"
            subtitle={`How today compares with ${historical.context.yearsOfRecord} years of record for this date`}
          />
          <HistoricalContextCard
            context={historical.context}
            lakeName={reservoir.name}
          />
        </section>
      ) : null}

      <section>
        <SectionHeading
          title="History"
          subtitle="Daily TWDB observations, with the normal range for each date"
          right={
            <span className="flex items-center gap-4">
              <a
                href={`/api/lakes/${slug}?range=all&format=csv`}
                className="text-sm text-accent hover:underline"
                download
              >
                Download CSV
              </a>
              <Link
                href={`/compare?lakes=${slug}`}
                className="text-sm text-accent hover:underline"
              >
                Compare →
              </Link>
            </span>
          }
        />
        <LakeCharts
          history={history}
          reservoir={reservoir}
          dayStats={historical?.dayStats}
        />
      </section>

      <section>
        <SectionHeading title="Reference elevations" />
        <Card>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
            <Row label="Conservation pool" value={fmtFeet(reservoir.conservationPoolElevation)} />
            <Row label="Dead pool" value={fmtFeet(reservoir.deadPoolElevation)} />
            <Row label="Current elevation" value={fmtFeet(reservoir.elevation)} />
            <Row
              label="Flood control lake"
              value={reservoir.isFloodControl ? "Yes" : "No"}
            />
          </dl>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="nums">{value}</dd>
    </div>
  );
}
