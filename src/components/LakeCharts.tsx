"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint, Reservoir } from "@/lib/types";
import type { DayStatsByDay } from "@/lib/history";
import { fmtDate, fmtNumber } from "@/lib/format";
import { usePhone } from "@/lib/useMediaQuery";

type Metric = "waterLevel" | "percentFull" | "storage";
type Window = 30 | 90 | 365;

const METRICS: {
  key: Metric;
  label: string;
  shortLabel: string;
  unit: string;
  digits: number;
}[] = [
  { key: "waterLevel", label: "Elevation", shortLabel: "Elev", unit: "ft msl", digits: 2 },
  { key: "percentFull", label: "Percent full", shortLabel: "% Full", unit: "%", digits: 1 },
  { key: "storage", label: "Storage", shortLabel: "Storage", unit: "acre-ft", digits: 0 },
];

const WINDOWS: { key: Window; label: string }[] = [
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
  { key: 365, label: "1 year" },
];

export default function LakeCharts({
  history,
  reservoir,
  dayStats,
}: {
  history: DailyPoint[];
  reservoir: Reservoir;
  /** Per-calendar-day percentile bands, when a long enough record exists. */
  dayStats?: DayStatsByDay;
}) {
  /*
   * Default to percent full when a long record exists: it is the only metric
   * with historical percentile bands, and the band is the point of this chart.
   * Without one, elevation is the more directly useful reading.
   */
  const [metric, setMetric] = useState<Metric>(
    dayStats ? "percentFull" : "waterLevel",
  );
  const [window, setWindow] = useState<Window>(365);
  const phone = usePhone();

  const config = METRICS.find((m) => m.key === metric)!;

  /**
   * Percentile bands only exist for percent full, since that is the only metric
   * comparable across decades — elevation datums and storage capacities are
   * re-surveyed, but "share of conservation pool" stays meaningful.
   */
  const showBands = metric === "percentFull" && dayStats !== undefined;

  const data = useMemo(() => {
    return history
      .filter((p) => p[metric] !== null)
      .slice(-window)
      .map((p) => {
        const stats = showBands ? dayStats![p.date.slice(5, 10)] : undefined;
        return {
          date: p.date,
          value: p[metric] as number,
          // Recharts draws a range area when the value is a [low, high] pair.
          band: stats ? ([stats.p25, stats.p75] as [number, number]) : undefined,
          median: stats?.median,
        };
      });
  }, [history, metric, window, dayStats, showBands]);

  /**
   * Elevation series span only a few feet on a lake hundreds of feet above sea
   * level, so a zero-based axis would flatten every signal. Pad the observed
   * range instead — but include the conservation pool line when it's close
   * enough to be meaningful context rather than an axis-wrecking outlier.
   */
  const domain = useMemo((): [number, number] => {
    if (data.length === 0) return [0, 1];
    let min = Math.min(...data.map((d) => d.value));
    let max = Math.max(...data.map((d) => d.value));
    if (metric === "percentFull") {
      // The normal band can sit outside the observed year; keep it in frame.
      for (const d of data) {
        if (!d.band) continue;
        min = Math.min(min, d.band[0]);
        max = Math.max(max, d.band[1]);
      }
      return [Math.max(0, Math.floor(min - 5)), Math.max(100, Math.ceil(max + 5))];
    }
    if (metric === "storage") return [0, Math.ceil(max * 1.05)];
    const pool = reservoir.conservationPoolElevation;
    if (pool !== null && pool < max + (max - min) && pool > min - (max - min)) {
      min = Math.min(min, pool);
      max = Math.max(max, pool);
    }
    const pad = Math.max((max - min) * 0.12, 0.5);
    return [min - pad, max + pad];
  }, [data, metric, reservoir.conservationPoolElevation]);

  const showPoolLine =
    metric === "waterLevel" &&
    reservoir.conservationPoolElevation !== null &&
    reservoir.conservationPoolElevation >= domain[0] &&
    reservoir.conservationPoolElevation <= domain[1];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-1 sm:flex-none rounded-lg border border-border overflow-hidden text-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 whitespace-nowrap transition-colors ${
                metric === m.key
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {/* "Percent full" doesn't fit three-up on a phone. */}
              <span className="sm:hidden">{m.shortLabel}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 sm:flex-none rounded-lg border border-border overflow-hidden text-xs sm:ml-auto">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindow(w.key)}
              className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 whitespace-nowrap transition-colors ${
                window === w.key
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-64 sm:h-72 grid place-items-center text-sm text-muted">
          No {config.label.toLowerCase()} history available for this reservoir.
        </div>
      ) : (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 4, right: phone ? 2 : 8, bottom: 0, left: phone ? 0 : 8 }}
            >
              <defs>
                <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                minTickGap={phone ? 55 : 40}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                domain={domain}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.55}
                width={phone ? 46 : 64}
                tickFormatter={(v: number) =>
                  // Acre-feet run to seven digits and blow out a phone axis.
                  config.digits === 0 && Math.abs(v) >= 10000
                    ? `${Math.round(v / 1000)}k`
                    : fmtNumber(v, config.digits === 0 ? 0 : 1)
                }
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
                  // The band arrives as a [p25, p75] pair, not a scalar.
                  if (name === "band" && Array.isArray(value)) {
                    const [low, high] = value as [number, number];
                    return [
                      `${low.toFixed(0)}–${high.toFixed(0)}%`,
                      "Normal range",
                    ];
                  }
                  if (name === "median") {
                    return [`${Number(value).toFixed(0)}%`, "Median year"];
                  }
                  return [
                    `${fmtNumber(Number(value), config.digits)} ${config.unit}`,
                    config.label,
                  ];
                }}
              />
              {showPoolLine ? (
                <ReferenceLine
                  y={reservoir.conservationPoolElevation!}
                  stroke="#0ea5e9"
                  strokeDasharray="4 4"
                  label={{
                    value: "conservation pool",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#0ea5e9",
                  }}
                />
              ) : null}
              {metric === "percentFull" ? (
                <ReferenceLine y={100} stroke="#0ea5e9" strokeDasharray="4 4" />
              ) : null}
              {/* Normal band is drawn first so the actual series sits on top. */}
              {showBands ? (
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="#64748b"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  activeDot={false}
                />
              ) : null}
              {showBands ? (
                <Line
                  type="monotone"
                  dataKey="median"
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#14b8a6"
                strokeWidth={2}
                fill="url(#fillGrad)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {showBands ? (
        <p className="text-xs text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-slate-500/30" />
            Normal range for the date (25th–75th percentile)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-slate-400" />
            Median year
          </span>
        </p>
      ) : metric === "percentFull" ? (
        <p className="text-xs text-muted mt-2">
          Not enough period-of-record data to draw historical percentile bands.
        </p>
      ) : (
        <p className="text-xs text-muted mt-2">
          Historical percentile bands are available on the percent-full view.
        </p>
      )}
    </div>
  );
}

/** Real-time USGS gage trace, typically 15-minute readings over a week. */
export function GageChart({
  points,
  unit,
  label,
}: {
  points: { t: string; v: number }[];
  unit: string;
  label: string;
}) {
  const phone = usePhone();
  const data = points.map((p) => ({ t: p.t, v: p.v }));
  const values = data.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, 0.05);

  if (data.length === 0) {
    return (
      <div className="h-48 sm:h-56 grid place-items-center text-sm text-muted">
        No recent gage readings.
      </div>
    );
  }

  return (
    <div className="h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: phone ? 2 : 8, bottom: 0, left: phone ? 0 : 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.55}
            minTickGap={50}
            tickFormatter={(t: string) =>
              new Date(t).toLocaleDateString("en-US", {
                month: "numeric",
                day: "numeric",
                timeZone: "America/Chicago",
              })
            }
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.55}
            width={phone ? 46 : 64}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8rem",
            }}
            labelFormatter={(t) =>
              new Date(String(t)).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })
            }
            formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, label]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
