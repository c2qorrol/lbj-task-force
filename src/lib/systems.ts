import { getAllReservoirs } from "./twdb";
import type { Reservoir } from "./types";

/**
 * Municipal water-supply systems — TWDB's own groupings of which reservoirs
 * supply which metro area, carried as `municipal_*` tags on the reservoirs
 * feed this site already consumes. A reservoir can serve several systems
 * (Lake Texoma is both Dallas and Texarkana supply, for example), so systems
 * overlap and must never be summed with each other.
 *
 * Unlike the statewide rollup, members outside Texas are counted: Elephant
 * Butte doesn't count as Texas supply, but it absolutely is El Paso's.
 */

const TAG_PREFIX = "municipal_";

/** Tag slugs whose display name isn't a straight title-casing. */
const DISPLAY: Record<string, string> = {
  beaumont_port_arthur: "Beaumont – Port Arthur",
  midland_odessa: "Midland – Odessa",
  temple_killeen: "Temple – Killeen",
  wichita_falls: "Wichita Falls",
  corpus_christi: "Corpus Christi",
  san_angelo: "San Angelo",
  el_paso: "El Paso",
  fort_worth: "Fort Worth",
};

function displayName(key: string): string {
  return (
    DISPLAY[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export interface SupplySystem {
  key: string;
  name: string;
  lakes: Reservoir[];
  /** Storage-weighted fill across the member reservoirs. */
  percentFull: number;
  totalStorage: number;
  totalCapacity: number;
  asOf: string;
}

export async function getSupplySystems(): Promise<SupplySystem[]> {
  const reservoirs = await getAllReservoirs();

  const byKey = new Map<string, Reservoir[]>();
  for (const r of reservoirs) {
    for (const tag of r.tags) {
      if (!tag.startsWith(TAG_PREFIX)) continue;
      const key = tag.slice(TAG_PREFIX.length);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(r);
      else byKey.set(key, [r]);
    }
  }

  return [...byKey.entries()]
    .map(([key, lakes]) => {
      let totalStorage = 0;
      let totalCapacity = 0;
      for (const l of lakes) {
        if (l.conservationStorage !== null) totalStorage += l.conservationStorage;
        if (l.conservationCapacity !== null) totalCapacity += l.conservationCapacity;
      }
      return {
        key,
        name: displayName(key),
        lakes: lakes.sort(
          (a, b) =>
            (b.conservationCapacity ?? 0) - (a.conservationCapacity ?? 0),
        ),
        percentFull: totalCapacity > 0 ? (totalStorage / totalCapacity) * 100 : 0,
        totalStorage,
        totalCapacity,
        asOf: lakes.map((l) => l.date).sort().at(-1) ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
