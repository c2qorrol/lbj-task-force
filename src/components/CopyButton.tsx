"use client";

import { useEffect, useState } from "react";

/**
 * Copy-to-clipboard for values that must be transcribed exactly.
 *
 * The value stays visible and selectable regardless, so a browser that refuses
 * the clipboard API — or an older one that lacks it — degrades to reading the
 * text rather than losing the ability to use it.
 */
export default function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  // Reset the confirmation so the button does not read "Copied" indefinitely.
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} ${value}`}
      className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent transition-colors"
    >
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Select it instead" : label}
      </span>
    </button>
  );
}
