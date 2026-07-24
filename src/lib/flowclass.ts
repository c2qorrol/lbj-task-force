/**
 * Streamflow percentile classes — the WaterWatch-style "is this river high or
 * low for the season?" bands. Kept apart from the classifier in flowstats.ts
 * so client components can import the palette without dragging the ~350 KB
 * thresholds table into the browser bundle.
 */

export type FlowClass =
  | "much-below"
  | "below"
  | "normal"
  | "above"
  | "much-above";

/**
 * WaterWatch's class boundaries (10/25/75/90), but not its palette: its
 * red/orange low end collides with the NWS flood colours that share this map
 * layer. Dry runs brown, normal keeps the layer's existing sky blue, wet runs
 * deeper blue into indigo.
 */
export const FLOW_CLASS_HEX: Record<FlowClass, string> = {
  "much-below": "#9a3412",
  below: "#d97706",
  normal: "#38bdf8",
  above: "#2563eb",
  "much-above": "#4f46e5",
};

export const FLOW_CLASS_LABEL: Record<FlowClass, string> = {
  "much-below": "Much below normal",
  below: "Below normal",
  normal: "Normal",
  above: "Above normal",
  "much-above": "Much above normal",
};

export const FLOW_CLASS_ORDER: FlowClass[] = [
  "much-below",
  "below",
  "normal",
  "above",
  "much-above",
];
