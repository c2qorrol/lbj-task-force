/**
 * Regenerates src/data/usace-gages.json.
 *
 * Twelve TWDB reservoirs have no real-time USGS lake-elevation gage because
 * they are operated by USACE, IBWC or the Bureau of Reclamation. USACE publishes
 * through its CWMS Data API, so this maps those reservoirs onto CWMS time series
 * and gives them the same real-time treatment as the rest.
 *
 * Matching is by proximity between the TWDB gauge location and CWMS locations
 * in the Texas districts (SWT/SWF/SWG), then by picking a pool-elevation series
 * for that location.
 *
 * Every candidate is validated against TWDB's own elevation before being kept.
 * That check does real work: a dam publishes headwater *and* tailwater series
 * whose identifiers look alike, and picking the tailwater one would silently
 * report a level tens of feet wrong. Anything outside tolerance is discarded.
 *
 * Run:  npm run sync:usace
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CWMS = "https://cwms-data.usace.army.mil/cwms-data";
const TWDB = "https://www.waterdatafortexas.org/reservoirs/recent-conditions.json";
const OFFICES = ["SWT", "SWF", "SWG"];
const HEADERS = {
  Accept: "application/json;version=2",
  "User-Agent": "tx-lake-monitor",
};

/** Max distance between the TWDB gauge and a CWMS location, km. */
const MATCH_KM = 20;
/** Max disagreement with TWDB's elevation before a series is rejected, feet. */
const ELEVATION_TOLERANCE_FT = 5;

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Rank candidate elevation series for a location.
 *
 * Excludes tailwater and alternate-datum series outright, prefers revised data
 * over raw telemetry, and prefers finer intervals.
 */
function rankSeries(name) {
  if (!/\.Elev\.Inst\./i.test(name)) return -1;
  if (/Tailwater|Elev-Alt|Elev-Tailwater|Forecast/i.test(name)) return -1;

  let score = 0;
  if (/Ccp-Rev/i.test(name)) score += 40;
  else if (/Rev-SCADA/i.test(name)) score += 30;
  else if (/Decodes-Raw/i.test(name)) score += 5;

  if (/\.15Minutes\./i.test(name)) score += 20;
  else if (/\.30Minutes\./i.test(name)) score += 15;
  else if (/\.1Hour\./i.test(name)) score += 10;
  else if (/\.1Day\./i.test(name)) score += 3;
  else if (/\.1Month\./i.test(name)) score -= 20;

  return score;
}

async function latestValue(office, tsId) {
  const end = new Date();
  const begin = new Date(Date.now() - 5 * 86_400_000);
  const url =
    `${CWMS}/timeseries?office=${office}&name=${encodeURIComponent(tsId)}` +
    `&begin=${begin.toISOString()}&end=${end.toISOString()}&page-size=1000`;
  try {
    const json = await getJson(url);
    const values = (json.values ?? []).filter((v) => v[1] !== null);
    if (values.length === 0) return null;
    const last = values[values.length - 1];
    return {
      value: last[1],
      at: new Date(last[0]).toISOString(),
      units: json.units ?? "ft",
    };
  } catch {
    return null;
  }
}

async function main() {
  const conditions = await getJson(TWDB);

  const slugSource = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "slugs.ts"),
    "utf8",
  );
  const slugMap = Object.fromEntries(
    [...slugSource.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  // Reservoirs with no real-time USGS elevation gage are the ones worth mapping.
  const usgs = await getJson(
    "https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=tx&parameterCd=62614,62615,00062&siteStatus=active",
  );
  const usgsGages = (usgs.value?.timeSeries ?? [])
    .map((ts) => ts.sourceInfo.geoLocation?.geogLocation)
    .filter(Boolean);

  const gaps = [];
  for (const [key, r] of Object.entries(conditions)) {
    const coords = r.gauge_location?.coordinates;
    if (!coords || !slugMap[key]) continue;
    const [lon, lat] = coords;
    const covered = usgsGages.some(
      (g) => haversineKm(lat, lon, g.latitude, g.longitude) <= 30,
    );
    if (!covered) {
      gaps.push({ slug: slugMap[key], name: r.full_name, lat, lon, elevation: r.elevation });
    }
  }
  console.log(`${gaps.length} reservoirs without a nearby USGS elevation gage.`);

  console.log("Loading CWMS locations…");
  const locations = [];
  for (const office of OFFICES) {
    try {
      const json = await getJson(`${CWMS}/locations?office=${office}`);
      const list = Array.isArray(json) ? json : (json.locations?.locations ?? []);
      for (const loc of list) {
        if (loc.latitude && loc.longitude) {
          locations.push({
            office,
            name: loc.name,
            publicName: loc["public-name"] ?? loc.name,
            lat: loc.latitude,
            lon: loc.longitude,
          });
        }
      }
    } catch (error) {
      console.warn(`  ${office}: ${error.message}`);
    }
  }
  console.log(`  ${locations.length} located CWMS sites.`);

  console.log("Loading CWMS time-series catalogs…");
  const catalog = new Map();
  for (const office of OFFICES) {
    try {
      const json = await getJson(
        `${CWMS}/catalog/TIMESERIES?office=${office}&page-size=20000`,
      );
      catalog.set(office, (json.entries ?? []).map((e) => e.name).filter(Boolean));
      console.log(`  ${office}: ${catalog.get(office).length} series`);
    } catch (error) {
      console.warn(`  ${office}: ${error.message}`);
      catalog.set(office, []);
    }
  }

  const result = {};
  const rejected = [];

  for (const gap of gaps) {
    let nearest = null;
    for (const loc of locations) {
      const km = haversineKm(gap.lat, gap.lon, loc.lat, loc.lon);
      if (!nearest || km < nearest.km) nearest = { ...loc, km };
    }
    if (!nearest || nearest.km > MATCH_KM) {
      rejected.push(`${gap.name}: no CWMS location within ${MATCH_KM} km`);
      continue;
    }

    const prefix = `${nearest.name}.`;
    const candidates = (catalog.get(nearest.office) ?? [])
      .filter((n) => n.startsWith(prefix))
      .map((n) => ({ name: n, score: rankSeries(n) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      rejected.push(`${gap.name}: no pool-elevation series at ${nearest.name}`);
      continue;
    }

    let chosen = null;
    for (const candidate of candidates.slice(0, 4)) {
      const reading = await latestValue(nearest.office, candidate.name);
      if (!reading) continue;
      const delta = Math.abs(reading.value - gap.elevation);
      if (gap.elevation !== null && delta > ELEVATION_TOLERANCE_FT) {
        rejected.push(
          `${gap.name}: ${candidate.name} read ${reading.value} vs TWDB ${gap.elevation} (${delta.toFixed(1)} ft off)`,
        );
        continue;
      }
      chosen = { candidate, reading, delta };
      break;
    }

    if (!chosen) continue;

    result[gap.slug] = {
      office: nearest.office,
      tsId: chosen.candidate.name,
      locationName: nearest.name,
      publicName: nearest.publicName,
      units: chosen.reading.units,
      lat: nearest.lat,
      lon: nearest.lon,
      km: Math.round(nearest.km * 10) / 10,
    };
    console.log(
      `  ${gap.slug.padEnd(16)} ${chosen.candidate.name.padEnd(42)} ` +
        `${chosen.reading.value} vs TWDB ${gap.elevation} (Δ${chosen.delta.toFixed(2)} ft)`,
    );
  }

  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "data",
    "usace-gages.json",
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2), "utf8");

  console.log(`\nMapped ${Object.keys(result).length} of ${gaps.length} to ${out}`);
  if (rejected.length > 0) {
    console.log("\nNot mapped:");
    for (const r of rejected) console.log(`  - ${r}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
