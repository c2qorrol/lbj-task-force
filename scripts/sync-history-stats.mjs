/**
 * Regenerates public/history/<slug>.json — compact period-of-record series.
 *
 * TWDB serves a reservoir's full history only as one large CSV (up to ~1.9 MB
 * and ~30,600 rows, eight columns wide). Fetching and parsing that on the
 * request path cost 10–30 s per cold lake page on Workers, because a
 * short-lived isolate rarely reuses an in-process cache.
 *
 * Percentiles need only two of those columns — date and percent full — so this
 * strips the rest and stores the values positionally:
 *
 *   { "first": "1940-09-30", "values": [216, 217, null, 219, ...] }
 *
 * Index is days since `first`; values are percent-full in tenths (216 = 21.6%),
 * `null` where TWDB has no reading. That is ~15x smaller than the CSV and needs
 * no CSV parsing at runtime. Files are served as static assets from the edge.
 *
 * Run:  npm run sync:history      (slow — 122 sequential downloads)
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://www.waterdatafortexas.org/reservoirs";
const UA = "tx-lake-monitor";

/**
 * TWDB throttles bursts with 502/503 — the whole reason this data is
 * precomputed rather than fetched live. Stay sequential and unhurried.
 */
const DELAY_MS = 1200;
const RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY_MS = 86_400_000;

async function fetchCsv(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return res.text();
      if (res.status === 404) return null;
      // 502/503 means we are being throttled; back off progressively.
      await sleep(DELAY_MS * attempt * 4);
    } catch {
      await sleep(DELAY_MS * attempt * 4);
    }
  }
  return null;
}

/** Pull just (date, percent_full) out of a TWDB reservoir CSV. */
function parse(text) {
  const lines = text.split("\n");
  let header = null;
  let iDate = -1;
  let iPct = -1;
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!header) {
      header = trimmed.split(",").map((h) => h.trim());
      iDate = header.indexOf("date");
      iPct = header.indexOf("percent_full");
      if (iDate < 0 || iPct < 0) return [];
      continue;
    }
    const cells = trimmed.split(",");
    const date = cells[iDate]?.trim();
    const raw = cells[iPct]?.trim();
    if (!date) continue;
    const value = raw === "" || raw === undefined ? null : Number(raw);
    rows.push({ date, value: Number.isFinite(value) ? value : null });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Positional encoding: index = days since first date, value = tenths. */
function encode(rows) {
  const withValue = rows.filter((r) => r.value !== null);
  if (withValue.length < 365) return null;

  const first = withValue[0].date;
  const last = withValue[withValue.length - 1].date;
  const span = Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS);
  const values = new Array(span + 1).fill(null);

  for (const row of withValue) {
    const index = Math.round((Date.parse(row.date) - Date.parse(first)) / DAY_MS);
    if (index >= 0 && index < values.length) {
      values[index] = Math.round(row.value * 10);
    }
  }
  return { first, values };
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const slugSource = await readFile(join(root, "src", "lib", "slugs.ts"), "utf8");
  const slugs = [
    ...new Set(
      [...slugSource.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => m[2]),
    ),
  ].sort();

  const outDir = join(root, "public", "history");
  await mkdir(outDir, { recursive: true });

  console.log(`Precomputing history for ${slugs.length} reservoirs…`);
  let written = 0;
  let bytes = 0;
  const skipped = [];

  for (const [index, slug] of slugs.entries()) {
    const text = await fetchCsv(`${BASE}/individual/${slug}.csv`);
    if (!text) {
      skipped.push(`${slug}: download failed`);
      await sleep(DELAY_MS);
      continue;
    }

    const encoded = encode(parse(text));
    if (!encoded) {
      skipped.push(`${slug}: fewer than 365 readings`);
      await sleep(DELAY_MS);
      continue;
    }

    const json = JSON.stringify(encoded);
    await writeFile(join(outDir, `${slug}.json`), json, "utf8");
    written++;
    bytes += json.length;

    console.log(
      `  [${String(index + 1).padStart(3)}/${slugs.length}] ${slug.padEnd(24)} ` +
        `${encoded.first} → ${encoded.values.length} days, ${(json.length / 1024).toFixed(0)} KB ` +
        `(source ${(text.length / 1024 / 1024).toFixed(2)} MB)`,
    );

    await sleep(DELAY_MS);
  }

  console.log(
    `\nWrote ${written} files, ${(bytes / 1024 / 1024).toFixed(1)} MB total, to ${outDir}`,
  );
  if (skipped.length > 0) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
