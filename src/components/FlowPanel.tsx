import { Card } from "./ui";
import { GageChart } from "./LakeCharts";
import { cfsToAcreFeetPerDay, type FlowReading, type LakeFlow } from "@/lib/flow";
import { fmtNumber, fmtTimestamp } from "@/lib/format";

/**
 * River discharge above and below the dam.
 *
 * Deliberately framed as "the nearest gaged river reaches", not as a water
 * balance: ungaged tributaries, rain on the lake surface, evaporation, and
 * direct withdrawals are all unmeasured here, and the gages can sit tens of
 * kilometres from the dam. The distance is shown for exactly that reason.
 */
export default function FlowPanel({ flow }: { flow: LakeFlow }) {
  const { inflow, outflow, net } = flow;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {inflow ? <FlowCard reading={inflow} kind="Inflow" /> : null}
        {outflow ? <FlowCard reading={outflow} kind="Release" /> : null}
      </div>

      {net !== null ? (
        <Card>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="text-xs uppercase tracking-wide text-muted">
              Gaged net
            </div>
            <div
              className={`nums text-xl font-semibold ${
                net > 0
                  ? "text-sky-600 dark:text-sky-400"
                  : net < 0
                    ? "text-amber-600 dark:text-amber-400"
                    : ""
              }`}
            >
              {net > 0 ? "+" : ""}
              {fmtNumber(net)} cfs
            </div>
            <div className="text-sm text-muted nums">
              ≈ {net > 0 ? "+" : ""}
              {fmtNumber(cfsToAcreFeetPerDay(net))} acre-ft/day
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Inflow minus release at the two gages above. This is <em>not</em> a
            closed water balance — ungaged tributaries, rain on the lake,
            evaporation, and direct withdrawals are not measured here, so it will
            not reconcile exactly with the day-to-day storage change.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function FlowCard({ reading, kind }: { reading: FlowReading; kind: string }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted">{kind}</span>
        {reading.km !== null ? (
          <span className="text-xs text-muted nums">{reading.km} km from dam</span>
        ) : null}
      </div>

      <div className="nums text-2xl font-semibold mt-1">
        {reading.value === null ? "—" : `${fmtNumber(reading.value)} cfs`}
      </div>
      <div className="text-xs text-muted">
        {reading.value === null
          ? "no current reading"
          : `≈ ${fmtNumber(cfsToAcreFeetPerDay(reading.value))} acre-ft/day`}
      </div>

      <a
        href={`https://waterdata.usgs.gov/monitoring-location/${reading.siteId}/`}
        target="_blank"
        rel="noreferrer"
        className="block text-sm mt-2 hover:text-accent hover:underline"
      >
        {reading.siteName}
      </a>
      <div className="text-xs text-muted">
        USGS {reading.siteId} · {fmtTimestamp(reading.observedAt)}
      </div>

      <div className="mt-3">
        <GageChart points={reading.points} unit="cfs" label={kind} />
      </div>
    </Card>
  );
}
