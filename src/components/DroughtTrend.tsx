"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DROUGHT_HEX,
  DROUGHT_LABEL,
  exclusiveShares,
  type DroughtWeek,
} from "@/lib/drought";
import { usePhone } from "@/lib/useMediaQuery";
import { fmtDate } from "@/lib/format";

const SPANS = [
  { years: 1, label: "1 year" },
  { years: 5, label: "5 years" },
  { years: 20, label: "20 years" },
];

/** Deepest category on the bottom, so the worst drought reads along the axis. */
const STACK = ["d4", "d3", "d2", "d1", "d0"] as const;

export default function DroughtTrend({ weeks }: { weeks: DroughtWeek[] }) {
  const [span, setSpan] = useState(5);
  const phone = usePhone();

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - span);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  /*
   * USDM percentages are cumulative (d1 includes d2–d4), so stacking them
   * directly would double-count and exceed 100%. Convert to exclusive shares
   * first — that is what a stacked area actually needs.
   */
  const data = weeks
    .filter((w) => w.date >= cutoffIso)
    .map((w) => ({ date: w.date, ...exclusiveShares(w), dsci: w.dsci }));

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div>
          <h2 className="font-semibold">Statewide drought coverage</h2>
          <p className="text-xs text-muted">
            Share of Texas in each US Drought Monitor category, weekly
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs ml-auto">
          {SPANS.map((s) => (
            <button
              key={s.years}
              onClick={() => setSpan(s.years)}
              className={`px-3 py-2 sm:py-1.5 whitespace-nowrap transition-colors ${
                span === s.years
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-64 grid place-items-center text-sm text-muted">
          No drought data available for this period.
        </div>
      ) : (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: phone ? 2 : 8, bottom: 0, left: phone ? 0 : 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                minTickGap={phone ? 60 : 45}
                tickFormatter={(d: string) => (span > 1 ? d.slice(0, 7) : d.slice(5))}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                width={phone ? 34 : 44}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  fontSize: "0.8rem",
                }}
                labelFormatter={(d) => fmtDate(String(d))}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}%`,
                  DROUGHT_LABEL[name as (typeof STACK)[number]],
                ]}
              />
              {STACK.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="drought"
                  stroke="none"
                  fill={DROUGHT_HEX[key]}
                  fillOpacity={0.9}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-xs text-muted mt-2">
        Bands are exclusive shares — the API reports cumulative coverage, where
        D1 already includes D2 through D4.
      </p>
    </div>
  );
}
