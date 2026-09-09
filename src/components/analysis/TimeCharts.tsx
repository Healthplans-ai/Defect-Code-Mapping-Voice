import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { hasSolvedDates, type BacklogPoint, type Slice, type TimelinePoint } from "@/lib/analytics";
import { Empty } from "@/components/analysis/primitives";
import {
  BACKLOG_SERIES,
  ORDINAL_STEPS,
  REPORTED_SERIES,
  type Series,
} from "@/components/analysis/palette";

/**
 * The three time and distribution charts. Recharts earns its keep here (axes, a
 * crosshair, responsive width); everything else on the page is hand-rolled.
 *
 * No chart below carries a second y-scale: the two series on each plot are the
 * same unit, so one axis reads honestly.
 */

const AXIS = {
  stroke: "var(--axis)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
} as const;

/**
 * Round the y-axis to clean numbers. Recharts' own picks land on things like
 * 0 / 9 / 18 / 27, which the reader has to decode; these ticks carry the values
 * no mark is directly labelled with, so they need to be readable at a glance.
 */
function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/**
 * Props, not a wrapper component — recharts identifies its axes by child type,
 * so `<YAxis {...countAxis(max)} />` works where `<CountAxis />` would not.
 */
const countAxis = (max: number) => {
  const ticks = niceTicks(max);
  return {
    ...AXIS,
    tickLine: false,
    axisLine: false,
    width: 44,
    ticks,
    domain: [0, ticks[ticks.length - 1] ?? 1] as [number, number],
  };
};

const timeAxis = {
  ...AXIS,
  dataKey: "label",
  tickLine: false,
  interval: "preserveStartEnd" as const,
  minTickGap: 16,
};

/**
 * Recharts measures its container, so it renders nothing until the client has
 * laid out. Hold the frame at the right height instead of letting the card jump.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function Frame({ height, children }: { height: number; children: React.ReactNode }) {
  const mounted = useMounted();
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

type TooltipRow = { name: string; value: number; color: string; mark: "rect" | "line" };

function Readout({ active, label, rows }: { active: boolean; label: string; rows: TooltipRow[] }) {
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
              className={r.mark === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-sm"}
              style={{ background: r.color }}
            />
            <span className="font-semibold tabular-nums text-foreground">{r.value}</span>
            <span className="text-muted-foreground">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Recharts' own `TooltipProps` is generic over value/name types that don't line
 * up with `exactOptionalPropertyTypes`, so accept the three fields we read and
 * spell the `| undefined` out.
 */
type RechartsTooltip = {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: { value?: unknown; payload?: unknown }[] | undefined;
};

const asNumber = (v: unknown): number => (typeof v === "number" ? v : 0);

const pointOf = (payload: RechartsTooltip["payload"]): Record<string, number> | undefined => {
  const raw = payload?.[0]?.payload;
  return typeof raw === "object" && raw !== null ? (raw as Record<string, number>) : undefined;
};

/** Build a tooltip that always lists every series, whatever the pointer landed on. */
const seriesTooltip =
  (series: Series[]) =>
  ({ active, label, payload }: RechartsTooltip) => {
    const data = pointOf(payload);
    return (
      <Readout
        active={Boolean(active) && data !== undefined}
        label={String(label ?? "")}
        rows={series.map((s) => ({
          name: s.name,
          value: data?.[s.key] ?? 0,
          color: s.color,
          mark: s.mark,
        }))}
      />
    );
  };

// ---------------------------------------------------------------- charts

/**
 * Rows raised vs rows marked solved, per period. Same unit, grouped columns.
 *
 * The solved series is dropped entirely when no row in the slice carries a
 * `Solved on` date — a second colour pinned at zero for the whole width reads
 * as data when it is really an empty column in the sheet.
 */
export function ReportedVsSolved({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) return <Empty label="No dated rows in this slice." />;

  const withSolved = hasSolvedDates(data);
  const max = data.reduce((m, d) => Math.max(m, d.reported, d.solved), 0);

  return (
    <Frame height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis {...timeAxis} />
        <YAxis {...countAxis(max)} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={seriesTooltip(withSolved ? REPORTED_SERIES : REPORTED_SERIES.slice(0, 1))}
        />
        <Bar dataKey="reported" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        {withSolved ? (
          <Bar dataKey="solved" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        ) : null}
      </BarChart>
    </Frame>
  );
}

/**
 * Running totals; the shaded band under the raised line is what was still open.
 * With no solved dates the backlog is the raised total by definition, so only
 * the one line is drawn.
 */
export function BacklogChart({ data }: { data: BacklogPoint[] }) {
  if (data.length === 0) return <Empty label="No dated rows in this slice." />;

  const withSolved = hasSolvedDates(data);
  const max = data.reduce((m, d) => Math.max(m, d.cumulativeReported), 0);

  return (
    <Frame height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis {...timeAxis} />
        <YAxis {...countAxis(max)} />
        <Tooltip
          cursor={{ stroke: "var(--axis)" }}
          content={seriesTooltip(withSolved ? BACKLOG_SERIES : BACKLOG_SERIES.slice(1, 2))}
        />
        <Area
          dataKey="open"
          stroke={withSolved ? "var(--series-3)" : "var(--series-1)"}
          strokeWidth={2}
          fill={withSolved ? "var(--series-3)" : "var(--series-1)"}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
        {withSolved ? (
          <Line
            dataKey="cumulativeReported"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        ) : null}
        {withSolved ? (
          <Line
            dataKey="cumulativeSolved"
            stroke="var(--series-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        ) : null}
      </AreaChart>
    </Frame>
  );
}

/**
 * Ordered bands (days-to-resolve, age of the open queue) on the ordinal blue
 * ramp — light to dark follows the band order, which is the one case where
 * colouring bars by their own axis is not double-encoding.
 */
export function BandChart({ data, unitLabel }: { data: Slice[]; unitLabel: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty label={`No ${unitLabel} to measure in this slice.`} />;

  const step = (i: number) =>
    ORDINAL_STEPS[
      Math.min(ORDINAL_STEPS.length - 1, Math.floor((i / data.length) * ORDINAL_STEPS.length))
    ] ?? ORDINAL_STEPS[0];

  return (
    <Frame height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="name" {...AXIS} tickLine={false} />
        <YAxis {...countAxis(data.reduce((m, d) => Math.max(m, d.value), 0))} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, label, payload }: RechartsTooltip) => (
            <Readout
              active={Boolean(active)}
              label={String(label ?? "")}
              rows={[
                {
                  name: unitLabel,
                  value: asNumber(payload?.[0]?.value),
                  color: "var(--seq-450)",
                  mark: "rect",
                },
              ]}
            />
          )}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={step(i)} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}
