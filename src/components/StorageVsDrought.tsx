"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DROUGHT_HEX,
  DROUGHT_LABEL,
  exclusiveShares,
  type DroughtWeekWithStorage,
} from "@/lib/drought";
import { usePhone } from "@/lib/useMediaQuery";
import { fmtDate } from "@/lib/format";

const SPANS = [
  { years: 5, label: "5 years" },
  { years: 15, label: "15 years" },
  { years: 26, label: "Since 2000" },
];

/** Deepest category on the bottom, so worst drought reads along the axis. */
const STACK = ["d4", "d3", "d2", "d1", "d0"] as const;

/**
 * Statewide reservoir storage over drought coverage, on one timeline.
 *
 * These are the two halves of the same story and are far more informative
 * together than apart — storage lags drought by months, which is only visible
 * when they share an axis. Drought is weekly and storage is daily, so storage
 * is sampled onto the drought weeks rather than interpolating drought upward.
 */
export default function StorageVsDrought({
  weeks,
}: {
  /** Weekly drought readings with statewide storage already aligned server-side. */
  weeks: DroughtWeekWithStorage[];
}) {
  const [span, setSpan] = useState(15);
  const phone = usePhone();

  const data = useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - span);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    return weeks
      .filter((w) => w.date >= cutoffIso)
      .map((week) => ({
        date: week.date,
        ...exclusiveShares(week),
        storage: week.storage,
      }));
  }, [weeks, span]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div>
          <h2 className="font-semibold">Storage against drought</h2>
          <p className="text-xs text-muted">
            Statewide reservoir storage over US Drought Monitor coverage
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

      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
              tickFormatter={(d: string) => (span > 5 ? d.slice(0, 4) : d.slice(0, 7))}
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
              formatter={(value, name) => {
                if (value === null) return ["—", "Storage"];
                if (name === "storage") {
                  return [`${Number(value).toFixed(1)}%`, "Statewide storage"];
                }
                return [
                  `${Number(value).toFixed(1)}%`,
                  DROUGHT_LABEL[name as (typeof STACK)[number]],
                ];
              }}
            />
            {STACK.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="drought"
                stroke="none"
                fill={DROUGHT_HEX[key]}
                fillOpacity={0.75}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="storage"
              stroke="#0f766e"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-teal-700" />
          Statewide reservoir storage
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-4 rounded-sm"
            style={{ background: DROUGHT_HEX.d2 }}
          />
          Share of Texas in drought, by severity
        </span>
        <span className="text-muted/70">
          Both on the same 0–100% axis. Storage typically lags drought by months.
        </span>
      </p>
    </div>
  );
}
