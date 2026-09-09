import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDefectStore } from "@/hooks/useDefectStore";
import { StoreEmpty, StoreError, StoreLoading } from "@/components/StoreState";
import { RaisedByStatus } from "@/components/analysis/TimeCharts";
import {
  Donut,
  RankedBars,
  StageFunnel,
  WeekdayRadar,
  type Stage,
} from "@/components/analysis/Figures";
import { ComponentStacks, DefectTable } from "@/components/analysis/Breakdowns";
import { FilterBar } from "@/components/analysis/FilterBar";
import {
  Heatmap,
  Legend,
  Panel,
  SequentialScaleLegend,
  SimpleTable,
  StatTile,
  SliceTable,
} from "@/components/analysis/primitives";
import { RETEST_COLOR, STATUS_COLOR } from "@/components/analysis/palette";
import {
  applyFilters,
  buildRows,
  componentBreakdown,
  componentMatrix,
  clearedPeriods,
  EMPTY_FILTERS,
  kpis,
  MAX_TIMELINE_BUCKETS,
  RETEST_ORDER,
  STATUS_ORDER,
  tally,
  tallyMany,
  tallyOrdered,
  timeline,
  toCsv,
  UNMAPPED_KEY,
  withOther,
  type Filters,
  type Granularity,
} from "@/lib/analytics";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Defect analysis — healthplans.ai" },
      {
        name: "description",
        content:
          "Cut the voice-agent defect tracker by date, component, category, status and retest verdict.",
      },
    ],
  }),
  component: AnalysisPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const weekdayOf = (iso: string): string => {
  if (iso === "") return "";
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return Number.isNaN(day) ? "" : (WEEKDAYS[(day + 6) % 7] ?? "");
};

const days = (n: number | null): string => (n === null ? "—" : `${n} d`);

/**
 * Says what the bar is and what "finished" looks like, then how many periods
 * are actually there yet — the headline the chart is drawn to deliver.
 */
const timelineSubtitle = (
  granularity: Granularity,
  cleared: number,
  total: number,
  truncated: boolean,
): string => {
  const base =
    `Each bar is the rows raised in that ${granularity}, coloured by where they stand today — ` +
    `so a bar with no WIP or Blocked left in it is a ${granularity} fully closed out. ` +
    (total === 0
      ? ""
      : cleared === total
        ? `All ${total} are clear.`
        : `${cleared} of ${total} are clear.`);
  return truncated
    ? `${base} The range is longer than ${MAX_TIMELINE_BUCKETS} ${granularity}s, so only the most recent are drawn — switch the bucket to week or month for the whole span.`
    : base;
};

function AnalysisPage() {
  const { store, hasData, isEmpty, isFetching, loadError, refetch } = useDefectStore();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  /**
   * Weekly by default. The tracker runs over about six weeks, which is roughly
   * forty daily columns most of them one or two rows tall — technically correct
   * and hard to read anything off. Weeks show the shape; the toggle is right
   * there when a day matters.
   */
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [matrixDimension, setMatrixDimension] = useState<"status" | "retest">("status");

  const allRows = useMemo(() => buildRows(store.components), [store.components]);
  const rows = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);

  const span = useMemo(() => {
    const dates = allRows
      .map((r) => r.date)
      .filter(Boolean)
      .sort();
    return { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" };
  }, [allRows]);

  const categories = useMemo(
    () => [...new Set(allRows.map((r) => r.category || "Uncategorised"))].sort(),
    [allRows],
  );

  const stats = useMemo(() => kpis(rows), [rows]);
  const { points, truncated } = useMemo(() => timeline(rows, granularity), [rows, granularity]);
  /** How many periods have nothing left open — the chart's headline. */
  const cleared = useMemo(() => clearedPeriods(points), [points]);
  const breakdown = useMemo(
    () => componentBreakdown(rows, store.components),
    [rows, store.components],
  );
  const matrix = useMemo(
    () => componentMatrix(breakdown, matrixDimension),
    [breakdown, matrixDimension],
  );

  const byStatus = useMemo(() => tallyOrdered(rows, STATUS_ORDER, (r) => r.status), [rows]);
  const byRetest = useMemo(() => tallyOrdered(rows, RETEST_ORDER, (r) => r.retest), [rows]);
  const byCategory = useMemo(() => tally(rows, (r) => r.category || "Uncategorised"), [rows]);
  const byWeekday = useMemo(() => {
    const counts = tally(rows, (r) => weekdayOf(r.date));
    return WEEKDAYS.map((d) => ({
      name: d,
      value: counts.find((c) => c.name === d)?.value ?? 0,
    })).filter((d, _i, list) => list.some((x) => x.value > 0));
  }, [rows]);

  const alsoTouched = useMemo(() => {
    const names = new Map(store.components.map((c) => [c.id, c.name]));
    return tallyMany(rows, (r) =>
      r.alsoTouchesIds.map((id) => `C${id} ${names.get(id) ?? ""}`.trim()),
    );
  }, [rows, store.components]);
  const byTester = useMemo(
    () =>
      withOther(
        tally(rows, (r) => r.testedBy),
        10,
      ),
    [rows],
  );

  /**
   * The retest read, in one place so the tile, the donut and the funnel cannot
   * drift apart.
   *
   * The rate is against the rows that actually carry a verdict — resolved plus
   * tested-and-still-broken. It answers "of what we re-tested, how much came
   * back fixed", which is a claim about the fixes. Rows nobody has re-tested
   * are not evidence either way, so they are reported beside the rate rather
   * than dragging it down as if they had failed.
   */
  const pass = {
    rate: pct(stats.resolved, stats.retested),
    resolved: stats.resolved,
    retested: stats.retested,
    failed: stats.notResolved,
    notRetested: stats.notRetested,
  };

  /**
   * A strictly nested cohort, so every step is the previous one minus a named
   * drop rather than four independent counts on the same scale. "No defect"
   * rows leave at the first step: there was nothing to fix, so keeping them in
   * the denominator would understate the pass rate.
   */
  const funnel: Stage[] = [
    { name: "Raised", value: stats.total, color: "var(--seq-250)" },
    {
      name: "Real defects",
      value: stats.realDefects,
      color: "var(--seq-350)",
      dropLabel: "settled as no defect",
    },
    {
      name: "Re-tested",
      value: stats.retested,
      color: "var(--seq-550)",
      dropLabel: "not re-tested yet",
    },
    {
      name: "Resolved on retest",
      value: stats.resolved,
      color: "var(--seq-700)",
      dropLabel: "came back still broken",
    },
  ];

  /**
   * Which optional tracker columns this data actually carries, measured over the
   * whole store rather than the current slice. A column nobody has filled in is
   * a gap in the sheet, not a finding — so its panel is left out entirely and
   * named once below instead of standing there as an empty card.
   */
  const carries = useMemo(
    () => ({
      testedBy: allRows.some((r) => r.testedBy !== ""),
      alsoTouches: allRows.some((r) => r.alsoTouchesIds.length > 0),
    }),
    [allRows],
  );

  const missingColumns = (
    [
      ["Also Touches", carries.alsoTouches],
      ["Tested By", carries.testedBy],
    ] as const
  )
    .filter(([, present]) => !present)
    .map(([name]) => name);

  const toggleComponent = (id: number) =>
    setFilters((f) => ({
      ...f,
      componentIds: f.componentIds.includes(id)
        ? f.componentIds.filter((v) => v !== id)
        : [...f.componentIds, id],
    }));

  const toggleCategory = (name: string) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(name)
        ? f.categories.filter((v) => v !== name)
        : [...f.categories, name],
    }));

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `defects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusLegend = (
    <Legend
      items={STATUS_ORDER.map((s) => ({
        name: s,
        color: STATUS_COLOR[s],
        value: byStatus.find((d) => d.name === s)?.value ?? 0,
      }))}
    />
  );

  return (
    <main className="min-h-screen">
      <SiteHeader active="analysis" />

      <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              Defect analysis
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Cut the tracker by date, component and defect
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Every panel below reads the same slice — set the filters once and the timeline, the
              component split, the category ranking and the row table all move together.
            </p>
          </div>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              <Download className="size-4" />
              Export slice as CSV
            </button>
          ) : null}
        </div>

        {loadError ? (
          <div className="mt-6 max-w-2xl">
            <StoreError message={loadError.message} onRetry={() => void refetch()} />
          </div>
        ) : !hasData ? (
          <div className="mt-6 max-w-2xl">
            <StoreLoading label="Loading the defect store from Azure Blob…" />
          </div>
        ) : isEmpty ? (
          <div className="mt-6">
            <StoreEmpty
              title="Nothing to analyse yet"
              blurb="The store is live but holds no tracker rows, so there is nothing to slice. Upload the tracker sheet and every panel here fills in."
            />
          </div>
        ) : (
          <>
            {/* One filter row, above everything it scopes. */}
            <div className="mt-8">
              <FilterBar
                filters={filters}
                onChange={setFilters}
                granularity={granularity}
                onGranularityChange={setGranularity}
                components={store.components.map((c) => ({ id: c.id, name: c.name }))}
                categories={categories}
                span={span}
                matched={rows.length}
                total={allRows.length}
              />
            </div>

            {/* Refetch holds the frame instead of flashing a skeleton. */}
            <div
              className="transition-opacity duration-200"
              style={{ opacity: isFetching ? 0.55 : 1 }}
            >
              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <StatTile
                  label="Rows in scope"
                  value={String(stats.total)}
                  hint={
                    stats.window.from === ""
                      ? "no dated rows"
                      : `${stats.window.from} → ${stats.window.to}`
                  }
                />
                <StatTile
                  label="Done"
                  value={pct(stats.done, stats.total)}
                  hint={`${stats.done} of ${stats.total} rows`}
                  tone="good"
                  share={{ part: stats.done, whole: stats.total }}
                />
                <StatTile
                  label="Still open"
                  value={String(stats.open)}
                  hint={stats.blocked > 0 ? `${stats.blocked} blocked` : "none blocked"}
                  tone={stats.blocked > 0 ? "critical" : "warning"}
                />
                {/*
                  Of the rows that were actually re-tested, how many came back
                  resolved. Rows nobody has re-tested carry no verdict, so they
                  sit in the hint rather than in the denominator.
                */}
                <StatTile
                  label="Retested & resolved"
                  value={pass.rate}
                  hint={
                    pass.retested === 0
                      ? "no row has been re-tested yet"
                      : `${pass.resolved} of ${pass.retested} retested rows passed${
                          pass.failed > 0 ? ` · ${pass.failed} failed` : ""
                        }${pass.notRetested > 0 ? ` · ${pass.notRetested} not retested` : ""}`
                  }
                  tone={pass.failed > 0 ? "warning" : "good"}
                  share={{ part: pass.resolved, whole: pass.retested }}
                />
                <StatTile
                  label="Median time to fix"
                  value={days(stats.medianResolution)}
                  hint={
                    stats.measured === 0
                      ? "no row carries both dates"
                      : `p90 ${days(stats.p90Resolution)} · ${stats.measured} measured`
                  }
                />
              </dl>

              <Tabs defaultValue="overview" className="mt-8">
                <TabsList className="h-auto flex-wrap justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="dates">Dates</TabsTrigger>
                  <TabsTrigger value="components">Components</TabsTrigger>
                  <TabsTrigger value="rows">Rows</TabsTrigger>
                </TabsList>

                {/* ---------------------------------------------------- overview */}
                <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
                  <Panel
                    title="Status split"
                    subtitle="Lifecycle status as the tracker records it."
                    table={<SliceTable data={byStatus} label={"Status"} />}
                  >
                    <Donut
                      data={byStatus}
                      colors={STATUS_COLOR}
                      centerValue={String(stats.total)}
                      centerLabel="rows in scope"
                    />
                  </Panel>

                  <Panel
                    title="Retest outcome"
                    subtitle="The ring is every row; the number is the pass rate over the rows that carry a verdict."
                    table={<SliceTable data={byRetest} label={"Retest"} />}
                  >
                    <Donut
                      data={byRetest}
                      colors={RETEST_COLOR}
                      centerValue={pass.rate}
                      centerLabel={
                        pass.retested === 0
                          ? "nothing re-tested"
                          : `of ${pass.retested} re-tested rows resolved`
                      }
                    />
                  </Panel>

                  <Panel
                    title="From raised to resolved"
                    subtitle="Each step is the one above it, less the rows named underneath."
                    table={
                      <SimpleTable
                        head={["Stage", "Rows", "% of raised"]}
                        rows={funnel.map((s) => [
                          s.name,
                          s.value,
                          pct(s.value, funnel[0]?.value ?? 0),
                        ])}
                      />
                    }
                  >
                    <StageFunnel stages={funnel} />
                  </Panel>

                  <Panel
                    className="lg:col-span-3"
                    title={`Raised per ${granularity}, and how much of it is done`}
                    subtitle={timelineSubtitle(granularity, cleared, points.length, truncated)}
                    legend={statusLegend}
                    table={
                      <SimpleTable
                        head={[granularity, "Raised", ...STATUS_ORDER, "Still open"]}
                        rows={points.map((p) => [
                          p.label,
                          p.raised,
                          ...STATUS_ORDER.map((st) => p.byStatus[st]),
                          p.byStatus.WIP + p.byStatus.Blocked,
                        ])}
                      />
                    }
                  >
                    <RaisedByStatus data={points} />
                  </Panel>

                  <Panel
                    className="lg:col-span-3"
                    title="Defects per component, by status"
                    subtitle="Sorted by row count. Click a component to filter the whole page to it."
                    legend={statusLegend}
                    table={
                      <SimpleTable
                        head={["Component", "Rows", "Open", "Resolved on retest"]}
                        rows={breakdown.map((c) => [
                          `${c.label} ${c.name}`,
                          c.total,
                          c.open,
                          c.resolved,
                        ])}
                      />
                    }
                  >
                    <ComponentStacks
                      data={breakdown}
                      onSelect={toggleComponent}
                      selected={filters.componentIds}
                    />
                  </Panel>

                  <Panel
                    className="lg:col-span-3"
                    title="Defects by category"
                    subtitle="What kind of failure it was. Click a bar to filter the page to that category."
                    table={<SliceTable data={byCategory} label={"Category"} />}
                  >
                    <RankedBars
                      data={byCategory}
                      onSelect={toggleCategory}
                      selected={filters.categories}
                      labelWidth={212}
                    />
                  </Panel>
                </TabsContent>

                {/* ------------------------------------------------------- dates */}
                <TabsContent value="dates" className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Panel
                    className="lg:col-span-2"
                    title={`Raised per ${granularity}, and how much of it is done`}
                    subtitle={timelineSubtitle(granularity, cleared, points.length, truncated)}
                    legend={statusLegend}
                    table={
                      <SimpleTable
                        head={[granularity, "Raised", ...STATUS_ORDER, "Still open"]}
                        rows={points.map((p) => [
                          p.label,
                          p.raised,
                          ...STATUS_ORDER.map((st) => p.byStatus[st]),
                          p.byStatus.WIP + p.byStatus.Blocked,
                        ])}
                      />
                    }
                  >
                    <RaisedByStatus data={points} />
                  </Panel>

                  <Panel
                    title="Which weekday defects land on"
                    subtitle="Testing rhythm, not defect severity. The week closes on itself, so the shape reads round rather than left-to-right."
                    table={<SliceTable data={byWeekday} label={"Weekday"} />}
                  >
                    <WeekdayRadar data={byWeekday} />
                  </Panel>

                  {carries.testedBy ? (
                    <Panel
                      title="Who found it"
                      subtitle="From the Tested By column."
                      table={<SliceTable data={byTester} label={"Tester"} />}
                    >
                      <RankedBars data={byTester} unitLabel="defects found" labelWidth={140} />
                    </Panel>
                  ) : null}

                  {missingColumns.length > 0 ? (
                    <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground lg:col-span-2">
                      No row in the store fills in{" "}
                      <span className="font-medium text-foreground">
                        {missingColumns.join(", ")}
                      </span>
                      , so the panels that read those columns are not shown. Add them to the tracker
                      sheet and upload it again to light them up.
                    </p>
                  ) : null}
                </TabsContent>

                {/* -------------------------------------------------- components */}
                <TabsContent value="components" className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Panel
                    className="lg:col-span-2"
                    title="Defects per component, by status"
                    subtitle="Sorted by row count. Click a component to filter the whole page to it."
                    legend={statusLegend}
                    table={
                      <SimpleTable
                        head={["Component", "Rows", ...STATUS_ORDER]}
                        rows={breakdown.map((c) => [
                          `${c.label} ${c.name}`,
                          c.total,
                          ...STATUS_ORDER.map((s) => c.byStatus[s]),
                        ])}
                      />
                    }
                  >
                    <ComponentStacks
                      data={breakdown}
                      onSelect={toggleComponent}
                      selected={filters.componentIds}
                    />
                  </Panel>

                  <Panel
                    className="lg:col-span-2"
                    title={`Component × ${matrixDimension}`}
                    subtitle="Every cell prints its count, so the shading is a second read rather than the only one."
                    legend={
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <SequentialScaleLegend max={matrix.max} />
                        <div className="flex gap-1">
                          {(["status", "retest"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setMatrixDimension(d)}
                              aria-pressed={matrixDimension === d}
                              className={
                                matrixDimension === d
                                  ? "rounded-lg border border-primary bg-primary px-2.5 py-1 text-xs font-medium capitalize text-primary-foreground"
                                  : "rounded-lg border border-border px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                              }
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    }
                  >
                    <Heatmap columns={matrix.columns} rows={matrix.rows} max={matrix.max} />
                  </Panel>

                  {carries.alsoTouches ? (
                    <Panel
                      className="lg:col-span-2"
                      title="Components a fix also touched"
                      subtitle="From the Also Touches column — where a defect's blast radius crossed a boundary."
                      table={<SliceTable data={alsoTouched} label={"Component"} />}
                    >
                      <RankedBars data={alsoTouched} labelWidth={212} />
                    </Panel>
                  ) : null}

                  <Panel
                    className="lg:col-span-2"
                    title="Per-component detail"
                    subtitle="Row count, what is still open and how the retest came back."
                  >
                    <SimpleTable
                      head={["Component", "Rows", "Open", "Resolved on retest", "Median fix"]}
                      rows={breakdown.map((c) => [
                        `${c.label} ${c.name}`,
                        c.total,
                        c.open,
                        c.resolved,
                        c.medianResolution === null ? "—" : `${c.medianResolution} d`,
                      ])}
                    />
                  </Panel>
                </TabsContent>

                {/* -------------------------------------------------------- rows */}
                <TabsContent value="rows" className="mt-4">
                  <Panel
                    title={`${rows.length} tracker rows in scope`}
                    subtitle="Sort by any column. Everything the charts above show is readable here."
                  >
                    <DefectTable rows={rows} />
                  </Panel>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </section>

      <footer className="mt-12 bg-ink py-10 text-ink-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8">
          <span className="font-display text-lg font-bold">
            healthplans<span className="text-accent">.ai</span>
          </span>
          <p className="text-sm text-ink-foreground/60">
            {stats.total} rows · {breakdown.filter((c) => c.id !== UNMAPPED_KEY).length} components
            · {stats.categories} categories
          </p>
        </div>
      </footer>
    </main>
  );
}

const pct = (part: number, whole: number): string =>
  whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
