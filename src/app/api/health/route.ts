import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

/**
 * Upstream health, as JSON.
 *
 * Cached for ten minutes so that neither a monitor nor a curious visitor can
 * turn this into a way to hammer eight agencies. That also matches what the
 * checks measure: the data the site is currently serving, not a fresh fetch
 * nobody else sees.
 */
export const revalidate = 600;

export async function GET() {
  const report = await runHealthChecks();

  /*
   * 503 only when a critical feed is gone, so an uptime monitor pointed here
   * without reading the body still gets the right answer. A missing enrichment
   * panel answers 200 with status "degraded" — the site is up, and paging on
   * that would train everyone to ignore the alert.
   */
  return NextResponse.json(report, {
    status: report.status === "down" ? 503 : 200,
    headers: { "cache-control": "public, max-age=0, must-revalidate" },
  });
}
