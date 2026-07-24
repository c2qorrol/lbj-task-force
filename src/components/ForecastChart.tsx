"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePhone } from "@/lib/useMediaQuery";
import type { ForecastPoint } from "@/lib/nwps";

/**
 * NWS forecast trace. Dashed deliberately: everything else charted on a lake
 * page is an observation, and the line style is what keeps a prediction from
 * reading as one.
 */
export default function ForecastChart({
  points,
  crestT,
}: {
  points: ForecastPoint[];
  /** Valid time of the crest point, for the marker. */
  crestT: string | null;
}) {
  const phone = usePhone();

  // Chart whichever series the forecast actually carries, preferring stage —
  // it is what NWS flood categories are defined against.
  const hasStage = points.some((p) => p.stageFt !== null);
  const unit = hasStage ? "ft" : "cfs";
  const label = hasStage ? "Forecast stage" : "Forecast flow";
  const data = points
    .map((p) => ({ t: p.t, v: hasStage ? p.stageFt : p.flowCfs }))
    .filter((p): p is { t: string; v: number } => p.v !== null);

  if (data.length === 0) {
    return (
      <div className="h-48 sm:h-56 grid place-items-center text-sm text-muted">
        No plottable forecast points.
      </div>
    );
  }

  const values = data.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, 0.05);
  const crest = crestT ? data.find((d) => d.t === crestT) : undefined;

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
                weekday: "short",
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
            tickFormatter={(v: number) => v.toFixed(unit === "ft" ? 1 : 0)}
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
            stroke="#a78bfa"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
          {crest ? (
            <ReferenceDot
              x={crest.t}
              y={crest.v}
              r={4}
              fill="#a78bfa"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
