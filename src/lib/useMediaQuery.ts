"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * `matchMedia` is an external store, so this uses `useSyncExternalStore` rather
 * than effect-plus-state: it avoids the cascading render that setting state in
 * an effect causes, and gives a first-class server snapshot.
 *
 * The server snapshot is always `false`, so markup matches during hydration and
 * the real value lands immediately after. Callers must therefore treat `false`
 * as "not yet known" and choose a default that is safe in that state — which is
 * why layout uses CSS breakpoints wherever possible and reserves this hook for
 * behaviour that CSS alone cannot express.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind's `sm` breakpoint: below this we lay out for phones. */
export const usePhone = () => useMediaQuery("(max-width: 639px)");

/**
 * Devices without a real hover state. Tap-to-preview replaces hover-to-preview
 * on the map, since a hover tooltip is unreachable on touch.
 */
export const useTouch = () => useMediaQuery("(hover: none)");
