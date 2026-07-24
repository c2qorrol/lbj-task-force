/**
 * Regenerates src/data/tx-counties.json — the basemap geometry for /map.
 *
 * Source is the Census cartographic county boundaries (via plotly's mirror of
 * the FIPS-keyed GeoJSON), filtered to STATE "48" and stored in a compact form:
 * each ring is a flat [lon, lat, lon, lat, …] array with coordinates rounded to
 * three decimals (~90 m), which is far finer than a statewide SVG can resolve
 * and cuts the payload substantially.
 *
 * Geometry stays in lon/lat rather than pre-projected SVG paths so that the map
 * component projects counties and reservoir markers through the exact same
 * function — baking paths at build time risks the basemap drifting out of
 * register with the dots.
 *
 * Run:  npm run sync:counties
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
const TEXAS_FIPS = "48";
const PRECISION = 1000; // three decimal places

const round = (n) => Math.round(n * PRECISION) / PRECISION;

/** Drop consecutive duplicate points left behind by rounding. */
function compactRing(ring) {
  const flat = [];
  let lastX = NaN;
  let lastY = NaN;
  for (const [lon, lat] of ring) {
    const x = round(lon);
    const y = round(lat);
    if (x === lastX && y === lastY) continue;
    flat.push(x, y);
    lastX = x;
    lastY = y;
  }
  return flat;
}

async function main() {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  const geojson = await response.json();

  const counties = geojson.features
    .filter((f) => f.properties?.STATE === TEXAS_FIPS)
    .map((f) => {
      const polygons =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
      const rings = [];
      for (const polygon of polygons) {
        for (const ring of polygon) {
          const compact = compactRing(ring);
          // A ring needs at least three distinct points to enclose area.
          if (compact.length >= 6) rings.push(compact);
        }
      }
      return {
        fips: f.properties.STATE + f.properties.COUNTY,
        name: f.properties.NAME,
        rings,
      };
    })
    .filter((c) => c.rings.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Texas has 254 counties; anything else means the source changed shape.
  if (counties.length !== 254) {
    throw new Error(
      `Expected 254 Texas counties, got ${counties.length}. Refusing to write a bad basemap.`,
    );
  }

  const bounds = counties.reduce(
    (acc, county) => {
      for (const ring of county.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          acc.west = Math.min(acc.west, ring[i]);
          acc.east = Math.max(acc.east, ring[i]);
          acc.south = Math.min(acc.south, ring[i + 1]);
          acc.north = Math.max(acc.north, ring[i + 1]);
        }
      }
      return acc;
    },
    { west: 180, east: -180, south: 90, north: -90 },
  );

  const payload = { bounds, counties };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const out = join(root, "src", "data", "tx-counties.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(payload), "utf8");

  const bytes = JSON.stringify(payload).length;
  console.log(
    `Wrote ${counties.length} counties (${(bytes / 1024).toFixed(0)} KB) to ${out}`,
  );
  console.log(
    `Bounds: ${bounds.west.toFixed(3)}, ${bounds.south.toFixed(3)} → ${bounds.east.toFixed(3)}, ${bounds.north.toFixed(3)}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
