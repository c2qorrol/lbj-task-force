/**
 * Regenerates src/lib/slugs.ts.
 *
 * TWDB's JSON feed keys reservoirs by condensed name ("BASteinhagen") while its
 * CSV endpoints use a slug ("b-a-steinhagen"). The transform is not mechanically
 * derivable — compare "BoisDArc" -> "bois-darc" against "OCFisher" ->
 * "o-c-fisher" — so we scrape the authoritative slug list off the statewide page
 * and pair it with the JSON keys by comparing alphanumeric-only forms.
 *
 * Run when TWDB adds or renames a reservoir:  npm run sync:slugs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const CONDITIONS = "https://www.waterdatafortexas.org/reservoirs/recent-conditions.json";
const STATEWIDE = "https://www.waterdatafortexas.org/reservoirs/statewide";

export const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const conditions = await (await fetch(CONDITIONS)).json();
  const html = await (
    await fetch(STATEWIDE, { headers: { "User-Agent": "Mozilla/5.0" } })
  ).text();

  const slugs = [
    ...new Set(
      [...html.matchAll(/\/reservoirs\/individual\/([a-z0-9-]+)/g)].map((m) => m[1]),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("No slugs found on the statewide page — did the markup change?");
  }

  const bySlug = new Map(slugs.map((s) => [normalize(s), s]));
  const map = {};
  const unmatched = [];

  for (const key of Object.keys(conditions)) {
    const condensed = conditions[key].condensed_name ?? key;
    const slug = bySlug.get(normalize(condensed)) ?? bySlug.get(normalize(key));
    if (slug) map[key] = slug;
    else unmatched.push(`${key} (condensed: ${condensed})`);
  }

  if (unmatched.length > 0) {
    console.error("Could not match these reservoirs to a slug:");
    for (const u of unmatched) console.error(`  - ${u}`);
    throw new Error(`${unmatched.length} reservoir(s) unmatched; refusing to write a partial map.`);
  }

  const entries = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");

  const contents = `/**
 * TWDB reservoir key -> URL slug.
 *
 * GENERATED FILE — do not edit by hand. Run \`npm run sync:slugs\` to refresh.
 *
 * TWDB's JSON feed keys reservoirs by condensed name ("BASteinhagen") while its
 * CSV endpoints use a different slug ("b-a-steinhagen"), and the transform is not
 * mechanically derivable (compare "bois-darc"). This map is produced by matching
 * both sources on their alphanumeric-only forms.
 */
export const RESERVOIR_SLUGS: Record<string, string> = {
${entries}
};

export const ALL_SLUGS = Object.values(RESERVOIR_SLUGS);
`;

  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "slugs.ts");
  await writeFile(out, contents, "utf8");
  console.log(`Wrote ${Object.keys(map).length} reservoir slugs to ${out}`);
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
