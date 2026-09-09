import { useId, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Slice } from "@/lib/analytics";
import { SEQ_INK_STEPS, SEQ_STEPS } from "@/components/analysis/palette";

/**
 * The pieces every panel on /analysis is built from.
 *
 * Two rules run through all of them: a value is never reachable only by hover
 * (each panel carries a table-view twin), and text never wears the series
 * colour — a swatch beside the label carries identity instead.
 */

// ---------------------------------------------------------------- panel

export function Panel({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string | undefined;
  /** Rendered under the title. Omit for a single-series chart. */
  legend?: ReactNode;
  /** The WCAG-clean twin. When given, the panel grows a chart/table toggle. */
  table?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}) {
  const [showTable, setShowTable] = useState(false);
  const bodyId = useId();

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5", className)}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold leading-snug">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {table ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            aria-controls={bodyId}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
            {showTable ? "Chart" : "Table"}
          </button>
        ) : null}
      </header>

      {legend && !showTable ? <div className="mt-3">{legend}</div> : null}

      <div id={bodyId} className="mt-4">
        {showTable && table ? table : children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- legend

export type LegendItem = { name: string; color: string; value?: number; mark?: "rect" | "line" };

/** Legends mirror the mark: a rect for bars and areas, a short stroke for lines. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Swatch color={item.color} mark={item.mark ?? "rect"} />
          <span>{item.name}</span>
          {item.value === undefined ? null : (
            <span className="font-medium tabular-nums text-foreground">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ color, mark = "rect" }: { color: string; mark?: "rect" | "line" }) {
  return mark === "line" ? (
    <span
      aria-hidden
      className="inline-block h-0.5 w-3.5 rounded-full"
      style={{ background: color }}
    />
  ) : (
    <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
  );
}

// ---------------------------------------------------------------- stat tile

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warning" | "critical";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--good)]"
      : tone === "warning"
        ? "text-[var(--serious)]"
        : tone === "critical"
          ? "text-[var(--critical)]"
          : "text-primary";

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-bold", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- bar list

/**
 * Horizontal bars for a nominal breakdown: one series, one colour for every bar
 * (a value ramp here would just re-encode bar length as hue), the value direct-
 * labelled at the tip.
 */
export function BarList({
  data,
  color = "var(--series-1)",
  total,
  emptyLabel = "Nothing in this slice.",
  onSelect,
  selected,
  monoLabels = false,
}: {
  data: Slice[];
  color?: string;
  /** Denominator for the "% of rows" readout. Defaults to the sum of `data`. */
  total?: number;
  emptyLabel?: string;
  onSelect?: (name: string) => void;
  selected?: string[];
  monoLabels?: boolean;
}) {
  if (data.length === 0) return <Empty label={emptyLabel} />;

  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const denominator = total ?? data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const isSelected = selected?.includes(d.name) ?? false;
        const share = denominator > 0 ? Math.round((d.value / denominator) * 100) : 0;
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  "min-w-0 truncate text-xs",
                  monoLabels && "font-mono",
                  isSelected ? "font-semibold text-primary" : "text-foreground",
                )}
                title={d.name}
              >
                {d.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{d.value}</span> · {share}%
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full">
              <div
                className="h-2.5 rounded-r-[4px] transition-[width] duration-500"
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }}
              />
            </div>
          </>
        );

        return (
          <li key={d.name}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(d.name)}
                aria-pressed={isSelected}
                className="w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
              >
                {row}
              </button>
            ) : (
              <div className="px-1.5 py-1">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- split bar

/**
 * One stacked bar for a part-to-whole split of four-or-fewer classes, with a 2px
 * surface gap doing the separating. Preferred over a donut: close values stay
 * comparable and the counts are direct-labelled in the legend.
 */
export function SplitBar({
  data,
  colors,
}: {
  data: { name: string; value: number }[];
  colors: Record<string, string>;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty label="Nothing in this slice." />;

  const present = data.filter((d) => d.value > 0);

  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-md">
        {present.map((d) => (
          <div
            key={d.name}
            className="h-4 first:rounded-l-md last:rounded-r-md"
            style={{
              flexGrow: d.value,
              flexBasis: 0,
              background: colors[d.name] ?? "var(--muted)",
            }}
            title={`${d.name}: ${d.value}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <Swatch color={colors[d.name] ?? "var(--muted)"} />
              <span className="truncate text-muted-foreground">{d.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-foreground">{d.value}</span>{" "}
              <span className="text-muted-foreground">
                · {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

/**
 * Component × dimension counts on a one-hue sequential ramp. Every cell also
 * prints its number, so the colour is never the only encoding.
 */
export function Heatmap({
  columns,
  rows,
  max,
}: {
  columns: string[];
  rows: { label: string; name: string; cells: number[]; total: number }[];
  max: number;
}) {
  if (rows.length === 0) return <Empty label="Nothing in this slice." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-48 px-1 pb-2 text-left font-medium text-muted-foreground">
              Component
            </th>
            {columns.map((c) => (
              <th key={c} className="px-1 pb-2 text-center font-medium text-muted-foreground">
                {c}
              </th>
            ))}
            <th className="px-1 pb-2 text-right font-medium text-muted-foreground">All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.label}-${r.name}`}>
              <th scope="row" className="max-w-48 truncate px-1 py-1 text-left font-normal">
                <span className="font-mono text-muted-foreground">{r.label}</span>{" "}
                <span title={r.name}>{r.name}</span>
              </th>
              {r.cells.map((value, i) => {
                const step = rampIndex(value, max);
                return (
                  <td key={columns[i] ?? i} className="p-0">
                    <div
                      className="flex h-8 items-center justify-center rounded-md tabular-nums"
                      style={{
                        background: value === 0 ? "var(--muted)" : SEQ_STEPS[step],
                        // Ink on the light steps, surface colour on the dark ones —
                        // both directions clear 4.5:1 against the step they sit on.
                        color:
                          value === 0 || step < SEQ_INK_STEPS ? "var(--foreground)" : "var(--card)",
                      }}
                      title={`${r.label} · ${columns[i] ?? ""}: ${value}`}
                    >
                      {value === 0 ? <span className="text-muted-foreground">·</span> : value}
                    </div>
                  </td>
                );
              })}
              <td className="px-1 py-1 text-right font-semibold tabular-nums">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Which discrete step of the ramp a value lands on. */
function rampIndex(value: number, max: number): number {
  if (max <= 0) return 0;
  const idx = Math.floor((value / max) * SEQ_STEPS.length);
  return Math.min(SEQ_STEPS.length - 1, Math.max(0, idx));
}

export function SequentialScaleLegend({ max }: { max: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>0</span>
      <span className="flex gap-0.5" aria-hidden>
        {SEQ_STEPS.map((step) => (
          <span key={step} className="size-3 rounded-sm" style={{ background: step }} />
        ))}
      </span>
      <span className="tabular-nums">{max}</span>
      <span>defects</span>
    </div>
  );
}

// ---------------------------------------------------------------- tables

export function SimpleTable({
  head,
  rows,
  numericFrom = 1,
}: {
  head: string[];
  rows: (string | number)[][];
  /** Column index from which cells right-align with tabular figures. */
  numericFrom?: number;
}) {
  if (rows.length === 0) return <Empty label="Nothing in this slice." />;

  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-3 py-2 font-medium text-muted-foreground",
                  i >= numericFrom ? "text-right" : "text-left",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-border/70">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-1.5",
                    i >= numericFrom ? "text-right tabular-nums" : "text-left",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SliceTable({ data, label }: { data: Slice[]; label: string }) {
  return <SimpleTable head={[label, "Defects"]} rows={data.map((d) => [d.name, d.value])} />;
}

// ---------------------------------------------------------------- misc

export function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
      {label}
    </p>
  );
}
