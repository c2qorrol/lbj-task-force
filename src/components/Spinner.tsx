"use client";

import { useEffect, useState } from "react";
import { useLinkStatus } from "next/link";

export function Spinner({
  className = "",
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <svg
        className="animate-spin h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Delay before a pending indicator appears.
 *
 * Navigations that resolve from cache finish in a few milliseconds. Showing a
 * spinner for those produces a flash that reads as jank rather than feedback,
 * so nothing renders until the wait is long enough to actually notice.
 */
const APPEAR_AFTER_MS = 120;

export function useDelayedPending(pending: boolean, delay = APPEAR_AFTER_MS) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    // No synchronous setState here: the timer arms the flag and cleanup clears
    // it, so a settled state never triggers a cascading re-render.
    if (!pending) return;
    const timer = setTimeout(() => setElapsed(true), delay);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [pending, delay]);

  // Gate on `pending` too, covering the frame between it clearing and cleanup.
  return pending && elapsed;
}

/**
 * Spinner for the link the user just clicked.
 *
 * Must be rendered inside a `<Link>`: `useLinkStatus` reads the pending state of
 * its nearest ancestor link. Lake and well pages are server-rendered on demand
 * from several upstream APIs, so this gap is real — often a second or more on a
 * cold cache — and without it a click looks like it did nothing.
 */
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  const visible = useDelayedPending(pending);
  if (!visible) return null;
  return <Spinner className={`text-accent ${className}`} />;
}
