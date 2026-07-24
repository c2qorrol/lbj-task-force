import type { Metadata } from "next";
import Link from "next/link";
import { Card, FillBar, StatusPill } from "@/components/ui";
import { LinkSpinner } from "@/components/Spinner";
import { getSupplySystems, type SupplySystem } from "@/lib/systems";
import {
  fillStatus,
  fmtAcreFeet,
  fmtDate,
  fmtPercent,
  STATUS_CLASS,
} from "@/lib/format";

export const revalidate = 3600;

const DESCRIPTION =
  "How full each Texas metro area's water-supply reservoirs are, using TWDB's municipal system groupings.";

export const metadata: Metadata = {
  title: "City water supplies",
  description: DESCRIPTION,
  alternates: { canonical: "/cities" },
  openGraph: {
    url: "/cities",
    title: "Texas city water supplies",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Texas city water supplies",
    description: DESCRIPTION,
  },
};

export default async function CitiesPage() {
  const systems = await getSupplySystems();
  // Most-stressed first: this page exists to answer "is my city's water OK?",
  // and the cities where it isn't belong at the top.
  const ranked = [...systems].sort((a, b) => a.percentFull - b.percentFull);
  const asOf = systems.map((s) => s.asOf).sort().at(-1);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl sm:text-2xl font-semibold">City water supplies</h1>
        <p className="text-muted text-sm mt-1">
          {systems.length} metro-area supply systems, lowest first · TWDB
          conditions as of {asOf ? fmtDate(asOf) : "—"}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {ranked.map((system) => (
          <SystemCard key={system.key} system={system} />
        ))}
      </section>

      <p className="text-xs text-muted">
        Groupings are TWDB&apos;s municipal water-supply systems: the monitored
        reservoirs each metro area draws on, not everything on its
        distribution network — groundwater, run-of-river rights and purchased
        water are outside this accounting. A reservoir can supply more than
        one system (Lake Texoma serves both Dallas and Texarkana), so systems
        overlap and can&apos;t be added together. El Paso&apos;s figure
        includes Elephant Butte in New Mexico, which is excluded from this
        site&apos;s statewide totals but is that city&apos;s principal
        reservoir supply.
      </p>
    </div>
  );
}

function SystemCard({ system }: { system: SupplySystem }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{system.name}</h2>
        <span
          className={`nums text-xl font-semibold shrink-0 ${STATUS_CLASS[fillStatus(system.percentFull)]}`}
        >
          {fmtPercent(system.percentFull)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <FillBar percentFull={system.percentFull} />
        <span className="shrink-0">
          <StatusPill percentFull={system.percentFull} />
        </span>
      </div>
      <p className="text-xs text-muted mt-2">
        {fmtAcreFeet(system.totalStorage)} of {fmtAcreFeet(system.totalCapacity)}{" "}
        conservation capacity across {system.lakes.length}{" "}
        {system.lakes.length === 1 ? "reservoir" : "reservoirs"}
      </p>

      <ul className="mt-3 space-y-1.5">
        {system.lakes.map((lake) => (
          <li
            key={lake.slug}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <Link
              href={`/lake/${lake.slug}`}
              className="truncate hover:text-accent hover:underline inline-flex items-center gap-2"
            >
              {lake.name}
              <LinkSpinner />
            </Link>
            <span
              className={`nums shrink-0 ${STATUS_CLASS[fillStatus(lake.percentFull)]}`}
            >
              {fmtPercent(lake.percentFull)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
