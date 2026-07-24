"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aquiferColor, type WellCurrent } from "@/lib/groundwater";
import { useTouch } from "@/lib/useMediaQuery";
import { LinkSpinner } from "./Spinner";
import basemap from "@/data/tx-counties.json";

interface CountyShape {
  fips: string;
  rings: number[][];
}

const COUNTIES = basemap.counties as CountyShape[];
const BOUNDS = basemap.bounds as {
  west: number;
  east: number;
  south: number;
  north: number;
};

const W = 900;
const MID_LAT = (BOUNDS.north + BOUNDS.south) / 2;
const LON_SPAN = (BOUNDS.east - BOUNDS.west) * Math.cos(MID_LAT * (Math.PI / 180));
const H = Math.round(W * ((BOUNDS.north - BOUNDS.south) / LON_SPAN));

const projectX = (lon: number) =>
  ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W;
const projectY = (lat: number) =>
  ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * H;

function countyPath(county: CountyShape): string {
  let d = "";
  for (const ring of county.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      d += `${i === 0 ? "M" : "L"}${projectX(ring[i]).toFixed(1)},${projectY(ring[i + 1]).toFixed(1)}`;
    }
    d += "Z";
  }
  return d;
}

export default function WellMap({
  wells,
  aquifers,
}: {
  wells: WellCurrent[];
  aquifers: string[];
}) {
  const [selected, setSelected] = useState<string>("all");
  const [hovered, setHovered] = useState<WellCurrent | null>(null);
  const isTouch = useTouch();

  const paths = useMemo(() => COUNTIES.map(countyPath), []);
  const silhouette = useMemo(() => paths.join(""), [paths]);

  const visible = useMemo(
    () =>
      wells
        .filter((w) => selected === "all" || w.aquifer === selected)
        .filter((w) => w.lon >= BOUNDS.west && w.lon <= BOUNDS.east)
        .map((w) => ({ well: w, x: projectX(w.lon), y: projectY(w.lat) })),
    [wells, selected],
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 sm:py-1.5 text-sm outline-none focus:border-accent"
          aria-label="Filter by aquifer"
        >
          <option value="all">All aquifers ({wells.length} wells)</option>
          {aquifers.map((a) => (
            <option key={a} value={a}>
              {a} ({wells.filter((w) => w.aquifer === a).length})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted ml-auto">
          {visible.length} wells shown · colour by aquifer
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
          aria-label="Map of Texas groundwater monitoring wells by aquifer">
          <path
            d={silhouette}
            fill="var(--map-land)"
            stroke="var(--map-state)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <g>
            {paths.map((d, i) => (
              <path
                key={COUNTIES[i].fips}
                d={d}
                fill="var(--map-land)"
                stroke="var(--map-county)"
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
            ))}
          </g>
          <g>
            {visible.map(({ well, x, y }) => {
              const active = hovered?.number === well.number;
              return (
                <circle
                  key={well.number}
                  cx={x}
                  cy={y}
                  r={isTouch ? 7 : active ? 6 : 4}
                  fill={aquiferColor(well.aquifer, aquifers)}
                  fillOpacity={active ? 1 : 0.8}
                  stroke={active ? "var(--foreground)" : "var(--surface)"}
                  strokeWidth={active ? 2 : 0.8}
                  className="cursor-pointer transition-all"
                  onMouseEnter={isTouch ? undefined : () => setHovered(well)}
                  onMouseLeave={isTouch ? undefined : () => setHovered(null)}
                  onClick={isTouch ? () => setHovered(well) : undefined}
                >
                  <title>{`Well ${well.number} — ${well.aquifer}, ${well.depthFt.toFixed(1)} ft below surface`}</title>
                </circle>
              );
            })}
          </g>
        </svg>

        {hovered ? (
          <div className="absolute top-2 left-2 right-2 sm:right-auto rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-sm shadow-lg">
            <div className="font-medium">Well {hovered.number}</div>
            <div className="text-xs text-muted mt-0.5">
              {hovered.aquifer}
              {hovered.county ? ` · ${hovered.county} County` : ""}
            </div>
            <div className="nums text-xs mt-1">
              {hovered.depthFt.toFixed(1)} ft below land surface
            </div>
            <div className="text-xs text-muted">
              measured {hovered.date}
              {hovered.ageDays > 30 ? ` · ${hovered.ageDays} days ago` : ""}
            </div>
            <Link
              href={`/groundwater/${hovered.number}`}
              className="mt-1.5 text-xs text-accent font-medium inline-flex items-center gap-2"
            >
              View history →
              <LinkSpinner />
            </Link>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted mt-2">
        Depth is measured downward from the land surface, so a larger number
        means a deeper water table. Wells sit at very different land elevations,
        so depths are not comparable between wells — only a single well&apos;s
        change over time is meaningful.
      </p>
    </div>
  );
}
