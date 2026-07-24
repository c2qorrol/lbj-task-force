import { fillStatus, STATUS_BG, STATUS_CLASS, STATUS_LABEL } from "@/lib/format";
import type { TrendDirection } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`nums text-2xl mt-1 font-semibold ${tone}`}>{value}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </Card>
  );
}

/**
 * Horizontal fill gauge. Bars are clamped at 100% width so a reservoir spilling
 * into its flood pool doesn't blow out the row, but the label still shows the
 * true figure and the bar switches color to flag it.
 */
export function FillBar({
  percentFull,
  className = "",
}: {
  percentFull: number | null;
  className?: string;
}) {
  const status = fillStatus(percentFull);
  const width = percentFull === null ? 0 : Math.min(Math.max(percentFull, 0), 100);
  return (
    <div
      className={`h-2 w-full rounded-full bg-border/70 overflow-hidden ${className}`}
      role="img"
      aria-label={`${STATUS_LABEL[status]}, ${percentFull === null ? "no data" : `${percentFull.toFixed(1)} percent full`}`}
    >
      <div
        className={`h-full rounded-full ${STATUS_BG[status]} transition-[width]`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function StatusPill({ percentFull }: { percentFull: number | null }) {
  const status = fillStatus(percentFull);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      <span className={`h-2 w-2 rounded-full ${STATUS_BG[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const TREND_GLYPH: Record<TrendDirection, string> = {
  rising: "▲",
  falling: "▼",
  steady: "▬",
  unknown: "–",
};

/**
 * Rising is shown as positive (blue/green) and falling as negative — the
 * opposite of a stock ticker, which is the correct convention for water supply.
 */
const TREND_CLASS: Record<TrendDirection, string> = {
  rising: "text-sky-600 dark:text-sky-400",
  falling: "text-amber-600 dark:text-amber-400",
  steady: "text-muted",
  unknown: "text-muted",
};

export function TrendBadge({
  direction,
  children,
}: {
  direction: TrendDirection;
  children: React.ReactNode;
}) {
  return (
    <span className={`nums inline-flex items-center gap-1 ${TREND_CLASS[direction]}`}>
      <span aria-hidden className="text-[0.7em]">
        {TREND_GLYPH[direction]}
      </span>
      {children}
    </span>
  );
}

export function LiveDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
    />
  );
}

export function SectionHeading({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}
