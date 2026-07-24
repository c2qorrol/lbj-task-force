"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LakeSummary } from "@/lib/lakes";
import {
  fillStatus,
  fmtAcreFeet,
  fmtFeet,
  fmtPercent,
  relativeTime,
  STATUS_CLASS,
} from "@/lib/format";
import { FillBar, LiveDot } from "./ui";
import { LinkSpinner } from "./Spinner";

type SortKey = "name" | "percentFull" | "elevation" | "storage" | "region";
type Direction = "asc" | "desc";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "flood", label: "Above pool" },
  { key: "full", label: "Full" },
  { key: "normal", label: "Normal" },
  { key: "low", label: "Low" },
  { key: "critical", label: "Critical" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

/** Mirrors the sortable table headers, for screens that show cards instead. */
const SORT_OPTIONS: { key: SortKey; direction: Direction; label: string }[] = [
  { key: "name", direction: "asc", label: "Name A–Z" },
  { key: "percentFull", direction: "asc", label: "Emptiest first" },
  { key: "percentFull", direction: "desc", label: "Fullest first" },
  { key: "storage", direction: "desc", label: "Largest storage" },
  { key: "elevation", direction: "desc", label: "Highest elevation" },
  { key: "region", direction: "asc", label: "Basin A–Z" },
];

export default function LakeTable({ lakes }: { lakes: LakeSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [basin, setBasin] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [direction, setDirection] = useState<Direction>("asc");

  const basins = useMemo(
    () =>
      [...new Set(lakes.map((l) => l.basin).filter((b): b is string => !!b))].sort(),
    [lakes],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = lakes.filter((l) => {
      if (status !== "all" && fillStatus(l.percentFull) !== status) return false;
      if (basin !== "all" && l.basin !== basin) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.shortName.toLowerCase().includes(q) ||
        (l.basin?.toLowerCase().includes(q) ?? false) ||
        (l.gage?.siteName.toLowerCase().includes(q) ?? false)
      );
    });

    // Nulls always sort last regardless of direction — a reservoir with no
    // reading shouldn't win the "lowest" sort.
    const sorted = [...filtered].sort((a, b) => {
      const dir = direction === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "region")
        return (a.basin ?? "").localeCompare(b.basin ?? "") * dir;
      const av = pick(a, sortKey);
      const bv = pick(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
    return sorted;
  }, [lakes, query, status, basin, sortKey, direction]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Names read best A→Z; every metric reads best highest-first.
      setDirection(key === "name" || key === "region" ? "asc" : "desc");
    }
  }

  return (
    <div>
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reservoirs…"
            className="flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-52 rounded-lg border border-border bg-surface px-3 py-2 sm:py-1.5 text-sm outline-none focus:border-accent"
          />
          <select
            value={basin}
            onChange={(e) => setBasin(e.target.value)}
            className="flex-1 sm:flex-none rounded-lg border border-border bg-surface px-3 py-2 sm:py-1.5 text-sm outline-none focus:border-accent"
            aria-label="Filter by basin"
          >
            <option value="all">All basins</option>
            {basins.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {/* Sort control only appears where there are no table headers to click. */}
          <select
            value={`${sortKey}:${direction}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              setSortKey(key as SortKey);
              setDirection(dir as Direction);
            }}
            className="lg:hidden flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            aria-label="Sort reservoirs"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={`${o.key}:${o.direction}`} value={`${o.key}:${o.direction}`}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Six chips overflow a phone; let the row swipe instead of wrapping. */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <div className="flex w-max rounded-lg border border-border overflow-hidden text-xs">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={`px-3 py-2 sm:py-1.5 whitespace-nowrap transition-colors ${
                  status === f.key
                    ? "bg-accent text-white"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
       * Below lg the seven-column table would force ~46rem of horizontal
       * scrolling, so phones and portrait tablets get stacked cards carrying the
       * same fields instead. Both views render from the same `rows`.
       */}
      <ul className="lg:hidden space-y-2">
        {rows.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/lake/${l.slug}`}
              className="block rounded-xl border border-border bg-surface p-3 active:bg-border/30 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium truncate inline-flex items-center gap-2">
                  {l.name}
                  <LinkSpinner />
                </span>
                <span
                  className={`nums font-semibold shrink-0 ${STATUS_CLASS[fillStatus(l.percentFull)]}`}
                >
                  {fmtPercent(l.percentFull)}
                </span>
              </div>
              <FillBar percentFull={l.percentFull} className="mt-2" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted">
                <span className="nums">{fmtFeet(l.elevation)}</span>
                <span className="nums">{fmtAcreFeet(l.conservationStorage)}</span>
                {l.basin ? <span>{l.basin} basin</span> : null}
                {l.gage ? (
                  <span className="inline-flex items-center gap-1.5 ml-auto">
                    <LiveDot title={`USGS ${l.gage.siteId}`} />
                    <span className="nums">{l.gage.value?.toFixed(2)} ft</span>
                    {/* Elapsed time differs between render and hydration. */}
                    <span className="opacity-70" suppressHydrationWarning>
                      {relativeTime(l.gage.observedAt)}
                    </span>
                  </span>
                ) : (
                  <span className="ml-auto opacity-60">daily only</span>
                )}
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="rounded-xl border border-border bg-surface px-3 py-10 text-center text-muted text-sm">
            No reservoirs match these filters.
          </li>
        ) : null}
      </ul>

      <div className="hidden lg:block rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={direction}>
                  Reservoir
                </Th>
                <Th onClick={() => toggleSort("region")} active={sortKey === "region"} dir={direction}>
                  Basin
                </Th>
                <Th
                  align="right"
                  onClick={() => toggleSort("percentFull")}
                  active={sortKey === "percentFull"}
                  dir={direction}
                >
                  % Full
                </Th>
                <th className="px-3 py-2 w-28 font-medium text-left">Fill</th>
                <Th
                  align="right"
                  onClick={() => toggleSort("elevation")}
                  active={sortKey === "elevation"}
                  dir={direction}
                >
                  Elevation
                </Th>
                <Th
                  align="right"
                  onClick={() => toggleSort("storage")}
                  active={sortKey === "storage"}
                  dir={direction}
                >
                  Storage
                </Th>
                <th className="px-3 py-2 font-medium text-right">Live gage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.slug}
                  className="border-b border-border/60 last:border-0 hover:bg-border/25"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/lake/${l.slug}`}
                      className="font-medium hover:text-accent hover:underline inline-flex items-center gap-2"
                    >
                      {l.name}
                      <LinkSpinner />
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">{l.basin ?? "—"}</td>
                  <td
                    className={`px-3 py-2 text-right nums font-semibold ${STATUS_CLASS[fillStatus(l.percentFull)]}`}
                  >
                    {fmtPercent(l.percentFull)}
                  </td>
                  <td className="px-3 py-2">
                    <FillBar percentFull={l.percentFull} />
                  </td>
                  <td className="px-3 py-2 text-right nums">{fmtFeet(l.elevation)}</td>
                  <td className="px-3 py-2 text-right nums text-muted">
                    {fmtAcreFeet(l.conservationStorage)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {l.gage ? (
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <LiveDot title={`USGS ${l.gage.siteId}`} />
                        <span className="nums">{l.gage.value?.toFixed(2)} ft</span>
                        {/* Elapsed time differs between render and hydration. */}
                        <span className="opacity-70" suppressHydrationWarning>
                          {relativeTime(l.gage.observedAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted/60">daily only</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted">
                    No reservoirs match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted mt-2">
        Showing {rows.length} of {lakes.length} reservoirs.
      </p>
    </div>
  );
}

function pick(l: LakeSummary, key: SortKey): number | null {
  if (key === "percentFull") return l.percentFull;
  if (key === "elevation") return l.elevation;
  if (key === "storage") return l.conservationStorage;
  return null;
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: Direction;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {children}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}
