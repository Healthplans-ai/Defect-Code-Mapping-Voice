import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Slice } from "@/lib/analytics";
import { Empty, Swatch } from "@/components/analysis/primitives";
import {
  AXIS,
  countAxisX,
  pointOf,
  VALUE_LABEL,
  type RechartsTooltip,
} from "@/components/analysis/chart-kit";
import { Frame, Readout, ValueReadout } from "@/components/analysis/chart-parts";

/**
 * The figures that are not time series: the two donuts, the raised-to-resolved
 * funnel, the weekday radar and the ranked bars.
 *
 * Each one is picked for the job its data does — part-to-whole for a split of
 * four classes, a ranked bar for a nominal breakdown of thirteen, a polar grid
 * for a cycle that closes on itself — rather than for variety's sake. Every one
 * of them ships a table twin from the panel that hosts it, so no value here is
 * reachable only by hover.
 */

const share = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

// ---------------------------------------------------------------- donut

/**
 * Part-to-whole for a split of four-or-fewer classes, with the headline number
 * in the hole and every count spelled out in the legend underneath.
 *
 * The ring is only ever fed the reserved status palette, so colour repeats the
 * label rather than carrying meaning on its own, and a 2px surface stroke keeps
 * two adjacent slices from reading as one arc.
 */
export function Donut({
  data,
  colors,
  centerValue,
  centerLabel,
  unitLabel = "rows",
  height = 208,
}: {
  data: Slice[];
  colors: Record<string, string>;
  centerValue: string;
  centerLabel: string;
  unitLabel?: string;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty label="Nothing in this slice." />;

  const present = data.filter((d) => d.value > 0);

  return (
    <div>
      <div className="relative">
        <Frame height={height}>
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Tooltip
              content={({ active, payload }: RechartsTooltip) => {
                const d = pointOf(payload);
                const name = typeof d?.["name"] === "string" ? d["name"] : "";
                const value = typeof d?.["value"] === "number" ? d["value"] : 0;
                return (
                  <Readout
                    active={Boolean(active) && name !== ""}
                    label={name}
                    rows={[
                      {
                        name: unitLabel,
                        value,
                        color: colors[name] ?? "var(--muted)",
                        mark: "rect",
                      },
                    ]}
                    note={`${share(value, total)}% of ${total}`}
                  />
                );
              }}
            />
            <Pie
              data={present}
              dataKey="value"
              nameKey="name"
              innerRadius="63%"
              outerRadius="94%"
              paddingAngle={present.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={550}
            >
              {present.map((d) => (
                <Cell key={d.name} fill={colors[d.name] ?? "var(--muted)"} />
              ))}
            </Pie>
          </PieChart>
        </Frame>
        {/* The hero number lives in the hole; the ring is the supporting read. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-3xl font-bold leading-none">{centerValue}</span>
          <span className="mt-1 max-w-[8rem] text-[0.6875rem] leading-tight text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <Swatch color={colors[d.name] ?? "var(--muted)"} />
              <span className="truncate text-muted-foreground" title={d.name}>
                {d.name}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-foreground">{d.value}</span>{" "}
              <span className="text-muted-foreground">· {share(d.value, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- funnel

export type Stage = {
  name: string;
  value: number;
  color: string;
  /** What the rows that fell out between the previous stage and this one are. */
  dropLabel?: string;
};

/**
 * The raised → resolved funnel, as stacked proportional bars rather than a
 * tapering trapezoid: a funnel's slanted sides encode nothing, and reading a
 * width off a shrinking shape is harder than reading it off a common baseline.
 * Each step also names what dropped out of it, which is the actual question.
 */
export function StageFunnel({ stages }: { stages: Stage[] }) {
  const first = stages[0]?.value ?? 0;
  if (first === 0) return <Empty label="Nothing in this slice." />;

  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const previous = stages[i - 1];
        const drop = previous === undefined ? 0 : previous.value - s.value;
        return (
          <li key={s.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-foreground">{s.name}</span>
              <span className="shrink-0 text-xs tabular-nums">
                <span className="font-semibold text-foreground">{s.value}</span>{" "}
                <span className="text-muted-foreground">· {share(s.value, first)}%</span>
              </span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-3 rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(1.5, (s.value / first) * 100)}%`,
                  background: s.color,
                }}
              />
            </div>
            {drop > 0 && s.dropLabel ? (
              <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">
                −{drop} {s.dropLabel}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- radar

/**
 * Weekday rhythm on a polar grid. A cycle that closes on itself is the one case
 * a radar beats a bar chart: Monday sits next to Sunday, which is true of the
 * week and not of a left-to-right axis.
 */
export function WeekdayRadar({ data }: { data: Slice[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty label="No dated rows in this slice." />;

  return (
    <Frame height={260}>
      <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke="var(--grid)" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
        />
        <PolarRadiusAxis
          angle={90}
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          stroke="var(--axis)"
          tickCount={4}
          axisLine={false}
        />
        <Tooltip
          content={<ValueReadout unitLabel="defects raised" color="var(--series-1)" mark="dot" />}
        />
        <Radar
          dataKey="value"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="var(--series-1)"
          fillOpacity={0.22}
          dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
          animationDuration={550}
        />
      </RadarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------- ranked bars

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * A ranked nominal breakdown — thirteen categories is far past what a pie can
 * hold, so it gets horizontal bars on a common baseline instead. One hue for
 * every bar: length already carries the magnitude, and a ramp on top of it
 * would encode the same number twice. The selected bar steps darker on the same
 * hue rather than picking up a second one.
 */
export function RankedBars({
  data,
  onSelect,
  selected = [],
  labelWidth = 168,
  monoLabels = false,
  barSize = 15,
  unitLabel = "defects",
}: {
  data: Slice[];
  onSelect?: (name: string) => void;
  selected?: string[];
  labelWidth?: number;
  monoLabels?: boolean;
  barSize?: number;
  unitLabel?: string;
}) {
  if (data.length === 0) return <Empty label="Nothing in this slice." />;

  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const height = data.length * (barSize + 13) + 42;

  return (
    <Frame height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 34, bottom: 0, left: 0 }}
        barCategoryGap={6}
      >
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis {...countAxisX(max)} />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          {...AXIS}
          tick={{
            fill: "var(--muted-foreground)",
            fontSize: 11,
            fontFamily: monoLabels ? "var(--font-mono)" : undefined,
          }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: unknown) => truncate(String(v), monoLabels ? 26 : 24)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={<ValueReadout unitLabel={unitLabel} color="var(--seq-450)" />}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          barSize={barSize}
          {...(onSelect
            ? {
                cursor: "pointer",
                onClick: (entry: unknown) => {
                  const name = (entry as { name?: unknown } | undefined)?.name;
                  if (typeof name === "string") onSelect(name);
                },
              }
            : {})}
          animationDuration={550}
        >
          <LabelList dataKey="value" position="right" {...VALUE_LABEL} />
          {data.map((d) => (
            <Cell
              key={d.name}
              fill={selected.includes(d.name) ? "var(--seq-700)" : "var(--seq-450)"}
            />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}
