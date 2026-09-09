import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDefectStore } from "@/hooks/useDefectStore";
import { BandChart, BacklogChart, ReportedVsSolved } from "@/components/analysis/TimeCharts";
import { ComponentStacks, DefectTable } from "@/components/analysis/Breakdowns";
import { FilterBar } from "@/components/analysis/FilterBar";
import {
  BarList,
  Heatmap,
  Legend,
  Panel,
  SequentialScaleLegend,
  SimpleTable,
  SplitBar,
  StatTile,
  SliceTable,
} from "@/components/analysis/primitives";
import {
  BACKLOG_SERIES,
  CONFIDENCE_COLOR,
  REPORTED_SERIES,
  RETEST_COLOR,
  STATUS_COLOR,
} from "@/components/analysis/palette";
import {
  ageDistribution,
  applyFilters,
  backlog,
  buildRows,
  componentBreakdown,
  componentMatrix,
  CONFIDENCE_ORDER,
  EMPTY_FILTERS,
  hasSolvedDates,
  kpis,
  MAX_TIMELINE_BUCKETS,
  RETEST_ORDER,
  resolutionDistribution,
  STATUS_ORDER,
  tally,
  tallyMany,
  tallyOrdered,
  timeline,
  toCsv,
  todayIso,
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
          "Cut the voice-agent defect tracker by date, component, category, status, retest verdict and the code each fix touched.",
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

const solvedSubtitle = (
  granularity: Granularity,
  withSolved: boolean,
  truncated: boolean,
): string => {
  const base = withSolved
    ? `Per ${granularity}. Both series count tracker rows, so they share one axis.`
    : `Per ${granularity}, on the date each row was raised. No row in this slice carries a Solved on date, so there is nothing to plot against it.`;
  return truncated
    ? `${base} The range is longer than ${MAX_TIMELINE_BUCKETS} ${granularity}s, so only the most recent are drawn — switch the bucket to week or month for the whole span.`
    : base;
};

function AnalysisPage() {
  const { store, isFallback, isFetching, error, refetch } = useDefectStore();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [granularity, setGranularity] = useState<Granularity>("day");
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
  const cumulative = useMemo(() => backlog(points), [points]);
  // Nothing in the sheet marks a fix date? Then there is no solved series to draw.
  const withSolved = hasSolvedDates(points);
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
  const byConfidence = useMemo(
    () => tallyOrdered(rows, CONFIDENCE_ORDER, (r) => r.confidenceBucket),
    [rows],
  );
  const byCategory = useMemo(() => tally(rows, (r) => r.category || "Uncategorised"), [rows]);
  const byWeekday = useMemo(() => {
    const counts = tally(rows, (r) => weekdayOf(r.date));
    return WEEKDAYS.map((d) => ({
      name: d,
      value: counts.find((c) => c.name === d)?.value ?? 0,
    })).filter((d, _i, list) => list.some((x) => x.value > 0));
  }, [rows]);

  const hotspots = useMemo(
    () =>
      withOther(
        tallyMany(rows, (r) => r.files),
        12,
      ),
    [rows],
  );
  const batches = useMemo(
    () =>
      withOther(
        tallyMany(rows, (r) => r.batches),
        10,
      ),
    [rows],
  );
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
  const byTeam = useMemo(() => tally(rows, (r) => r.team), [rows]);
  const byPhase = useMemo(() => tally(rows, (r) => r.phase), [rows]);

  const resolution = useMemo(() => resolutionDistribution(rows), [rows]);
  const ages = useMemo(() => ageDistribution(rows, todayIso()), [rows]);

  /**
   * Which optional tracker columns this data actually carries, measured over the
   * whole store rather than the current slice. A column nobody has filled in is
   * a gap in the sheet, not a finding — so its panel is left out entirely and
   * named once below instead of standing there as an empty card.
   */
  const carries = useMemo(
    () => ({
      testedBy: allRows.some((r) => r.testedBy !== ""),
      team: allRows.some((r) => r.team !== ""),
      phase: allRows.some((r) => r.phase !== ""),
      batches: allRows.some((r) => r.batches.length > 0),
      files: allRows.some((r) => r.files.length > 0),
      alsoTouches: allRows.some((r) => r.alsoTouchesIds.length > 0),
      solvedOn: allRows.some((r) => r.solvedOn !== ""),
    }),
    [allRows],
  );

  const missingColumns = (
    [
      ["Solved on", carries.solvedOn],
      ["Also Touches", carries.alsoTouches],
      ["Fix Batch", carries.batches],
      ["Tested By", carries.testedBy],
      ["Team", carries.team],
      ["Phase", carries.phase],
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
              component split, the code hotspots and the row table all move together.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="size-4" />
            Export slice as CSV
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="font-display text-sm font-semibold text-destructive">
              Analysing the bundled snapshot — the defect API is unreachable.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : null}

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
          style={{ opacity: isFallback && isFetching ? 0.55 : 1 }}
        >
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
            />
            <StatTile
              label="Still open"
              value={String(stats.open)}
              hint={stats.blocked > 0 ? `${stats.blocked} blocked` : "none blocked"}
              tone={stats.blocked > 0 ? "critical" : "warning"}
            />
            <StatTile
              label="Retested & resolved"
              value={pct(stats.resolved, stats.total)}
              hint={`${stats.notRetested} never retested`}
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
            <StatTile
              label="Code files touched"
              value={String(stats.files)}
              hint={`${stats.mapped} rows mapped · ${stats.unmapped} unmapped`}
            />
          </dl>

          <Tabs defaultValue="overview" className="mt-8">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="dates">Dates</TabsTrigger>
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="defects">Defects & code</TabsTrigger>
              <TabsTrigger value="rows">Rows</TabsTrigger>
            </TabsList>

            {/* ---------------------------------------------------- overview */}
            <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title={withSolved ? "Raised vs marked solved" : "Defects raised"}
                subtitle={solvedSubtitle(granularity, withSolved, truncated)}
                legend={withSolved ? <Legend items={REPORTED_SERIES.map(toLegend)} /> : undefined}
                table={
                  <SimpleTable
                    head={[granularity, "Raised", "Solved"]}
                    rows={points.map((p) => [p.label, p.reported, p.solved])}
                  />
                }
              >
                <ReportedVsSolved data={points} />
              </Panel>

              <Panel
                title="Status split"
                subtitle="Lifecycle status as the tracker records it."
                table={<SliceTable data={byStatus} label={"Status"} />}
              >
                <SplitBar data={byStatus} colors={STATUS_COLOR} />
              </Panel>

              <Panel
                className="lg:col-span-2"
                title="Defects per component"
                subtitle="Click a component to filter the whole page to it."
                legend={statusLegend}
                table={
                  <SimpleTable
                    head={["Component", "Rows", "Open", "Resolved", "Verified"]}
                    rows={breakdown.map((c) => [
                      `${c.label} ${c.name}`,
                      c.total,
                      c.open,
                      c.resolved,
                      c.verified,
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
                title="Retest verdict"
                subtitle="Tracked separately from status."
                table={<SliceTable data={byRetest} label={"Retest"} />}
              >
                <SplitBar data={byRetest} colors={RETEST_COLOR} />
              </Panel>

              <Panel
                className="lg:col-span-3"
                title="Defects by category"
                subtitle="What kind of failure it was. Click a bar to filter."
                table={<SliceTable data={byCategory} label={"Category"} />}
              >
                <BarList
                  data={byCategory}
                  total={stats.total}
                  onSelect={toggleCategory}
                  selected={filters.categories}
                />
              </Panel>
            </TabsContent>

            {/* ------------------------------------------------------- dates */}
            <TabsContent value="dates" className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel
                className="lg:col-span-2"
                title={withSolved ? "Raised vs marked solved" : "Defects raised"}
                subtitle={solvedSubtitle(granularity, withSolved, truncated)}
                legend={withSolved ? <Legend items={REPORTED_SERIES.map(toLegend)} /> : undefined}
                table={
                  <SimpleTable
                    head={[granularity, "Raised", "Solved"]}
                    rows={points.map((p) => [p.label, p.reported, p.solved])}
                  />
                }
              >
                <ReportedVsSolved data={points} />
              </Panel>

              <Panel
                className="lg:col-span-2"
                title="Backlog to date"
                subtitle={
                  withSolved
                    ? "Running totals. The shaded band is what was still open at the end of each period."
                    : "Running total of rows raised. With no Solved on dates in this slice the backlog and the raised total are the same line."
                }
                legend={withSolved ? <Legend items={BACKLOG_SERIES.map(toLegend)} /> : undefined}
                table={
                  <SimpleTable
                    head={[granularity, "Raised to date", "Solved to date", "Open"]}
                    rows={cumulative.map((p) => [
                      p.label,
                      p.cumulativeReported,
                      p.cumulativeSolved,
                      p.open,
                    ])}
                  />
                }
              >
                <BacklogChart data={cumulative} />
              </Panel>

              {carries.solvedOn ? (
                <Panel
                  title="Time from raised to solved"
                  subtitle={
                    stats.measured === 0
                      ? "Needs both a Date and a Solved on value — no row in this slice has both."
                      : `${stats.measured} rows carry both dates · median ${days(stats.medianResolution)}, p90 ${days(stats.p90Resolution)}.`
                  }
                  table={<SliceTable data={resolution} label={"Band"} />}
                >
                  <BandChart data={resolution} unitLabel="rows" />
                </Panel>
              ) : null}

              <Panel
                className={carries.solvedOn ? undefined : "lg:col-span-2"}
                title="Age of the open queue"
                subtitle={`How long the ${stats.open} WIP and blocked rows have been open, counted from today.`}
                table={<SliceTable data={ages} label={"Age"} />}
              >
                <BandChart data={ages} unitLabel="open rows" />
              </Panel>

              <Panel
                className="lg:col-span-2"
                title="Which weekday defects land on"
                subtitle="Testing rhythm, not defect severity — useful for spotting the days a UAT round ran."
                table={<SliceTable data={byWeekday} label={"Weekday"} />}
              >
                <BarList data={byWeekday} total={stats.total} />
              </Panel>
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
                  title="Components a fix also touched"
                  subtitle="From the Also Touches column — where a defect's blast radius crossed a boundary."
                  table={<SliceTable data={alsoTouched} label={"Component"} />}
                >
                  <BarList data={alsoTouched} total={stats.total} />
                </Panel>
              ) : null}

              <Panel
                className={carries.alsoTouches ? undefined : "lg:col-span-2"}
                title="Per-component detail"
                subtitle="Open count, retest verdict and how much of the mapping is code-verified."
              >
                <SimpleTable
                  head={["Component", "Rows", "Open", "Resolved", "Verified", "Median fix"]}
                  rows={breakdown.map((c) => [
                    `${c.label} ${c.name}`,
                    c.total,
                    c.open,
                    c.resolved,
                    c.verified,
                    c.medianResolution === null ? "—" : `${c.medianResolution} d`,
                  ])}
                />
              </Panel>
            </TabsContent>

            {/* ---------------------------------------------- defects & code */}
            <TabsContent value="defects" className="mt-4 grid gap-4 lg:grid-cols-2">
              {carries.files ? (
                <Panel
                  className="lg:col-span-2"
                  title="Code hotspots"
                  subtitle="Files named in the Code References column, counted by how many defects touched them."
                  table={<SliceTable data={hotspots} label={"File"} />}
                >
                  <BarList data={hotspots} total={stats.total} monoLabels />
                </Panel>
              ) : null}

              <Panel
                title="Mapping confidence"
                subtitle="Verified means the code carries the marker; inferred was read from the code plus the tracker note."
                table={<SliceTable data={byConfidence} label={"Confidence"} />}
              >
                <SplitBar data={byConfidence} colors={CONFIDENCE_COLOR} />
              </Panel>

              {carries.batches ? (
                <Panel
                  title="Fix batches"
                  subtitle="Which build carried the fix."
                  table={<SliceTable data={batches} label={"Batch"} />}
                >
                  <BarList data={batches} total={stats.total} monoLabels />
                </Panel>
              ) : null}

              {carries.testedBy ? (
                <Panel
                  title="Who found it"
                  subtitle="From the Tested By column."
                  table={<SliceTable data={byTester} label={"Tester"} />}
                >
                  <BarList data={byTester} total={stats.total} />
                </Panel>
              ) : null}

              {carries.team ? (
                <Panel
                  title="Team"
                  subtitle="From the Team column."
                  table={<SliceTable data={byTeam} label={"Team"} />}
                >
                  <BarList data={byTeam} total={stats.total} />
                </Panel>
              ) : null}

              {carries.phase ? (
                <Panel
                  className="lg:col-span-2"
                  title="Phase"
                  subtitle="From the Phase column."
                  table={<SliceTable data={byPhase} label={"Phase"} />}
                >
                  <BarList data={byPhase} total={stats.total} />
                </Panel>
              ) : null}

              {missingColumns.length > 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground lg:col-span-2">
                  No row in the store fills in{" "}
                  <span className="font-medium text-foreground">{missingColumns.join(", ")}</span>,
                  so the panels that read those columns are not shown. Add them to the tracker sheet
                  and upload it again to light them up.
                </p>
              ) : null}
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

const toLegend = (s: { name: string; color: string; mark: "rect" | "line" }) => ({
  name: s.name,
  color: s.color,
  mark: s.mark,
});

const pct = (part: number, whole: number): string =>
  whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
