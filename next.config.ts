import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /*
           * HSTS. Browsers ignore this over plain HTTP, so it only takes effect
           * after one HTTPS visit — after which they refuse to try HTTP for
           * this host again. It complements, rather than replaces, the
           * "Always Use HTTPS" redirect at the Cloudflare edge.
           *
           * Deliberately without `includeSubDomains` or `preload`: both are
           * sticky in browser caches and would commit every future subdomain to
           * HTTPS-only before there is any reason to.
           */
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

/*
 * Exposes Cloudflare bindings (the KV incremental cache, ASSETS) while running
 * `next dev`, so local development behaves like the Workers runtime. This is a
 * no-op in a production build.
 */
initOpenNextCloudflareForDev();
