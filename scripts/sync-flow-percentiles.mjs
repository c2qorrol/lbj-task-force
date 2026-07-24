/**
 * Regenerates src/data/flow-percentiles.json — monthly discharge percentile
 * thresholds for every active Texas discharge gage.
 *
 * USGS decommissioned the WaterWatch realtime-percentile service in 2025, so
 * "is this river high or low for the season?" now has to be computed from the
 * daily-statistics service (nwis/stat), which publishes period-of-record
 * percentiles per calendar day. Fetching that statewide is ~15 MB across ~620
 * sites — far too heavy for the request path — so this precomputes it, the
 * same trade the reservoir history stats make.
 *
 * Day-of-year rows are collapsed to per-month medians of the p10/p25/p50/p75/
 * p90 thresholds. Classification only needs to place a current reading in a
 * band, and a month is well within the precision of "normal for this time of
 * year". Rows with under 10 years of record are dropped.
 *
 * Output: { "<siteId>": [ [p10,p25,p50,p75,p90] | null, ... 12 months ] }
 *
 * Run:  npm run sync:percentiles      (~60 batched requests, a few minutes)
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const IV = "https://waterservices.usgs.gov/nwis/iv/";
const STAT = "https://waterservices.usgs.gov/nwis/stat/";
const DISCHARGE = "00060";

const BATCH = 10; // nwis/stat caps sites-per-request at 10
const DELAY_MS = 500;
const RETRIES = 3;
const MIN_YEARS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.text();
      if (res.status === 404) return null;
      await sleep(DELAY_MS * attempt * 4);
    } catch {
      await sleep(DELAY_MS * attempt * 4);
    }
  }
  return null;
}

/** Every active Texas site currently reporting discharge. */
async function getDischargeSites() {
  const url = new URL(IV);
  url.searchParams.set("format", "json");
  url.searchParams.set("stateCd", "tx");
  url.searchParams.set("parameterCd", DISCHARGE);
  url.searchParams.set("siteStatus", "active");
  const text = await fetchText(url.toString());
  if (!text) throw new Error("site list download failed");
  const json = JSON.parse(text);
  const ids = new Set();
  for (const ts of json.value?.timeSeries ?? []) {
    const id = ts.sourceInfo?.siteCode?.[0]?.value;
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Parse one RDB response into per-site, per-month threshold arrays.
 * RDB: `#` comments, a header row, a column-width row, then data rows.
 */
function parseRdb(text, out) {
  const lines = text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
  if (lines.length < 3) return;
  const header = lines[0].split("\t");
  const col = (name) => header.indexOf(name);
  const iSite = col("site_no");
  const iMonth = col("month_nu");
  const iCount = col("count_nu");
  const iP = ["p10_va", "p25_va", "p50_va", "p75_va", "p90_va"].map(col);
  if (iSite < 0 || iMonth < 0 || iP.some((i) => i < 0)) return;

  // Collect every qualifying day-row's thresholds, keyed by site and month.
  for (const line of lines.slice(2)) {
    const cells = line.split("\t");
    const site = cells[iSite];
    const month = Number(cells[iMonth]);
    const years = Number(cells[iCount]);
    if (!site || !(month >= 1 && month <= 12) || !(years >= MIN_YEARS)) continue;

    const thresholds = iP.map((i) => Number(cells[i]));
    if (thresholds.some((t) => !Number.isFinite(t))) continue;

    const bySite = out.get(site) ?? new Map();
    const days = bySite.get(month) ?? [];
    days.push(thresholds);
    bySite.set(month, days);
    out.set(site, bySite);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Keep the JSON small: sub-unit precision means nothing at classification time. */
const compact = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sites = await getDischargeSites();
  console.log(`Fetching daily statistics for ${sites.length} discharge sites…`);

  const raw = new Map(); // site -> month -> [ [p10..p90], ... per day ]
  for (let i = 0; i < sites.length; i += BATCH) {
    const chunk = sites.slice(i, i + BATCH);
    const url = new URL(STAT);
    url.searchParams.set("format", "rdb");
    url.searchParams.set("sites", chunk.join(","));
    url.searchParams.set("statReportType", "daily");
    url.searchParams.set("statTypeCd", "all");
    url.searchParams.set("parameterCd", DISCHARGE);

    const text = await fetchText(url.toString());
    if (text) parseRdb(text, raw);
    else console.log(`  batch ${i / BATCH + 1}: download failed, skipped`);

    if ((i / BATCH) % 10 === 9) {
      console.log(`  ${Math.min(i + BATCH, sites.length)}/${sites.length} sites…`);
    }
    await sleep(DELAY_MS);
  }

  const result = {};
  for (const [site, months] of raw) {
    const table = Array.from({ length: 12 }, (_, m) => {
      const days = months.get(m + 1);
      // Under ~2 weeks of qualifying day-rows is too sparse to call a normal.
      if (!days || days.length < 14) return null;
      return Array.from({ length: 5 }, (_, p) =>
        compact(median(days.map((d) => d[p]))),
      );
    });
    if (table.some((m) => m !== null)) result[site] = table;
  }

  const outPath = join(root, "src", "data", "flow-percentiles.json");
  const json = JSON.stringify(result);
  await writeFile(outPath, json, "utf8");
  console.log(
    `Wrote ${Object.keys(result).length} sites (of ${sites.length} active), ` +
      `${(json.length / 1024).toFixed(0)} KB, to ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
