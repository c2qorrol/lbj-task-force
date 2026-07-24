import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/og";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The JSON/CSV API duplicates page content; keep crawl budget on pages.
      disallow: "/api/",
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
