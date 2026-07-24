import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

/**
 * OpenNext configuration for Cloudflare Workers.
 *
 * The incremental cache is backed by Workers KV and fronted by a regional
 * cache. Both layers matter here for the same reason: every ISR route on this
 * site is ultimately backed by TWDB, USGS or USDM, and TWDB throttles bursts.
 * KV keeps one shared copy across isolates; the regional layer keeps repeat
 * reads inside a colo from going back to KV on every request.
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(kvIncrementalCache, {
    mode: "long-lived",
  }),
});
