import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from "recharts";

import { STATUS_ORDER, type TimelinePoint } from "@/lib/analytics";
import type { Status } from "@/lib/api";
import { Empty } from "@/components/analysis/primitives";
import { STATUS_COLOR } from "@/components/analysis/palette";
import {
  countAxis,
  pointOf,
  timeAxis,
  VALUE_LABEL,
  type RechartsTooltip,
} from "@/components/analysis/chart-kit";
import { Frame, Readout } from "@/components/analysis/chart-parts";

/**
 * The timeline. Recharts earns its keep here (axes, a crosshair, responsive
 * width); the shared axis and tooltip plumbing lives in `chart-kit`.
 */

/**
 * Rows raised per period, stacked by where each one stands today.
 *
 * One cohort, segments that add up to the bar: the height is always the number
 * raised and the colour says how much of it is finished, so a bar with no amber
 * or red left in it is a period fully closed out.
 *
 * That is the question this chart exists to answer, and the one the old "marked
 * solved" series could not. It counted fixes by the date they landed, which is
 * a different set of rows from the ones raised in the same period — a fix in
 * week 5 for a defect from week 2 scored against week 5 — so it routinely drew
 * more solved than raised, and neither bar said whether a week was done.
 */
export function RaisedByStatus({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) return <Empty label="No dated rows in this slice." />;

  const max = data.reduce((m, d) => Math.max(m, d.raised), 0);
  // Only statuses that appear somewhere in this slice get a layer, so an absent
  // one does not add an invisible 2px stroke to the top of every bar.
  const present = STATUS_ORDER.filter((s) => data.some((d) => d.byStatus[s] > 0));

  return (
    <Frame height={300}>
      <BarChart data={data} margin={{ top: 22, right: 12, bottom: 4, left: -14 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis {...timeAxis} />
        <YAxis {...countAxis(max)} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<PeriodReadout />} />
        {present.map((status, i) => (
          <Bar
            key={status}
            dataKey={`byStatus.${status}`}
            stackId="raised"
            fill={STATUS_COLOR[status]}
            maxBarSize={34}
            // The 2px surface stroke is what separates one segment from the
            // next; without it two adjacent statuses read as a single block.
            stroke="var(--card)"
            strokeWidth={2}
          >
            {/* The stack's own total, labelled once on the topmost layer. */}
            {i === present.length - 1 ? (
              <LabelList dataKey="raised" position="top" {...VALUE_LABEL} />
            ) : null}
          </Bar>
        ))}
      </BarChart>
    </Frame>
  );
}

function PeriodReadout({ active, label, payload }: RechartsTooltip) {
  const point = pointOf(payload) as TimelinePoint | undefined;
  if (point === undefined) return null;
  const open = point.byStatus.WIP + point.byStatus.Blocked;

  return (
    <Readout
      active={Boolean(active)}
      label={String(label ?? "")}
      rows={[
        { name: "raised", value: point.raised, color: "var(--muted-foreground)", mark: "rect" },
        ...STATUS_ORDER.filter((s) => point.byStatus[s] > 0).map((s: Status) => ({
          name: s.toLowerCase(),
          value: point.byStatus[s],
          color: STATUS_COLOR[s],
          mark: "rect" as const,
        })),
      ]}
      note={open === 0 ? "everything raised here is closed out" : `${open} still open`}
    />
  );
}
