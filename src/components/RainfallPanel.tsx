import { Card, SectionHeading } from "./ui";
import { Shimmer } from "./skeletons";
import { getRainfall, summarizeNear } from "@/lib/rainfall";

/**
 * Rainfall near a reservoir.
 *
 * Rendered inside a Suspense boundary so it streams separately from the rest of
 * the lake page. It depends on a ~2 MB statewide feed, and when it was awaited
 * inline a slow or cold fetch held the entire page — enrichment should never be
 * able to do that.
 */
export default async function RainfallPanel({
  lat,
  lon,
}: {
  lat: number | null;
  lon: number | null;
}) {
  const stations = await getRainfall().catch(() => []);
  const rain = summarizeNear(stations, lat, lon);
  if (!rain) return null;

  return (
    <section>
      <SectionHeading
        title="Recent rainfall"
        subtitle={`CoCoRaHS observers within ${rain.radiusKm} km of the dam`}
      />
      <Card>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <Figure
            label="Past 7 days"
            value={`${rain.meanWeekIn.toFixed(2)} in`}
            hint="average nearby"
          />
          <Figure
            label="Wettest nearby"
            value={`${rain.maxWeekIn.toFixed(2)} in`}
            hint="single station, 7 days"
          />
          <Figure
            label="Latest 24 hours"
            value={`${rain.meanDayIn.toFixed(2)} in`}
            hint={`average of ${rain.stations} stations`}
          />
        </div>
        <p className="text-xs text-muted mt-3">
          Rain measured <em>near the dam</em>, not across the watershed. A
          reservoir is fed by a catchment that can reach hundreds of kilometres
          upstream, so heavy local rain does not necessarily mean inflow — and a
          rising lake often reflects rain far from here. Readings are volunteer
          observations taken once each morning.
        </p>
      </Card>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="nums text-xl font-semibold mt-0.5">{value}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}

export function RainfallPanelSkeleton() {
  return (
    <section>
      <Shimmer className="h-5 w-40" />
      <Shimmer className="h-3 w-64 mt-2" />
      <div className="rounded-xl border border-border bg-surface p-4 mt-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Shimmer className="h-3 w-24" />
              <Shimmer className="h-6 w-20 mt-2" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
