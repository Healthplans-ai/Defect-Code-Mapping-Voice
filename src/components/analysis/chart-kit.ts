/**
 * Axis props, scales and payload readers shared by every recharts figure on
 * /analysis. Values only — the marks and the tooltip live in `chart-parts.tsx`.
 *
 * Kept in one place so a new figure inherits the axis rounding rather than
 * re-deciding it.
 */

/**
 * Direct value labels wear a text token, never the series colour: a light
 * categorical hue is unreadable as text on the card surface. Identity comes
 * from the mark underneath.
 */
export const VALUE_LABEL = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontWeight: 600,
  // A "0" floating over a zero-height bar is noise: the gap already says it.
  formatter: (v: unknown) => (typeof v === "number" && v > 0 ? String(v) : ""),
} as const;

export const AXIS = {
  stroke: "var(--axis)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const;

/**
 * Round the value axis to clean numbers. Recharts' own picks land on things
 * like 0 / 9 / 18 / 27, which the reader has to decode; these ticks carry the
 * values no mark is directly labelled with, so they need to read at a glance.
 */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const countScale = (max: number) => {
  const ticks = niceTicks(max);
  return { ticks, domain: [0, ticks[ticks.length - 1] ?? 1] as [number, number] };
};

/**
 * Props, not a wrapper component — recharts identifies its axes by child type,
 * so `<YAxis {...countAxis(max)} />` works where `<CountAxis />` would not.
 */
export const countAxis = (max: number) => ({
  ...AXIS,
  tickLine: false,
  axisLine: false,
  width: 44,
  ...countScale(max),
});

/** The same scale on the horizontal axis, for `layout="vertical"` bar charts. */
export const countAxisX = (max: number) => ({
  ...AXIS,
  type: "number" as const,
  tickLine: false,
  axisLine: false,
  height: 26,
  ...countScale(max),
});

export const timeAxis = {
  ...AXIS,
  dataKey: "label",
  tickLine: false,
  interval: "preserveStartEnd" as const,
  minTickGap: 16,
};

// ---------------------------------------------------------------- payloads

/**
 * Recharts' own `TooltipProps` is generic over value/name types that don't line
 * up with `exactOptionalPropertyTypes`, so accept the three fields we read and
 * spell the `| undefined` out.
 */
export type RechartsTooltip = {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: { value?: unknown; name?: unknown; payload?: unknown }[] | undefined;
};

export type TooltipRow = {
  name: string;
  value: number | string;
  color: string;
  mark: "rect" | "line" | "dot";
};

export const asNumber = (v: unknown): number => (typeof v === "number" ? v : 0);

/** The datum under the pointer, whichever mark recharts happened to hit. */
export const pointOf = (
  payload: RechartsTooltip["payload"],
): Record<string, unknown> | undefined => {
  const raw = payload?.[0]?.payload;
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
};
