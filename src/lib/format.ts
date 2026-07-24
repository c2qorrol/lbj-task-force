/** Fill-status bands. These drive every color decision in the UI. */
export type FillStatus = "flood" | "full" | "normal" | "low" | "critical" | "unknown";

export function fillStatus(percentFull: number | null): FillStatus {
  if (percentFull === null) return "unknown";
  if (percentFull > 100) return "flood";
  if (percentFull >= 95) return "full";
  if (percentFull >= 50) return "normal";
  if (percentFull >= 25) return "low";
  return "critical";
}

export const STATUS_LABEL: Record<FillStatus, string> = {
  flood: "Above conservation pool",
  full: "Full",
  normal: "Normal",
  low: "Low",
  critical: "Critically low",
  unknown: "No data",
};

/** Tailwind classes per band, kept together so charts and tables agree. */
export const STATUS_CLASS: Record<FillStatus, string> = {
  flood: "text-sky-600 dark:text-sky-400",
  full: "text-emerald-600 dark:text-emerald-400",
  normal: "text-teal-700 dark:text-teal-300",
  low: "text-amber-600 dark:text-amber-400",
  critical: "text-rose-600 dark:text-rose-400",
  unknown: "text-muted",
};

export const STATUS_BG: Record<FillStatus, string> = {
  flood: "bg-sky-500",
  full: "bg-emerald-500",
  normal: "bg-teal-500",
  low: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-slate-400",
};

/** Hex equivalents for canvas/SVG contexts that can't use Tailwind classes. */
export const STATUS_HEX: Record<FillStatus, string> = {
  flood: "#0ea5e9",
  full: "#10b981",
  normal: "#14b8a6",
  low: "#f59e0b",
  critical: "#f43f5e",
  unknown: "#94a3b8",
};

export function fmtNumber(n: number | null, digits = 0): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtFeet(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)} ft`;
}

/** Acre-feet, abbreviated once the numbers reach millions. */
export function fmtAcreFeet(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M af`;
  return `${fmtNumber(n)} af`;
}

export function fmtSigned(n: number | null, digits = 2, unit = "ft"): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)} ${unit}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Timestamps from USGS carry an offset; render them in Texas local time. */
export function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
}

/**
 * Elapsed time in words.
 *
 * Reads `Date.now()`, so the server and the client necessarily disagree — a
 * value rendered as "27m ago" hydrates as "28m ago". Call sites must mark the
 * containing element `suppressHydrationWarning`; without it React reports a
 * hydration mismatch and re-renders the whole root on the client.
 */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
