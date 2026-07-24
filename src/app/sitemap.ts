import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/og";
import { getAllReservoirs } from "@/lib/twdb";
import { getWells } from "@/lib/groundwater";

/**
 * The interesting URLs here are the ~122 lake and ~400 well pages, which have
 * no crawlable index anywhere else — the table on `/` is the only path in, and
 * the well list is rendered client-side on the map. Both feeds are the same
 * cached calls the pages themselves make, so this adds no upstream load.
 *
 * Either feed being down degrades to the static routes rather than failing the
 * sitemap: an incomplete sitemap is useful, a 502 is not.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/map`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/basins`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/cities`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/drought`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/compare`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/groundwater`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const [reservoirs, wells] = await Promise.all([
    getAllReservoirs().catch(() => []),
    getWells().catch(() => []),
  ]);

  const lakeRoutes: MetadataRoute.Sitemap = reservoirs.map((r) => ({
    url: `${base}/lake/${r.slug}`,
    lastModified: r.date,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const wellRoutes: MetadataRoute.Sitemap = wells.map((w) => ({
    url: `${base}/groundwater/${w.number}`,
    lastModified: w.date,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...lakeRoutes, ...wellRoutes];
}
