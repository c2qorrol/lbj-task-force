"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LinkSpinner } from "./Spinner";

export interface NavItem {
  href: string;
  label: string;
}

/** Shared so the hidden measuring row matches the real row's width exactly. */
const LINK_CLASS =
  "px-2.5 sm:px-3 py-1.5 rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1.5";

/**
 * Extra room required before expanding again.
 *
 * Without it, the width at which the row collapses is also the width at which it
 * fits, so dragging a window across that point oscillates.
 */
const HYSTERESIS_PX = 24;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Header navigation that collapses to a dropdown when the links no longer fit.
 *
 * The trigger is measured, not a fixed breakpoint: an off-screen copy of the
 * full row is kept mounted and its natural width compared against the space
 * actually available. That keeps the behaviour correct at any viewport — phone,
 * iPad portrait and landscape alike — and stays correct if nav items are added
 * later, which a hard-coded breakpoint would not.
 */
export default function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  /*
   * The menu stores the route it was opened on rather than a bare boolean, so
   * "close on navigation" and "close when the row expands again" both fall out
   * of a derived value instead of needing effects that chase state changes.
   */
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const open = collapsed && openedFor === pathname;
  const closeMenu = useCallback(() => setOpenedFor(null), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const measure = useCallback(() => {
    const container = containerRef.current;
    const natural = measureRef.current;
    if (!container || !natural) return;

    const available = container.clientWidth;
    const required = natural.scrollWidth;

    setCollapsed((wasCollapsed) =>
      wasCollapsed
        ? required + HYSTERESIS_PX > available
        : required > available,
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const natural = measureRef.current;
    if (!container || !natural) return;

    // ResizeObserver fires once on observe, so the initial measurement happens
    // in the callback rather than synchronously here.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(natural);

    // Web fonts land after first paint and change the row's natural width.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        closeMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeMenu]);

  const current = items.find((item) => isActive(pathname, item.href));

  return (
    <div ref={containerRef} className="flex-1 min-w-0 flex justify-end relative">
      {/*
       * Off-screen measuring copy. Always the full row at its natural width,
       * so the comparison stays valid even while the dropdown is showing —
       * measuring the visible row instead would make the state self-referential.
       */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex items-center gap-0.5 sm:gap-1 text-sm opacity-0 -z-10 whitespace-nowrap"
      >
        {items.map((item) => (
          <span key={item.href} className={LINK_CLASS}>
            {item.label}
          </span>
        ))}
      </div>

      {collapsed ? (
        <>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpenedFor(open ? null : pathname)}
            aria-expanded={open}
            aria-controls={menuId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted hover:text-foreground hover:bg-border/50 transition-colors"
          >
            <span className="max-w-32 truncate text-foreground">
              {current?.label ?? "Menu"}
            </span>
            <ChevronIcon open={open} />
          </button>

          {open ? (
            <div
              ref={panelRef}
              id={menuId}
              className="absolute right-0 top-full mt-1 min-w-48 rounded-lg border border-border bg-surface shadow-xl py-1 z-30"
            >
              <nav aria-label="Main">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={closeMenu}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${
                        active
                          ? "text-foreground bg-border/50"
                          : "text-muted hover:text-foreground hover:bg-border/40"
                      }`}
                    >
                      {item.label}
                      <LinkSpinner />
                    </Link>
                  );
                })}
              </nav>
            </div>
          ) : null}
        </>
      ) : (
        <nav
          aria-label="Main"
          className="flex items-center gap-0.5 sm:gap-1 text-sm -mr-2 sm:mr-0"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${LINK_CLASS} ${
                  active
                    ? "text-foreground bg-border/50"
                    : "text-muted hover:text-foreground hover:bg-border/50"
                }`}
              >
                {item.label}
                <LinkSpinner />
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
