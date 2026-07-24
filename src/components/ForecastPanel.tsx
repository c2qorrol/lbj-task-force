import { Card, SectionHeading } from "./ui";
import { Shimmer } from "./skeletons";
import ForecastChart from "./ForecastChart";
import { getFlowRefs } from "@/lib/flow";
import {
  findGaugeNear,
  getGaugeForecast,
  getNwpsGauges,
  type GaugeForecast,
  type NwpsGauge,
} from "@/lib/nwps";
import { fmtNumber, fmtTimestamp } from "@/lib/format";

/**
 * Official NWS river forecasts around a reservoir.
 *
 * NWS issues stage/flow forecasts for a subset of gauges (roughly 200 of the
 * ~1,000 in and around Texas). Where the inflow reach, the reach below the
 * dam, or the lake's own gauge is one of them, this shows the next ~5 days —
 * the only genuinely predictive series on the page, everything else being
 * observation or extrapolation.
 *
 * Rendered inside Suspense: it needs the NWPS gauge list plus one request per
 * forecast point, and enrichment must never hold the rest of the page.
 */
export default async function ForecastPanel({
  slug,
  lakeLat,
  lakeLon,
}: {
  slug: string;
  lakeLat: number | null;
  lakeLon: number | null;
}) {
  const refs = getFlowRefs(slug);

  const candidates: { role: string; lat: number | null; lon: number | null }[] = [
    { role: "Lake gauge", lat: lakeLat, lon: lakeLon },
    { role: "Inflow river", lat: refs?.inflow?.lat ?? null, lon: refs?.inflow?.lon ?? null },
    { role: "Below the dam", lat: refs?.outflow?.lat ?? null, lon: refs?.outflow?.lon ?? null },
  ];

  const gauges = await getNwpsGauges().catch(() => [] as NwpsGauge[]);
  if (gauges.length === 0) return null;

  // One gauge can serve several roles (a dam gage is often the inflow gage's
  // neighbour); keep the first role that claims it.
  const picked = new Map<string, { role: string; gauge: NwpsGauge }>();
  for (const c of candidates) {
    const gauge = findGaugeNear(gauges, c.lat, c.lon);
    if (gauge && gauge.hasForecast && !picked.has(gauge.lid)) {
      picked.set(gauge.lid, { role: c.role, gauge });
    }
  }
  if (picked.size === 0) return null;

  const forecasts = (
    await Promise.all(
      [...picked.values()].map(async ({ role, gauge }) => {
        const forecast = await getGaugeForecast(gauge.lid).catch(() => null);
        return forecast ? { role, gauge, forecast } : null;
      }),
    )
  ).filter((f): f is { role: string; gauge: NwpsGauge; forecast: GaugeForecast } => f !== null);
  if (forecasts.length === 0) return null;

  return (
    <section>
      <SectionHeading
        title="River forecast"
        subtitle="Official NWS stage/flow forecasts for gauges around this reservoir"
      />
      <div className="grid gap-3 md:grid-cols-2">
        {forecasts.map(({ role, gauge, forecast }) => (
          <ForecastCard key={gauge.lid} role={role} gauge={gauge} forecast={forecast} />
        ))}
      </div>
      <p className="text-xs text-muted mt-2">
        Issued by the NWS National Water Prediction Service, typically a few
        times a day, about five days out. A river forecast is not a lake-level
        forecast: releases are managed, and the gauges can sit well away from
        the dam.
      </p>
    </section>
  );
}

function ForecastCard({
  role,
  gauge,
  forecast,
}: {
  role: string;
  gauge: NwpsGauge;
  forecast: GaugeForecast;
}) {
  const { crest } = forecast;
  const crestParts =
    crest === null
      ? []
      : [
          crest.stageFt !== null ? `${crest.stageFt.toFixed(1)} ft` : null,
          crest.flowCfs !== null ? `${fmtNumber(crest.flowCfs)} cfs` : null,
        ].filter(Boolean);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted">{role}</span>
        <span className="text-xs text-muted">NWS {gauge.lid}</span>
      </div>

      {crest !== null && crestParts.length > 0 ? (
        <>
          <div className="nums text-2xl font-semibold mt-1">
            {crestParts.join(" · ")}
          </div>
          <div className="text-xs text-muted">
            forecast peak, {fmtTimestamp(crest.t)}
          </div>
        </>
      ) : null}

      <a
        href={`https://water.noaa.gov/gauges/${gauge.lid}`}
        target="_blank"
        rel="noreferrer"
        className="block text-sm mt-2 hover:text-accent hover:underline"
      >
        {gauge.name}
      </a>
      <div className="text-xs text-muted">
        issued {forecast.issuedTime ? fmtTimestamp(forecast.issuedTime) : "—"}
      </div>

      <div className="mt-3">
        <ForecastChart points={forecast.points} crestT={crest?.t ?? null} />
      </div>
    </Card>
  );
}

export function ForecastPanelSkeleton() {
  return (
    <section>
      <Shimmer className="h-5 w-40" />
      <Shimmer className="h-3 w-72 mt-2" />
      <div className="grid gap-3 md:grid-cols-2 mt-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-7 w-40 mt-2" />
            <Shimmer className="h-48 sm:h-56 w-full mt-3" />
          </div>
        ))}
      </div>
    </section>
  );
}
