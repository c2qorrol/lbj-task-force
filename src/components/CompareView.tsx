"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Spinner, useDelayedPending } from "@/components/Spinner";
import { fmtDate, fmtNumber, fmtPercent } from "@/lib/format";
import { usePhone } from "@/lib/useMediaQuery";

export interface CompareSeries {
  slug: string;
  name: string;
  /** Current TWDB reading, for the legend. */
  percentFull: number | null;
  points: { date: string; pct: number | null; storage: number | null }[];
}

type Metric = "pct" | "storage";
type Window = 90 | 365;

/**
 * Line colours, assigned by position. Deliberately not the fill-status ramp:
 * here colour identifies *which* lake, and two low reservoirs sharing amber
 * would be indistinguishable.
 */
const COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#f43f5e"];

const METRICS: { key: Metric; label: string }[] = [
  { key: "pct", label: "Percent full" },
  { key: "storage", label: "Storage" },
];

const WINDOWS: { key: Window; label: string }[] = [
  { key: 90, label: "90 days" },
  { key: 365, label: "1 year" },
];

export default function CompareView({
  options,
  series,
  maxLakes,
}: {
  options: { slug: string; name: string }[];
  series: CompareSeries[];
  maxLakes: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const showPending = useDelayedPending(isPending);
  const [metric, setMetric] = useState<Metric>("pct");
  const [window, setWindow] = useState<Window>(365);
  const phone = usePhone();

  const selected = series.map((s) => s.slug);

  const navigate = (slugs: string[]) => {
    // Slugs are TWDB-derived kebab-case, safe in a query string unescaped —
    // and `?lakes=travis,buchanan` is a far nicer link to share than %2C soup.
    const qs = slugs.length > 0 ? `?lakes=${slugs.join(",")}` : "";
    startTransition(() => {
      router.replace(`/compare${qs}`, { scroll: false });
    });
  };

  const replaceAt = (index: number, slug: string) => {
    const next = [...selected];
    if (slug === "") next.splice(index, 1);
    else next[index] = slug;
    navigate(next);
  };

  const data = useMemo(() => {
    // Window is measured from the latest observation across every series, so
    // lakes whose feeds lag by a day still align on the same right edge.
    const latest = series
      .flatMap((s) => s.points.at(-1)?.date ?? [])
      .sort()
      .at(-1);
    if (!latest) return [];
    const cutoff = new Date(`${latest}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - window);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const rows = new Map<string, Record<string, string | number | null>>();
    for (const s of series) {
      for (const p of s.points) {
        if (p.date < cutoffIso) continue;
        const value = metric === "pct" ? p.pct : p.storage;
        if (value === null) continue;
        let row = rows.get(p.date);
        if (!row) {
          row = { date: p.date };
          rows.set(p.date, row);
        }
        row[s.slug] = value;
      }
    }
    return [...rows.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [series, metric, window]);

  const domain = useMemo((): [number, number] => {
    let max = 0;
    for (const row of data) {
      for (const s of series) {
        const v = row[s.slug];
        if (typeof v === "number" && v > max) max = v;
      }
    }
    if (max === 0) return [0, 1];
    return metric === "pct"
      ? [0, Math.max(100, Math.ceil(max + 5))]
      : [0, Math.ceil(max * 1.05)];
  }, [data, series, metric]);

  const nameOf = new Map(series.map((s) => [s.slug, s.name]));

  return (
    <div className="space-y-3">
      {/* Pickers: one select per selected lake (change or remove), plus an
          "Add" select while there is room. Selection lives in the URL so a
          comparison can be shared as a link. */}
      <div className="flex flex-wrap items-center gap-2">
        {series.map((s, i) => (
          <LakeSelect
            key={s.slug}
            value={s.slug}
            color={COLORS[i]}
            options={options}
            taken={selected}
            onChange={(slug) => replaceAt(i, slug)}
            removable={series.length > 1}
          />
        ))}
        {series.length < maxLakes ? (
          <LakeSelect
            key={`add-${series.length}`}
            value=""
            options={options}
            taken={selected}
            onChange={(slug) => slug && navigate([...selected, slug])}
          />
        ) : null}
        {showPending ? <Spinner className="text-accent" /> : null}
      </div>

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
                {m.label}
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
          <div className="h-64 sm:h-80 grid place-items-center text-sm text-muted">
            No history available for the selected reservoirs.
          </div>
        ) : (
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 4, right: phone ? 2 : 8, bottom: 0, left: phone ? 0 : 8 }}
              >
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
                    metric === "pct"
                      ? `${v}%`
                      : Math.abs(v) >= 10000
                        ? `${Math.round(v / 1000)}k`
                        : fmtNumber(v)
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
                  formatter={(value, name) => [
                    metric === "pct"
                      ? fmtPercent(Number(value))
                      : `${fmtNumber(Number(value))} af`,
                    nameOf.get(String(name)) ?? String(name),
                  ]}
                />
                {metric === "pct" ? (
                  <ReferenceLine y={100} stroke="#0ea5e9" strokeDasharray="4 4" />
                ) : null}
                {series.map((s, i) => (
                  <Line
                    key={s.slug}
                    type="monotone"
                    dataKey={s.slug}
                    stroke={COLORS[i]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend doubles as navigation to each lake's detail page. */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
          {series.map((s, i) => (
            <Link
              key={s.slug}
              href={`/lake/${s.slug}`}
              className="inline-flex items-center gap-1.5 text-sm hover:text-accent hover:underline"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: COLORS[i] }}
              />
              {s.name}
              <span className="nums text-muted">{fmtPercent(s.percentFull)}</span>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted mt-2">
          {metric === "pct"
            ? "Percent of conservation capacity — the one metric directly comparable between reservoirs of different sizes."
            : "Conservation storage in acre-feet. Reservoirs differ enormously in size, so compare the shapes rather than the heights."}
        </p>
      </div>
    </div>
  );
}

function LakeSelect({
  value,
  color,
  options,
  taken,
  onChange,
  removable = false,
}: {
  value: string;
  color?: string;
  options: { slug: string; name: string }[];
  taken: string[];
  onChange: (slug: string) => void;
  removable?: boolean;
}) {
  const available = options.filter(
    (o) => o.slug === value || !taken.includes(o.slug),
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      {color ? (
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ background: color }}
        />
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={value === "" ? "Add a reservoir" : "Change reservoir"}
        className="rounded-lg border border-border bg-surface px-3 py-2 sm:py-1.5 text-sm outline-none focus:border-accent max-w-56 sm:max-w-64"
      >
        {value === "" ? <option value="">Add a reservoir…</option> : null}
        {removable ? <option value="">Remove</option> : null}
        {available.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </span>
  );
}
