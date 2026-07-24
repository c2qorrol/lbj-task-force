"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { LakeSummary } from "@/lib/lakes";
import {
  fillStatus,
  fmtDate,
  fmtFeet,
  fmtNumber,
  fmtPercent,
  relativeTime,
  STATUS_HEX,
  STATUS_LABEL,
} from "@/lib/format";
import { useTouch } from "@/lib/useMediaQuery";
import { LinkSpinner, Spinner, useDelayedPending } from "./Spinner";
import {
  DROUGHT_HEX,
  DROUGHT_LABEL,
  DROUGHT_MAP_OPACITY,
  DROUGHT_ORDER,
  DROUGHT_SHORT,
  type CountyDrought,
  type DroughtCategory,
} from "@/lib/drought";
import type { RiverGage } from "@/lib/rivers";
import { FLOOD_HEX, FLOOD_LABEL, FLOOD_RANK } from "@/lib/nwps";
import {
  FLOW_CLASS_HEX,
  FLOW_CLASS_LABEL,
  FLOW_CLASS_ORDER,
} from "@/lib/flowclass";
import type { RainStation } from "@/lib/rainfall";
import basemap from "@/data/tx-counties.json";

interface County {
  fips: string;
  name: string;
  /** Flat [lon, lat, lon, lat, …] rings. */
  rings: number[][];
}

const COUNTIES = basemap.counties as County[];
const BOUNDS = basemap.bounds as {
  west: number;
  east: number;
  south: number;
  north: number;
};

const W = 900;

/**
 * Equirectangular projection. Longitude degrees shrink by cos(latitude), so the
 * viewBox height comes from the true ground aspect at Texas's mid latitude
 * rather than being assumed square — otherwise the state renders squashed.
 *
 * Counties and reservoir markers both go through this same function, which is
 * why the basemap geometry is stored as lon/lat rather than pre-baked SVG paths.
 */
const MID_LAT = (BOUNDS.north + BOUNDS.south) / 2;
const LON_SPAN = (BOUNDS.east - BOUNDS.west) * Math.cos(MID_LAT * (Math.PI / 180));
const LAT_SPAN = BOUNDS.north - BOUNDS.south;
const H = Math.round(W * (LAT_SPAN / LON_SPAN));

function projectX(lon: number) {
  return ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * W;
}

function projectY(lat: number) {
  return ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * H;
}

/** Build one SVG path covering every ring of a county. */
function countyPath(county: County): string {
  let d = "";
  for (const ring of county.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const x = projectX(ring[i]).toFixed(1);
      const y = projectY(ring[i + 1]).toFixed(1);
      d += `${i === 0 ? "M" : "L"}${x},${y}`;
    }
    d += "Z";
  }
  return d;
}

/** Label anchor: centroid of the county's largest ring, by vertex count. */
function countyCentroid(county: County): { x: number; y: number } {
  const ring = county.rings.reduce((a, b) => (b.length > a.length ? b : a));
  let sx = 0;
  let sy = 0;
  const n = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) {
    sx += ring[i];
    sy += ring[i + 1];
  }
  return { x: projectX(sx / n), y: projectY(sy / n) };
}

const LEGEND = ["flood", "full", "normal", "low", "critical"] as const;

/** Legend swatch matching the river-gage marker shape. */
function Diamond({ color }: { color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
      <path d="M5,0 L10,5 L5,10 L0,5 Z" fill={color} />
    </svg>
  );
}

/** Severity breakdown for one county, shown on hover with the overlay on. */
function CountyDroughtDetail({ county }: { county?: CountyDrought }) {
  if (!county) {
    return <div className="text-xs text-muted mt-0.5">No drought reported</div>;
  }
  return (
    <div className="text-xs text-muted mt-1 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-sm border border-border"
          style={{ background: DROUGHT_HEX[county.worst] }}
        />
        {DROUGHT_LABEL[county.worst]}
      </div>
      {county.worst !== "none" ? (
        <div className="nums">
          {DROUGHT_ORDER.filter((c) => county[c] > 0)
            .map((c) => `${DROUGHT_SHORT[c]} ${county[c].toFixed(0)}%`)
            .join(" · ")}
        </div>
      ) : null}
      <div className="nums">DSCI {county.dsci}</div>
    </div>
  );
}

/** River gage marker colours: flow-reporting sites read as the "live" ones. */
const RIVER_FLOW_HEX = "#38bdf8";
const RIVER_STAGE_HEX = "#94a3b8";

/**
 * Rainfall scale, inches over the trailing week. Deliberately a different hue
 * family from both the reservoir status colours and the drought ramp, so three
 * layers can be on at once without collapsing into the same visual language.
 */
const RAIN_BANDS: { min: number; hex: string; label: string }[] = [
  { min: 4, hex: "#4c1d95", label: "4 in +" },
  { min: 2, hex: "#6d28d9", label: "2–4 in" },
  { min: 1, hex: "#8b5cf6", label: "1–2 in" },
  { min: 0.25, hex: "#a78bfa", label: "0.25–1 in" },
  { min: 0.01, hex: "#c4b5fd", label: "trace–0.25 in" },
];

function rainColor(inches: number): string {
  return RAIN_BANDS.find((b) => inches >= b.min)?.hex ?? RAIN_BANDS.at(-1)!.hex;
}

/**
 * Area scales with depth, so radius scales with its square root.
 *
 * Kept small on purpose. In a wet week most of the ~2,000 stations report
 * something — median 1.4 in when this was tuned — so large markers merge into
 * an opaque mass that buries the reservoirs underneath. At this size the layer
 * reads as a precipitation field, which is what it is, and overlap becomes
 * intensity rather than occlusion.
 */
function rainRadius(inches: number): number {
  return 1 + 2.2 * Math.sqrt(Math.min(inches, 9));
}

export default function LakeMap({
  lakes,
  drought,
  droughtDate,
  rivers = [],
  rainfall = [],
}: {
  lakes: LakeSummary[];
  /** Latest US Drought Monitor reading per county FIPS, when available. */
  drought?: Record<string, CountyDrought>;
  droughtDate?: string | null;
  /** Real-time USGS river gages (stage and/or discharge). */
  rivers?: RiverGage[];
  /** CoCoRaHS rainfall stations reporting measurable rain this week. */
  rainfall?: RainStation[];
}) {
  const [hoveredLake, setHoveredLake] = useState<LakeSummary | null>(null);
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showRivers, setShowRivers] = useState(false);
  const [hoveredRiver, setHoveredRiver] = useState<RiverGage | null>(null);
  const [showRain, setShowRain] = useState(false);
  const [hoveredRain, setHoveredRain] = useState<RainStation | null>(null);
  const [showDrought, setShowDrought] = useState(false);
  const isTouch = useTouch();

  /*
   * Toggling the overlay or the labels re-renders all 254 county paths, which
   * is the one interaction here heavy enough to drop a frame on a slow device.
   * A transition keeps the checkbox responsive and lets us show progress; the
   * delay guard means nothing flashes when the re-render is quick, which it
   * usually is.
   */
  const [isPending, startTransition] = useTransition();
  const showPending = useDelayedPending(isPending);

  const droughtAvailable = drought !== undefined && Object.keys(drought).length > 0;
  const overlayOn = showDrought && droughtAvailable;

  const shapes = useMemo(
    () =>
      COUNTIES.map((county) => ({
        ...county,
        d: countyPath(county),
        centroid: countyCentroid(county),
      })),
    [],
  );

  /** One combined path stroked heavily underneath yields the state silhouette. */
  const silhouette = useMemo(() => shapes.map((s) => s.d).join(""), [shapes]);

  function countyFill(fips: string): string {
    if (overlayOn) {
      const category = (drought?.[fips]?.worst ?? "none") as DroughtCategory;
      // Drought-free counties keep the normal land tone; USDM's white would
      // glare in dark mode and read as "no data" rather than "no drought".
      return category === "none" ? "var(--map-land)" : DROUGHT_HEX[category];
    }
    return hoveredCounty === fips ? "var(--map-hover)" : "var(--map-land)";
  }

  /**
   * TWDB tracks a few reservoirs outside Texas that supply Texas water — most
   * notably Elephant Butte in New Mexico. They project outside the state
   * viewBox, so exclude them deliberately and report the count rather than
   * letting them render clipped and invisible.
   */
  const inState = (l: LakeSummary) =>
    l.lat !== null &&
    l.lon !== null &&
    l.lon >= BOUNDS.west &&
    l.lon <= BOUNDS.east &&
    l.lat >= BOUNDS.south &&
    l.lat <= BOUNDS.north;

  const offMap = lakes.filter((l) => l.lat !== null && l.lon !== null && !inState(l));

  const points = useMemo(
    () =>
      lakes
        .filter(inState)
        .map((l) => ({
          lake: l,
          x: projectX(l.lon!),
          y: projectY(l.lat!),
        }))
        // Largest first so small reservoirs stay clickable on top of big ones.
        .sort(
          (a, b) =>
            (b.lake.conservationCapacity ?? 0) - (a.lake.conservationCapacity ?? 0),
        ),
    [lakes],
  );

  const riversAvailable = rivers.length > 0;
  const riverLayerOn = showRivers && riversAvailable;

  const riverPoints = useMemo(
    () =>
      rivers
        .filter(
          (g) =>
            g.lon >= BOUNDS.west &&
            g.lon <= BOUNDS.east &&
            g.lat >= BOUNDS.south &&
            g.lat <= BOUNDS.north,
        )
        // Flooding gauges draw last (on top) and by rising severity, so a
        // major-flood marker is never buried under its quiet neighbours.
        .sort(
          (a, b) =>
            (a.flood ? FLOOD_RANK[a.flood] : 0) -
            (b.flood ? FLOOD_RANK[b.flood] : 0),
        )
        .map((gage) => ({ gage, x: projectX(gage.lon), y: projectY(gage.lat) })),
    [rivers],
  );

  const floodedRivers = useMemo(
    () => riverPoints.filter(({ gage }) => gage.flood),
    [riverPoints],
  );

  const rainAvailable = rainfall.length > 0;
  const rainLayerOn = showRain && rainAvailable;

  const rainPoints = useMemo(
    () =>
      rainfall
        .filter(
          (s) =>
            s.lon >= BOUNDS.west &&
            s.lon <= BOUNDS.east &&
            s.lat >= BOUNDS.south &&
            s.lat <= BOUNDS.north,
        )
        // Heaviest last so the biggest totals are not hidden under light ones.
        .sort((a, b) => a.day7 - b.day7)
        .map((station) => ({
          station,
          x: projectX(station.lon),
          y: projectY(station.lat),
        })),
    [rainfall],
  );

  const maxCapacity = Math.max(...lakes.map((l) => l.conservationCapacity ?? 0), 1);
  /**
   * Marker area tracks capacity, so radius tracks its square root. On touch the
   * whole 900-unit viewBox is squeezed into ~350 CSS px, which would shrink the
   * smallest markers to roughly 1.4px — far below a usable tap target — so the
   * floor is raised for coarse pointers.
   */
  const radius = (capacity: number | null) =>
    (isTouch ? 9 : 3.5) + 13 * Math.sqrt((capacity ?? 0) / maxCapacity);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 text-xs">
        {LEGEND.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-muted">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: STATUS_HEX[key] }}
            />
            {STATUS_LABEL[key]}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-4">
          {droughtAvailable ? (
            <label className="inline-flex items-center gap-1.5 text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDrought}
                onChange={(e) => {
                  const next = e.target.checked;
                  startTransition(() => setShowDrought(next));
                }}
                className="accent-[var(--accent)]"
              />
              Drought overlay
              {showPending ? <Spinner label="Updating map" /> : null}
            </label>
          ) : null}
          {riversAvailable ? (
            <label className="inline-flex items-center gap-1.5 text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showRivers}
                onChange={(e) => {
                  const next = e.target.checked;
                  startTransition(() => setShowRivers(next));
                }}
                className="accent-[var(--accent)]"
              />
              River gages
            </label>
          ) : null}
          {rainAvailable ? (
            <label className="inline-flex items-center gap-1.5 text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showRain}
                onChange={(e) => {
                  const next = e.target.checked;
                  startTransition(() => setShowRain(next));
                }}
                className="accent-[var(--accent)]"
              />
              Rainfall
            </label>
          ) : null}
          <label className="inline-flex items-center gap-1.5 text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => {
                const next = e.target.checked;
                startTransition(() => setShowLabels(next));
              }}
              className="accent-[var(--accent)]"
            />
            County names
          </label>
        </span>
      </div>

      {overlayOn ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-xs">
          <span className="text-muted">Drought severity:</span>
          {[...DROUGHT_ORDER].reverse().map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-muted">
              {/* Composited exactly as the map draws it, so the swatch matches. */}
              <span
                className="h-2.5 w-2.5 rounded-sm border border-border overflow-hidden"
                style={{ background: "var(--map-land)" }}
              >
                <span
                  className="block h-full w-full"
                  style={{
                    background: DROUGHT_HEX[key],
                    opacity: DROUGHT_MAP_OPACITY,
                  }}
                />
              </span>
              {DROUGHT_LABEL[key].replace(/^D\d /, "")}
            </span>
          ))}
          {droughtDate ? (
            <span className="text-muted/70 ml-auto">
              US Drought Monitor, {droughtDate}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Map of Texas counties with major reservoirs colored by fill status"
        >
          {/*
           * Layer 1 is every county ring stroked thickly. Layer 2 redraws each
           * county filled, covering the interior half of those strokes, so only
           * the outer perimeter survives as a state boundary. This keeps the
           * outline perfectly registered with the counties — deriving it from
           * shared-edge cancellation is not possible here, because adjacent
           * counties in the source data do not share identical vertices.
           */}
          <path
            d={silhouette}
            fill="var(--map-land)"
            stroke="var(--map-state)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          <g>
            {shapes.map((county) => (
              <path
                key={county.fips}
                d={county.d}
                fill={countyFill(county.fips)}
                /*
                 * Held well back when the overlay is on. At full strength the
                 * USDM ramp collides with the fill-status markers — an orange
                 * "Low" reservoir sitting on an orange D2 county is nearly
                 * invisible, and a rose marker on red D3 reads as part of the
                 * drought scale. Drought is context here; the reservoirs are
                 * the subject, so the wash stays quiet enough for the
                 * saturated markers to dominate.
                 */
                fillOpacity={overlayOn ? DROUGHT_MAP_OPACITY : 1}
                stroke="var(--map-county)"
                strokeWidth={0.6}
                strokeLinejoin="round"
                onMouseEnter={isTouch ? undefined : () => setHoveredCounty(county.fips)}
                onMouseLeave={isTouch ? undefined : () => setHoveredCounty(null)}
                onClick={
                  isTouch
                    ? () => {
                        // Tapping bare land identifies the county; it also
                        // clears any open reservoir card.
                        setHoveredLake(null);
                        setHoveredCounty(county.fips);
                      }
                    : undefined
                }
              >
                <title>{`${county.name} County`}</title>
              </path>
            ))}
          </g>

          {showLabels ? (
            <g pointerEvents="none">
              {shapes.map((county) => (
                <text
                  key={county.fips}
                  x={county.centroid.x}
                  y={county.centroid.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={6.5}
                  fill="var(--map-state)"
                >
                  {county.name}
                </text>
              ))}
            </g>
          ) : null}

          {/*
           * Rainfall sits at the bottom of the marker stack: it is context for
           * the other layers, and its circles are the largest, so drawing it
           * above them would obscure both.
           */}
          {rainLayerOn ? (
            <g>
              {rainPoints.map(({ station, x, y }) => {
                const active = hoveredRain?.id === station.id;
                return (
                  <circle
                    key={station.id}
                    cx={x}
                    cy={y}
                    r={rainRadius(station.day7)}
                    fill={rainColor(station.day7)}
                    fillOpacity={active ? 0.95 : 0.42}
                    stroke={active ? "var(--foreground)" : "none"}
                    strokeWidth={active ? 1.5 : 0}
                    className="cursor-pointer"
                    onMouseEnter={
                      isTouch
                        ? undefined
                        : () => {
                            setHoveredRain(station);
                            setHoveredLake(null);
                            setHoveredRiver(null);
                          }
                    }
                    onMouseLeave={isTouch ? undefined : () => setHoveredRain(null)}
                    onClick={
                      isTouch
                        ? () => {
                            setHoveredRain(station);
                            setHoveredLake(null);
                            setHoveredRiver(null);
                          }
                        : undefined
                    }
                  >
                    <title>{`${station.name} — ${station.day7.toFixed(2)} in this week`}</title>
                  </circle>
                );
              })}
            </g>
          ) : null}

          {/*
           * River gages, drawn before reservoirs so lakes stay on top — there
           * are ~5x more river sites and they would otherwise bury them.
           * Diamonds rather than circles: at this density shape distinguishes
           * the two layers faster than colour, and colour is already carrying
           * reservoir fill status.
           */}
          {riverLayerOn ? (
            <g>
              {riverPoints.map(({ gage, x, y }) => {
                const active = hoveredRiver?.siteId === gage.siteId;
                // Flood-status markers run slightly larger: they are the
                // exceptional signal this layer exists to surface.
                const size = active ? 5 : gage.flood ? 4.2 : 3;
                const color = gage.flood
                  ? FLOOD_HEX[gage.flood]
                  : gage.flowClass
                    ? FLOW_CLASS_HEX[gage.flowClass]
                    : gage.flowCfs !== null
                      ? RIVER_FLOW_HEX
                      : RIVER_STAGE_HEX;
                return (
                  <path
                    key={gage.siteId}
                    d={`M${x},${y - size}L${x + size},${y}L${x},${y + size}L${x - size},${y}Z`}
                    fill={color}
                    fillOpacity={active ? 1 : 0.8}
                    stroke={active ? "var(--foreground)" : "var(--surface)"}
                    strokeWidth={active ? 1.5 : 0.6}
                    className="cursor-pointer"
                    onMouseEnter={
                      isTouch
                        ? undefined
                        : () => {
                            setHoveredRiver(gage);
                            setHoveredLake(null);
                          }
                    }
                    onMouseLeave={isTouch ? undefined : () => setHoveredRiver(null)}
                    onClick={
                      isTouch
                        ? () => {
                            setHoveredRiver(gage);
                            setHoveredLake(null);
                          }
                        : undefined
                    }
                  >
                    <title>{`${gage.siteName} — ${
                      gage.flood ? `${FLOOD_LABEL[gage.flood]} · ` : ""
                    }${
                      gage.flowCfs !== null ? `${fmtNumber(gage.flowCfs)} cfs` : ""
                    }${gage.flowCfs !== null && gage.stageFt !== null ? " · " : ""}${
                      gage.stageFt !== null ? `${gage.stageFt.toFixed(2)} ft` : ""
                    }${
                      gage.flowClass
                        ? ` · ${FLOW_CLASS_LABEL[gage.flowClass].toLowerCase()} for this date`
                        : ""
                    }`}</title>
                  </path>
                );
              })}
            </g>
          ) : null}

          <g>
            {points.map(({ lake, x, y }) => {
              const status = fillStatus(lake.percentFull);
              const active = hoveredLake?.slug === lake.slug;
              const marker = (
                <circle
                  cx={x}
                  cy={y}
                  r={radius(lake.conservationCapacity)}
                  fill={STATUS_HEX[status]}
                  fillOpacity={active ? 0.95 : 0.75}
                  /* Against the drought palette the marker colours no longer
                     separate from the land, so give every marker a ring. */
                  stroke={
                    active
                      ? "var(--foreground)"
                      : overlayOn
                        ? "var(--surface)"
                        : STATUS_HEX[status]
                  }
                  strokeWidth={active ? 2 : overlayOn ? 2 : 0.8}
                  className="cursor-pointer transition-all"
                  onMouseEnter={isTouch ? undefined : () => setHoveredLake(lake)}
                  onMouseLeave={isTouch ? undefined : () => setHoveredLake(null)}
                  onClick={isTouch ? () => setHoveredLake(lake) : undefined}
                >
                  <title>{`${lake.name} — ${fmtPercent(lake.percentFull)} full`}</title>
                </circle>
              );

              /*
               * On touch there is no hover, and markers are dense enough that
               * navigating on first tap means constant mis-taps. Tapping selects
               * and opens the detail card, which carries the link; on pointer
               * devices the marker itself stays a direct link.
               */
              return isTouch ? (
                <g key={lake.slug}>{marker}</g>
              ) : (
                <Link key={lake.slug} href={`/lake/${lake.slug}`}>
                  {marker}
                </Link>
              );
            })}
          </g>

        </svg>

        {hoveredRain ? (
          <div
            className={`absolute top-2 left-2 right-2 sm:right-auto rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-sm shadow-lg ${
              isTouch ? "" : "pointer-events-none"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium">{hoveredRain.name}</div>
                <div className="nums text-xs mt-1">
                  <span style={{ color: rainColor(hoveredRain.day7) }}>
                    {hoveredRain.day7.toFixed(2)} in
                  </span>{" "}
                  <span className="text-muted">past 7 days</span>
                </div>
                <div className="nums text-xs text-muted">
                  {hoveredRain.day1.toFixed(2)} in on {fmtDate(hoveredRain.lastReport)}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  CoCoRaHS {hoveredRain.id}
                </div>
              </div>
              {isTouch ? (
                <button
                  onClick={() => setHoveredRain(null)}
                  aria-label="Dismiss"
                  className="ml-auto shrink-0 text-muted px-2 -mr-1 -mt-1 text-lg leading-none"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : hoveredRiver ? (
          <div
            className={`absolute top-2 left-2 right-2 sm:right-auto rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-sm shadow-lg ${
              isTouch ? "" : "pointer-events-none"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium">{hoveredRiver.siteName}</div>
                {hoveredRiver.flood ? (
                  <div
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: FLOOD_HEX[hoveredRiver.flood] }}
                  >
                    {FLOOD_LABEL[hoveredRiver.flood]} — NWS
                  </div>
                ) : null}
                <div className="nums text-xs mt-1 flex flex-wrap gap-x-3">
                  {hoveredRiver.flowCfs !== null ? (
                    <span style={{ color: RIVER_FLOW_HEX }}>
                      {fmtNumber(hoveredRiver.flowCfs)} cfs
                    </span>
                  ) : null}
                  {hoveredRiver.stageFt !== null ? (
                    <span>{hoveredRiver.stageFt.toFixed(2)} ft stage</span>
                  ) : null}
                </div>
                {hoveredRiver.flowClass ? (
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: FLOW_CLASS_HEX[hoveredRiver.flowClass] }}
                  >
                    {FLOW_CLASS_LABEL[hoveredRiver.flowClass]} for this date
                    {hoveredRiver.flowPct !== undefined ? (
                      <span className="nums"> · ~{hoveredRiver.flowPct}th percentile</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="text-xs text-muted mt-0.5">
                  USGS {hoveredRiver.siteId} · {relativeTime(hoveredRiver.observedAt)}
                </div>
              </div>
              {isTouch ? (
                <button
                  onClick={() => setHoveredRiver(null)}
                  aria-label="Dismiss"
                  className="ml-auto shrink-0 text-muted px-2 -mr-1 -mt-1 text-lg leading-none"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : hoveredLake ? (
          <div
            className={`absolute top-2 left-2 right-2 sm:right-auto rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-sm shadow-lg ${
              isTouch ? "" : "pointer-events-none"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{hoveredLake.name}</div>
                <div className="nums text-xs text-muted mt-0.5">
                  {fmtPercent(hoveredLake.percentFull)} full ·{" "}
                  {fmtFeet(hoveredLake.elevation)}
                </div>
                {hoveredLake.gage ? (
                  <div className="nums text-xs mt-0.5">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {hoveredLake.gage.value?.toFixed(2)} ft
                    </span>{" "}
                    <span className="text-muted">
                      gage · {relativeTime(hoveredLake.gage.observedAt)}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-muted mt-0.5">
                    No real-time gage · daily reading only
                  </div>
                )}
                {hoveredLake.basin ? (
                  <div className="text-xs text-muted">{hoveredLake.basin} basin</div>
                ) : null}
              </div>
              {isTouch ? (
                <button
                  onClick={() => setHoveredLake(null)}
                  aria-label="Dismiss"
                  className="ml-auto shrink-0 text-muted px-2 -mr-1 -mt-1 text-lg leading-none"
                >
                  ×
                </button>
              ) : null}
            </div>
            {isTouch ? (
              <Link
                href={`/lake/${hoveredLake.slug}`}
                className="mt-2 text-xs text-accent font-medium inline-flex items-center gap-2"
              >
                View details →
                <LinkSpinner />
              </Link>
            ) : null}
          </div>
        ) : hoveredCounty ? (
          <div className="absolute top-2 left-2 rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-sm shadow-lg pointer-events-none">
            <div className="font-medium">
              {COUNTIES.find((c) => c.fips === hoveredCounty)?.name} County
            </div>
            {overlayOn ? <CountyDroughtDetail county={drought?.[hoveredCounty]} /> : null}
          </div>
        ) : null}
      </div>

      {riverLayerOn ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
          <span className="text-muted">Flow vs normal for this date:</span>
          {FLOW_CLASS_ORDER.map((cls) => (
            <span key={cls} className="inline-flex items-center gap-1.5 text-muted">
              <Diamond color={FLOW_CLASS_HEX[cls]} />
              {FLOW_CLASS_LABEL[cls]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Diamond color={RIVER_STAGE_HEX} />
            Stage only
          </span>
          {(["action", "minor", "moderate", "major"] as const).map((cat) =>
            floodedRivers.some(({ gage }) => gage.flood === cat) ? (
              <span key={cat} className="inline-flex items-center gap-1.5 text-muted">
                <Diamond color={FLOOD_HEX[cat]} />
                {FLOOD_LABEL[cat]}
              </span>
            ) : null,
          )}
          <span className="text-muted/70">
            {riverPoints.length} sites · USGS, ~15-minute readings, compared
            against each gage&apos;s own period-of-record normals for the month
            {floodedRivers.length > 0
              ? ` · ${floodedRivers.length} at or above an NWS flood category`
              : " · none currently at an NWS flood category"}
          </span>
        </div>
      ) : null}

      {rainLayerOn ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
          <span className="text-muted">Rainfall, past 7 days:</span>
          {[...RAIN_BANDS].reverse().map((band) => (
            <span
              key={band.label}
              className="inline-flex items-center gap-1.5 text-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: band.hex }}
              />
              {band.label}
            </span>
          ))}
          <span className="text-muted/70 w-full sm:w-auto">
            {rainPoints.length} CoCoRaHS stations reporting rain · volunteer
            observations read once daily, not real-time. Stations with no
            measurable rain are not plotted.
          </span>
        </div>
      ) : null}

      {overlayOn ? (
        <p className="text-xs text-muted mt-2">
          Counties are shaded by the worst drought category present anywhere
          within them, so a county shaded D3 is not necessarily D3 throughout.
        </p>
      ) : null}

      <p className="text-xs text-muted mt-2">
        {points.length} reservoirs plotted at their gage locations over all 254
        Texas counties. Marker size is proportional to conservation capacity.
        Click a marker for detail.
        {offMap.length > 0 ? (
          <>
            {" "}
            Not shown:{" "}
            {offMap.map((l) => l.name).join(", ")} — tracked by TWDB as a Texas
            water source but located outside the state.
          </>
        ) : null}
      </p>
    </div>
  );
}
