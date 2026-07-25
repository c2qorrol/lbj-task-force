# Upstream data sources

Every external feed this site consumes, what it is trusted for, and the trap it
sets. None require an API key. The reasoning behind each choice is in
`README.md`; this is the lookup table.

| Source | Powers | Base | Cache | Fetched |
| --- | --- | --- | --- | --- |
| TWDB reservoirs | Levels, storage, history | `waterdatafortexas.org/reservoirs` | 6 h conditions, 12 h history | Per request |
| TWDB groundwater | Well depths | `waterdatafortexas.org/groundwater` | 6 h list, 12 h history | Per request |
| USGS NWIS instantaneous | Lake elevation, river stage & flow | `waterservices.usgs.gov/nwis/iv/` | 10–15 min | Per request |
| USGS NWIS daily statistics | Flow percentile normals | `waterservices.usgs.gov/nwis/stat/` | — | Precomputed |
| USGS NLDI | Reservoir → river gage attribution | Hydro network navigation | — | Precomputed |
| NWS NWPS | Flood categories, river forecasts | `api.water.noaa.gov/nwps/v1` | 15 min, 1 h forecasts | Per request |
| US Drought Monitor | County drought severity | `usdmdataservices.unl.edu/api` | 6 h | Per request |
| CoCoRaHS | Rainfall | `data.cocorahs.org` | 3 h | Per request |
| USACE CWMS | Lakes with no USGS gage | `cwms-data.usace.army.mil/cwms-data` | 15 min | Per request |

Page-level `revalidate` is 1 h for most routes and 15 min for `/lake/[slug]`.
All caching depends on the KV incremental cache binding — see the README.

## Traps, by source

**TWDB** throttles aggressive clients: we measured 502/503 after roughly 100
rapid requests. Nothing may fan out across the 122 reservoirs at request time.
Its CSVs open with about 20 `#`-prefixed disclaimer lines before the header,
carry different column sets per file (the statewide file has no elevation or
area), and a period-of-record file reaches 1.9 MB — which is why history is
precomputed into `public/history/`. A custom `User-Agent` is sent. Reservoirs
carry `tags` that drive basin, region, climate, `municipal_*` supply-system
membership and the `texas` flag that scopes statewide totals.

**USGS instantaneous values** encode missing data as `-999999` and
ice-affected discharge as `-1`; both must be filtered, not rendered. One site
reporting two parameters comes back as two series and has to be merged. The
statewide Texas response is around 2.8 MB, which exceeds Next's 2 MB data-cache
ceiling — you will see it decline to cache during a build, and that is
expected rather than a bug.

**USGS daily statistics** answer in RDB (tab-separated, `#` comments, a header
row, then a column-width row that must be skipped), cap a request at 10 sites,
and total roughly 15 MB statewide — hence precomputation. This replaced
WaterWatch, whose realtime percentile service was decommissioned; its URLs now
redirect to a blog post rather than data.

**NWPS** shares no identifier with USGS, so gauges are matched to USGS sites by
position within 1 km — they are physically the same installations. Forecast
flow is published in **kcfs**, stage in feet, and a missing value is `-999`. A
gauge with no active forecast returns HTTP 200 with an empty `data` array
rather than a 404 — check the array, not the status. Forecasts are widespread:
768 of the 1,039 gauges in the Texas bounding box carried one when last
counted. What limits the forecast panel is not availability but proximity —
a gauge has to sit within 1 km of the lake's own gage or one of its
precomputed inflow/outflow gages.

**CoCoRaHS** is volunteer observation: one manual 24-hour total read each
morning, not telemetry, and it must never be presented as real-time. It was
chosen over USGS precipitation (parameter `00045`), which mixes incremental and
cumulative series with no reliable way to tell them apart — summing it produced
a physically impossible 56-inch daily total during testing.

**USACE CWMS** is consulted only for reservoirs with no USGS gage. Many of its
catalogue entries are location records with no published time series, so the
usable mappings are precomputed rather than discovered live.

## Regenerating precomputed data

```bash
npm run sync:slugs        # TWDB reservoir key -> URL slug
npm run sync:counties     # county basemap geometry
npm run sync:flow         # reservoir -> inflow/outflow gage (slow; ~2 NLDI calls/lake)
npm run sync:usace        # CWMS series for lakes with no USGS gage
npm run sync:history      # per-lake period-of-record series (slow; 122 downloads)
npm run sync:percentiles  # monthly flow percentile thresholds (~60 batched requests)
```

Output is committed. Nothing regenerates at request time, so a stale checkout
serves stale normals rather than failing. Yearly is plenty for history and
percentiles; rerun the attribution scripts when gages or reservoirs change.

## Adding a source

Follow the existing shape, which exists for reasons the README documents:

1. One module in `src/lib/` owns the fetch, the parse and the cache window.
   Nothing else calls the upstream.
2. Decide live versus precomputed by payload and volatility. Anything that
   would fan out per-lake, or that exceeds a couple of megabytes, belongs in a
   `scripts/sync-*.mjs` and gets committed.
3. Give it a fallback. A new source is enrichment: `.catch()` to a neutral
   value, and stream the panel in `<Suspense>` if it is slow.
4. Say what it does not measure. Every panel here states its own limits —
   rainfall near the dam is not rainfall over the watershed, a river forecast
   is not a lake-level forecast. Keep that up.
