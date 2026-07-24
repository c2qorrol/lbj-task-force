import { Card } from "./ui";
import type { HistoricalContext } from "@/lib/history";
import { fmtDate, fmtPercent } from "@/lib/format";

/**
 * Where today sits against the full period of record for this calendar date.
 *
 * Everything here is drawn from the ±3-day window around today pooled across
 * every year on record, so "normal" means normal *for late July*, not normal
 * year-round — reservoirs have a strong seasonal signal.
 */
export default function HistoricalContextCard({
  context,
  lakeName,
}: {
  context: HistoricalContext;
  lakeName: string;
}) {
  const { percentile, current, normal, recordLow, recordHigh } = context;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold">Compared with history</h3>
        <span className="text-xs text-muted">
          {context.yearsOfRecord} years of record · {fmtDate(context.firstDate)} to
          present
        </span>
      </div>

      <p className="text-sm mt-2">{headline(context, lakeName)}</p>

      {normal && current !== null ? (
        <RangeGauge
          min={recordLow?.value ?? normal.min}
          max={recordHigh?.value ?? normal.max}
          p25={normal.p25}
          p75={normal.p75}
          median={normal.median}
          current={current}
        />
      ) : null}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-4 text-sm">
        <Figure
          label="Percentile"
          value={percentile === null ? "—" : `${Math.round(percentile)}th`}
          hint={`vs ${context.sampleCount} readings`}
        />
        <Figure
          label="Normal range"
          value={
            normal ? `${normal.p25.toFixed(0)}–${normal.p75.toFixed(0)}%` : "—"
          }
          hint="25th–75th percentile"
        />
        <Figure
          label="Record low"
          value={recordLow ? fmtPercent(recordLow.value, 0) : "—"}
          hint={recordLow ? fmtDate(recordLow.date) : undefined}
        />
        <Figure
          label="Record high"
          value={recordHigh ? fmtPercent(recordHigh.value, 0) : "—"}
          hint={recordHigh ? fmtDate(recordHigh.date) : undefined}
        />
      </dl>

      <p className="text-xs text-muted mt-3">
        Percentiles pool the ±3 days around today across every year on record, so
        &ldquo;normal&rdquo; means normal for this time of year. Conservation
        capacity is re-surveyed over time, so percent-full comparisons across
        decades are close but not exact.
      </p>
    </Card>
  );
}

/** Plain-language summary — the part most readers will actually quote. */
function headline(context: HistoricalContext, lakeName: string): string {
  const { percentile, current, lastLowerYear, lastHigherYear } = context;
  if (percentile === null || current === null) {
    return `${lakeName} has too little history on this date for a comparison.`;
  }

  const rounded = Math.round(percentile);
  const level = fmtPercent(current, 0);

  if (rounded <= 10) {
    return `At ${level}, ${lakeName} is near its lowest on record for this date — below ${100 - rounded}% of all years since ${context.firstDate.slice(0, 4)}.${lastLowerYear ? ` It was last this low in ${lastLowerYear}.` : ""}`;
  }
  if (rounded < 50) {
    return `At ${level}, ${lakeName} is below normal for this date, lower than ${100 - rounded}% of years on record.${lastLowerYear ? ` It was last this low in ${lastLowerYear}.` : ""}`;
  }
  if (rounded >= 90) {
    return `At ${level}, ${lakeName} is near its highest on record for this date — above ${rounded}% of all years since ${context.firstDate.slice(0, 4)}.${lastHigherYear ? ` It was last this high in ${lastHigherYear}.` : ""}`;
  }
  return `At ${level}, ${lakeName} is within its normal range for this date, higher than ${rounded}% of years on record.`;
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="nums font-semibold mt-0.5">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/**
 * Where today falls between the record low and record high for this date, with
 * the interquartile range shaded as "normal".
 */
function RangeGauge({
  min,
  max,
  p25,
  p75,
  median,
  current,
}: {
  min: number;
  max: number;
  p25: number;
  p75: number;
  median: number;
  current: number;
}) {
  const lo = Math.min(min, current);
  const hi = Math.max(max, current);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="mt-4">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-2.5 h-2 rounded-full bg-border/70" />
        <div
          className="absolute top-2.5 h-2 bg-teal-500/35"
          style={{ left: `${pos(p25)}%`, width: `${pos(p75) - pos(p25)}%` }}
          title={`Normal range ${p25.toFixed(0)}–${p75.toFixed(0)}%`}
        />
        <div
          className="absolute top-1.5 h-4 w-px bg-muted"
          style={{ left: `${pos(median)}%` }}
          title={`Median ${median.toFixed(0)}%`}
        />
        <div
          className="absolute top-0.5 h-6 w-1 rounded-full bg-accent"
          style={{ left: `calc(${pos(current)}% - 2px)` }}
          title={`Today ${current.toFixed(1)}%`}
        />
      </div>
      <div className="flex justify-between text-[0.65rem] text-muted nums">
        <span>{lo.toFixed(0)}% record low</span>
        <span>normal range</span>
        <span>{hi.toFixed(0)}% record high</span>
      </div>
    </div>
  );
}
