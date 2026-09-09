import { Bar, CartesianGrid, ComposedChart, LabelList, Tooltip, XAxis, YAxis } from "recharts";

import { hasSolvedDates, type TimelinePoint } from "@/lib/analytics";
import { Empty } from "@/components/analysis/primitives";
import { REPORTED_SERIES } from "@/components/analysis/palette";
import { countAxis, timeAxis, VALUE_LABEL } from "@/components/analysis/chart-kit";
import { Frame, SeriesReadout } from "@/components/analysis/chart-parts";

/**
 * The timeline chart. Recharts earns its keep here (axes, a crosshair,
 * responsive width); the shared axis and tooltip plumbing lives in `chart-kit`.
 *
 * It carries no second y-scale: both series count tracker rows, so one axis
 * reads honestly.
 */

// ---------------------------------------------------------------- charts

/**
 * Rows raised vs rows marked solved, per period. Same unit, grouped columns,
 * with a soft trend line over the raised series so the shape survives a slice
 * that is mostly one- and two-row columns.
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
    <Frame height={300}>
      <ComposedChart data={data} margin={{ top: 22, right: 12, bottom: 4, left: -14 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis {...timeAxis} />
        <YAxis {...countAxis(max)} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <SeriesReadout series={withSolved ? REPORTED_SERIES : REPORTED_SERIES.slice(0, 1)} />
          }
        />
        <Bar dataKey="reported" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {/*
            Few enough columns that labelling every cap is clearer than making
            the reader hover or trace back to the axis. Recharts hides a label
            that will not fit, so a dense slice degrades to the axis on its own.
          */}
          <LabelList dataKey="reported" position="top" {...VALUE_LABEL} />
        </Bar>
        {withSolved ? (
          <Bar dataKey="solved" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="solved" position="top" {...VALUE_LABEL} />
          </Bar>
        ) : null}
      </ComposedChart>
    </Frame>
  );
}
