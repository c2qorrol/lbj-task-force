import {
  LoadingAnnouncement,
  SkeletonChart,
  SkeletonHeading,
  SkeletonStatRow,
} from "@/components/skeletons";

/**
 * Fallback for any route without its own skeleton. Routes with a distinct shape
 * (lake, well) override this with something closer to their real layout.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading" />
      <SkeletonHeading />
      <SkeletonStatRow />
      <SkeletonChart />
    </div>
  );
}
