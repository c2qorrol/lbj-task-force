/**
 * Shared tokens for generated Open Graph images.
 *
 * These are rendered by Satori, which supports only a subset of CSS: flexbox
 * only (no grid), every element with more than one child needs an explicit
 * `display: flex`, and colours must be literal values rather than the CSS
 * variables the site itself uses. Hence the duplicated palette below — it
 * intentionally mirrors the dark theme in `globals.css`.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const OG = {
  background: "#071013",
  surface: "#0e1a1f",
  border: "#1d2f36",
  foreground: "#e6f1f4",
  muted: "#8ba3ac",
  accent: "#22d3ee",
} as const;

/** Fill-status colours, matching `STATUS_HEX` in format.ts. */
export const OG_STATUS: Record<string, string> = {
  flood: "#0ea5e9",
  full: "#10b981",
  normal: "#14b8a6",
  low: "#f59e0b",
  critical: "#f43f5e",
  unknown: "#94a3b8",
};

/** Bare hostname for display inside the generated OG cards. */
export function ogHost(): string {
  return new URL(siteUrl()).host;
}

/** Absolute site origin, needed for absolute og:image and canonical URLs. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}
