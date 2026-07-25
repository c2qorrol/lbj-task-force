import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupplySystems } from "@/lib/systems";
import { mockFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

function lake(
  key: string,
  name: string,
  tags: string[],
  storage: number,
  capacity: number,
) {
  return [
    key,
    {
      full_name: name,
      short_name: name,
      elevation: null,
      area: null,
      volume: null,
      conservation_storage: storage,
      conservation_capacity: capacity,
      conservation_pool_elevation: null,
      dead_pool_elevation: null,
      percent_full: capacity > 0 ? (storage / capacity) * 100 : 0,
      flood_control_lake: null,
      gauge_location: null,
      tags,
      timestamp: "2026-07-24",
    },
  ] as const;
}

const FEED = Object.fromEntries([
  lake("texoma", "Lake Texoma", ["texas", "municipal_dallas", "municipal_texarkana"], 500, 1000),
  lake("lavon", "Lake Lavon", ["texas", "municipal_dallas"], 300, 1000),
  lake("elephant-butte", "Elephant Butte Lake", ["new_mexico", "municipal_el_paso"], 32_212, 1_960_900),
  lake("travis", "Lake Travis", ["texas", "basin_colorado"], 900, 1000),
]);

describe("municipal supply systems", () => {
  it("groups reservoirs by their municipal tags", async () => {
    mockFetch([{ body: FEED }]);
    const systems = await getSupplySystems();

    expect(systems.map((s) => s.key).sort()).toEqual(["dallas", "el_paso", "texarkana"]);
    // A reservoir with no municipal tag belongs to no system.
    expect(systems.flatMap((s) => s.lakes.map((l) => l.name))).not.toContain("Lake Travis");
  });

  it("lets one reservoir serve several systems", async () => {
    mockFetch([{ body: FEED }]);
    const systems = await getSupplySystems();

    const dallas = systems.find((s) => s.key === "dallas")!;
    const texarkana = systems.find((s) => s.key === "texarkana")!;

    // Texoma is genuinely both, which is why systems overlap and must never be
    // summed with one another.
    expect(dallas.lakes.map((l) => l.name)).toContain("Lake Texoma");
    expect(texarkana.lakes.map((l) => l.name)).toContain("Lake Texoma");
  });

  it("weights a system's fill by storage across its members", async () => {
    mockFetch([{ body: FEED }]);
    const dallas = (await getSupplySystems()).find((s) => s.key === "dallas")!;

    // 800 of 2000 acre-feet across Texoma and Lavon.
    expect(dallas.totalStorage).toBe(800);
    expect(dallas.totalCapacity).toBe(2000);
    expect(dallas.percentFull).toBeCloseTo(40, 10);
  });

  it("counts out-of-state reservoirs, unlike the statewide totals", async () => {
    mockFetch([{ body: FEED }]);
    const elPaso = (await getSupplySystems()).find((s) => s.key === "el_paso")!;

    // Elephant Butte is excluded from Texas totals but *is* El Paso's supply.
    expect(elPaso.lakes.map((l) => l.name)).toEqual(["Elephant Butte Lake"]);
    expect(elPaso.percentFull).toBeCloseTo(1.64, 1);
  });

  it("orders members by capacity, largest first", async () => {
    mockFetch([{ body: FEED }]);
    const dallas = (await getSupplySystems()).find((s) => s.key === "dallas")!;
    const capacities = dallas.lakes.map((l) => l.conservationCapacity ?? 0);
    expect(capacities).toEqual([...capacities].sort((a, b) => b - a));
  });

  it("gives systems readable names", async () => {
    mockFetch([{ body: FEED }]);
    const systems = await getSupplySystems();
    const names = Object.fromEntries(systems.map((s) => [s.key, s.name]));

    expect(names.el_paso).toBe("El Paso");
    expect(names.dallas).toBe("Dallas");
  });
});
