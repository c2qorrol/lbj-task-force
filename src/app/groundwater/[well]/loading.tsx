import {
  LoadingAnnouncement,
  Shimmer,
  SkeletonChart,
  SkeletonStatRow,
} from "@/components/skeletons";

/**
 * The slowest page on the site: TWDB serves a well's complete hourly record as
 * a single ~5 MB CSV with no date filtering, so the first view of a well waits
 * on that download and parse.
 */
export default function LoadingWell() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading well history" />

      <div>
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-7 w-48 mt-3" />
        <Shimmer className="h-3 w-56 mt-2" />
      </div>

      <SkeletonStatRow />
      <SkeletonChart />
    </div>
  );
}
