/**
 * Regenerates src/data/flow-gages.json — the reservoir → river-gage mapping.
 *
 * Attributing a discharge gage to a reservoir cannot be done by proximity: a
 * gage 5 km away may be on an entirely different river. Name matching is no
 * better — only a handful of the 618 active Texas discharge gages mention a
 * lake at all.
 *
 * So this uses the USGS Network Linked Data Index, which navigates the real
 * NHD hydrography network. From each reservoir's dam gage we walk:
 *   UM (upstream main stem)   -> the gage measuring inflow
 *   DM (downstream main stem) -> the gage measuring release
 * and keep the nearest site along each path that actually reports discharge.
 *
 * Because this is ~2 network calls per reservoir against a rate-limited public
 * service, it runs as a build step, not at request time.
 *
 * Run:  npm run sync:flow
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const NLDI = "https://api.water.usgs.gov/nldi/linked-data/nwissite";
const IV = "https://waterservices.usgs.gov/nwis/iv/";
const TWDB = "https://www.waterdatafortexas.org/reservoirs/recent-conditions.json";

/** How far along the network to walk, in kilometres. */
const UPSTREAM_KM = 200;
const DOWNSTREAM_KM = 100;
/** Be a polite client to a free public API. */
const DELAY_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

/** Every active Texas gage reporting discharge, keyed by site id. */
async function loadDischargeGages() {
  const json = await getJson(
    `${IV}?format=json&stateCd=tx&parameterCd=00060&siteStatus=active`,
  );
  const map = new Map();
  for (const ts of json.value?.timeSeries ?? []) {
    const id = ts.sourceInfo.siteCode[0]?.value;
    if (!id || map.has(id)) continue;
    const geo = ts.sourceInfo.geoLocation?.geogLocation;
    map.set(id, {
      siteId: id,
      siteName: ts.sourceInfo.siteName,
      lat: geo?.latitude ?? null,
      lon: geo?.longitude ?? null,
    });
  }
  return map;
}

/** Site ids along a navigation path, in network order from the start site. */
async function navigate(siteId, direction, distanceKm) {
  try {
    const json = await getJson(
      `${NLDI}/USGS-${siteId}/navigation/${direction}/nwissite?distance=${distanceKm}`,
    );
    return (json.features ?? [])
      .map((f) => String(f.properties?.identifier ?? ""))
      .filter((id) => id.startsWith("USGS-"))
      .map((id) => id.replace(/^USGS-/, ""));
  } catch {
    return [];
  }
}

/**
 * The reservoir→lake-gage pairing, recomputed here with the same rule the app
 * uses at runtime so the two cannot drift apart.
 */
const STOPWORDS = new Set([
  "lake", "lk", "reservoir", "res", "the", "of", "near", "nr", "at", "abv",
  "above", "below", "blw", "tx", "texas", "creek", "ck", "river", "rv", "north",
  "south", "east", "west", "n", "s", "e", "w", "fk", "fork", "lcra", "city",
]);

export const tokens = (name) =>
  new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );

export function nameOverlap(a, b) {
  const tb = tokens(b);
  for (const t of tokens(a)) if (tb.has(t)) return true;
  return false;
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function loadLakeGages() {
  const json = await getJson(
    `${IV}?format=json&stateCd=tx&parameterCd=62614,62615,00062&siteStatus=active`,
  );
  return (json.value?.timeSeries ?? [])
    .map((ts) => {
      const geo = ts.sourceInfo.geoLocation?.geogLocation;
      return {
        siteId: ts.sourceInfo.siteCode[0]?.value,
        siteName: ts.sourceInfo.siteName,
        lat: geo?.latitude ?? null,
        lon: geo?.longitude ?? null,
      };
    })
    .filter((g) => g.siteId && g.lat !== null);
}

export function matchLakeGage(reservoir, gages) {
  const [lon, lat] = reservoir.gauge_location?.coordinates ?? [];
  if (lat === undefined) return null;
  let best = null;
  for (const gage of gages) {
    const km = haversineKm(lat, lon, gage.lat, gage.lon);
    if (km > 30) continue;
    if (km > 8 && !nameOverlap(reservoir.full_name, gage.siteName)) continue;
    if (!best || km < best.km) best = { gage, km };
  }
  return best?.gage ?? null;
}

async function main() {
  const [conditions, lakeGages, discharge] = await Promise.all([
    getJson(TWDB),
    loadLakeGages(),
    loadDischargeGages(),
  ]);
  console.log(
    `Loaded ${Object.keys(conditions).length} reservoirs, ${lakeGages.length} lake gages, ${discharge.size} discharge gages.`,
  );

  const slugsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "lib",
    "slugs.ts",
  );
  const slugSource = await readFile(slugsPath, "utf8");
  const slugMap = Object.fromEntries(
    [...slugSource.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  const result = {};
  let withInflow = 0;
  let withOutflow = 0;
  let processed = 0;

  for (const [key, reservoir] of Object.entries(conditions)) {
    const slug = slugMap[key];
    if (!slug) continue;
    const lakeGage = matchLakeGage(reservoir, lakeGages);
    if (!lakeGage) continue;

    processed++;
    const [upstream, downstream] = [
      await navigate(lakeGage.siteId, "UM", UPSTREAM_KM),
      await navigate(lakeGage.siteId, "DM", DOWNSTREAM_KM),
    ];
    await sleep(DELAY_MS);

    // Nearest discharge gage along each path, excluding the dam gage itself.
    const inflowId = upstream.find((id) => id !== lakeGage.siteId && discharge.has(id));
    const outflowId = downstream.find((id) => id !== lakeGage.siteId && discharge.has(id));

    /*
     * A site reachable both up and downstream means the navigation looped or the
     * dam gage sits off the main stem; the direction is then meaningless, so
     * drop it rather than publish a gage labelled as both inflow and release.
     */
    if (inflowId && outflowId && inflowId === outflowId) {
      console.log(`  ${slug.padEnd(24)} SKIPPED — ${inflowId} resolved both ways`);
      continue;
    }

    if (!inflowId && !outflowId) continue;

    /*
     * Straight-line distance from the dam. NLDI returns network order but not
     * path length, and this is the honest signal for how much to trust an
     * attribution: a release gage 8 km below the dam is the dam's outflow, while
     * one 90 km downstream has picked up tributaries and other reservoirs.
     */
    const withDistance = (id) => {
      if (!id) return null;
      const gage = discharge.get(id);
      const km =
        gage.lat !== null
          ? haversineKm(lakeGage.lat, lakeGage.lon, gage.lat, gage.lon)
          : null;
      return { ...gage, km: km === null ? null : Math.round(km * 10) / 10 };
    };

    const inflow = withDistance(inflowId);
    const outflow = withDistance(outflowId);
    if (inflow) withInflow++;
    if (outflow) withOutflow++;

    result[slug] = { lakeGage: lakeGage.siteId, inflow, outflow };

    console.log(
      `  ${slug.padEnd(24)} in=${inflowId ?? "—"}${inflow?.km ? `(${inflow.km}km)` : ""}` +
        ` out=${outflowId ?? "—"}${outflow?.km ? `(${outflow.km}km)` : ""}`,
    );
  }

  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "data",
    "flow-gages.json",
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2), "utf8");

  console.log(
    `\nWalked ${processed} reservoirs with a dam gage. Mapped ${Object.keys(result).length} ` +
      `(${withInflow} inflow, ${withOutflow} outflow) to ${out}`,
  );
}

/*
 * Only run when executed directly — `node scripts/<name>.mjs`. Importing this
 * file (the tests do) must not kick off a download.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
