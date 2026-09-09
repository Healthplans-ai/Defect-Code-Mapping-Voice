import type { Retest, Status } from "@/data/voiceAgent";
import type { ConfidenceBucket } from "@/lib/analytics";

/**
 * Colour by the job it does.
 *
 * Status and retest are *state*, so they wear the reserved status palette
 * (good / warning / serious / critical) and always ship with a text label —
 * two of those steps sit under 3:1 on the light surface by design, so colour
 * never carries the meaning alone. Mapping confidence is an *ordered* scale,
 * so it wears steps of the one sequential hue. Neither set is ever reused as a
 * categorical series.
 */

export const STATUS_COLOR: Record<Status, string> = {
  Done: "var(--good)",
  WIP: "var(--warning)",
  Blocked: "var(--critical)",
  "No defect": "var(--muted-foreground)",
};

export const RETEST_COLOR: Record<Retest, string> = {
  Resolved: "var(--good)",
  "Tested but Not Resolved": "var(--critical)",
  "Not retested": "var(--serious)",
  "No defect": "var(--muted-foreground)",
};

export const CONFIDENCE_COLOR: Record<ConfidenceBucket, string> = {
  Verified: "var(--seq-550)",
  Inferred: "var(--seq-350)",
  Unmapped: "var(--seq-100)",
};

/**
 * Categorical slots, in fixed order. Identity follows the entity, never its
 * rank — a filter that drops a series must not repaint the survivors, so these
 * are declared once here rather than picked per render.
 */
export type Series = { key: string; name: string; color: string; mark: "rect" | "line" };

export const REPORTED_SERIES: Series[] = [
  { key: "reported", name: "Raised", color: "var(--series-1)", mark: "rect" },
  { key: "solved", name: "Marked solved", color: "var(--series-2)", mark: "rect" },
];

export const BACKLOG_SERIES: Series[] = [
  { key: "open", name: "Still open", color: "var(--series-3)", mark: "rect" },
  { key: "cumulativeReported", name: "Raised to date", color: "var(--series-1)", mark: "line" },
  { key: "cumulativeSolved", name: "Solved to date", color: "var(--series-2)", mark: "line" },
];

/** Ordinal steps for ordered bands (days-to-resolve, age of the open queue). */
export const ORDINAL_STEPS = [
  "var(--seq-250)",
  "var(--seq-350)",
  "var(--seq-450)",
  "var(--seq-550)",
];

/**
 * Discrete steps of the one sequential hue, for the heatmap.
 *
 * `--seq-450` is deliberately skipped: heat cells print their count on top of
 * the fill, and that step clears 4.5:1 against neither ink (3.71) nor white
 * (4.36). Every step below has one text colour that does — the first
 * {@link SEQ_INK_STEPS} take ink, the rest take the surface colour.
 */
export const SEQ_STEPS = [
  "var(--seq-100)",
  "var(--seq-250)",
  "var(--seq-350)",
  "var(--seq-550)",
  "var(--seq-700)",
];

/** How many of the leading (lightest) steps carry ink rather than white text. */
export const SEQ_INK_STEPS = 3;
