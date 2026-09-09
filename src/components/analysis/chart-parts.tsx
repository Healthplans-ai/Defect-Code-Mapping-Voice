import { useEffect, useState } from "react";
import { ResponsiveContainer } from "recharts";

import type { Series } from "@/components/analysis/palette";
import {
  asNumber,
  pointOf,
  type RechartsTooltip,
  type TooltipRow,
} from "@/components/analysis/chart-kit";

/**
 * The two pieces every recharts figure renders around its marks: the responsive
 * frame, and the tooltip.
 *
 * The readouts are components rather than render callbacks so recharts can be
 * handed `content={<SeriesReadout series={…} />}` — it clones the element with
 * `active` / `label` / `payload` on it.
 */

/**
 * Recharts measures its container, so it renders nothing until the client has
 * laid out. Hold the frame at the right height instead of letting the card jump.
 */
export function Frame({ height, children }: { height: number; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ height }} className="w-full">
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- tooltip

export function Readout({
  active,
  label,
  rows,
  note,
}: {
  active: boolean;
  label: string;
  rows: TooltipRow[];
  note?: string | undefined;
}) {
  if (!active) return null;
  return (
    <div
      className="rounded-xl border border-border bg-card px-3 py-2 text-xs"
      style={{ boxShadow: "var(--shadow-lift)" }}
    >
      <p className="font-medium text-muted-foreground">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                r.mark === "line"
                  ? "h-0.5 w-3 rounded-full"
                  : r.mark === "dot"
                    ? "size-2.5 rounded-full"
                    : "size-2.5 rounded-sm"
              }
              style={{ background: r.color }}
            />
            <span className="font-semibold tabular-nums text-foreground">{r.value}</span>
            <span className="text-muted-foreground">{r.name}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-1.5 text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Lists every series whatever the pointer landed on, so the readout never jumps. */
export function SeriesReadout({
  series,
  active,
  label,
  payload,
}: RechartsTooltip & { series: Series[] }) {
  const data = pointOf(payload);
  return (
    <Readout
      active={Boolean(active) && data !== undefined}
      label={String(label ?? "")}
      rows={series.map((s) => ({
        name: s.name,
        value: asNumber(data?.[s.key]),
        color: s.color,
        mark: s.mark,
      }))}
    />
  );
}

/** The hovered mark's own value against one fixed unit label. */
export function ValueReadout({
  unitLabel,
  color,
  mark = "rect",
  active,
  label,
  payload,
}: RechartsTooltip & {
  unitLabel: string;
  color: string;
  mark?: "rect" | "line" | "dot";
}) {
  return (
    <Readout
      active={Boolean(active)}
      label={String(label ?? "")}
      rows={[{ name: unitLabel, value: asNumber(payload?.[0]?.value), color, mark }]}
    />
  );
}
