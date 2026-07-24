"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WellHistoryPoint } from "@/lib/groundwater";
import { usePhone } from "@/lib/useMediaQuery";
import { Spinner, useDelayedPending } from "./Spinner";
import { fmtDate } from "@/lib/format";

const SPANS = [
  { years: 1, label: "1 year" },
  { years: 5, label: "5 years" },
  { years: 0, label: "Full record" },
];

/**
 * Depth-to-water over time, with the Y axis **reversed**.
 *
 * Readings are feet below land surface, so a larger value is a deeper water
 * table. Plotted conventionally the chart would fall as groundwater rises,
 * which reads exactly backwards. Reversing the axis puts the water surface
 * where a viewer expects it: high on the chart means plenty of water.
 */
export default function WellChart({ points }: { points: WellHistoryPoint[] }) {
  const [span, setSpan] = useState(5);
  const phone = usePhone();

  /*
   * "Full record" can plot well over a decade of daily readings — thousands of
   * SVG points — which is slow enough to feel on a mid-range device. The
   * transition keeps the buttons responsive while that renders.
   */
  const [isPending, startTransition] = useTransition();
  const showPending = useDelayedPending(isPending);

  const data = useMemo(() => {
    if (span === 0) return points;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - span);
    const iso = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => p.date >= iso);
  }, [points, span]);

  const domain = useMemo((): [number, number] => {
    if (data.length === 0) return [0, 1];
    const values = data.map((d) => d.depthFt);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.12, 0.5);
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="font-semibold inline-flex items-center gap-2">
          Depth to water
          {showPending ? (
            <span className="text-accent">
              <Spinner label="Rendering chart" />
            </span>
          ) : null}
        </h2>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs ml-auto">
          {SPANS.map((s) => (
            <button
              key={s.years}
              onClick={() => startTransition(() => setSpan(s.years))}
              aria-busy={showPending && span !== s.years}
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
          No readings in this period.
        </div>
      ) : (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: phone ? 2 : 8, bottom: 0, left: phone ? 0 : 8 }}
            >
              <defs>
                <linearGradient id="wellGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                minTickGap={phone ? 60 : 45}
                tickFormatter={(d: string) => (span === 1 ? d.slice(5) : d.slice(0, 7))}
              />
              <YAxis
                domain={domain}
                reversed
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                width={phone ? 44 : 60}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  fontSize: "0.8rem",
                }}
                labelFormatter={(d) => fmtDate(String(d))}
                formatter={(v) => [
                  `${Number(v).toFixed(2)} ft below surface`,
                  "Depth to water",
                ]}
              />
              <Area
                type="monotone"
                dataKey="depthFt"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="url(#wellGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-xs text-muted mt-2">
        The axis is inverted: higher on the chart means a shallower water table,
        so the line falling means groundwater is declining.
      </p>
    </div>
  );
}
