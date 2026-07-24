/**
 * Loading placeholders.
 *
 * These mirror the real layout's block sizes so the page doesn't jump when
 * content arrives — a spinner alone on an empty page reads as "broken", while a
 * skeleton of the right shape reads as "nearly there".
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-border/60 ${className}`} aria-hidden />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      <Shimmer className="h-3 w-24" />
      <Shimmer className="h-7 w-32 mt-2" />
      <Shimmer className="h-3 w-40 mt-2" />
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-7 w-32" />
      </div>
      <Shimmer className="h-64 sm:h-72 w-full" />
    </div>
  );
}

export function SkeletonHeading() {
  return (
    <div>
      <Shimmer className="h-6 w-56" />
      <Shimmer className="h-3 w-72 mt-2" />
    </div>
  );
}

/** Announces the wait to assistive tech without duplicating it visually. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
