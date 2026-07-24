import {
  LoadingAnnouncement,
  Shimmer,
  SkeletonCard,
  SkeletonChart,
  SkeletonStatRow,
} from "@/components/skeletons";

/**
 * Lake pages assemble TWDB history, a USGS or USACE gage, river flows, drought
 * and period-of-record percentiles, so a cold load takes a visible moment.
 */
export default function LoadingLake() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading reservoir data" />

      <div>
        <Shimmer className="h-4 w-28" />
        <div className="flex items-end justify-between gap-3 mt-3">
          <div>
            <Shimmer className="h-7 w-64" />
            <Shimmer className="h-3 w-48 mt-2" />
          </div>
          <Shimmer className="h-4 w-28" />
        </div>
      </div>

      <SkeletonStatRow />

      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <SkeletonChart />
    </div>
  );
}
