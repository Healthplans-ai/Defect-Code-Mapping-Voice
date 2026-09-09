import { createFileRoute, Link } from "@tanstack/react-router";
import { Pipeline } from "@/components/Pipeline";
import { SiteHeader } from "@/components/SiteHeader";
import { useDefectStore } from "@/hooks/useDefectStore";
import { StoreEmpty, StoreError, StoreLoading } from "@/components/StoreState";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Agent Pipeline & Defects — healthplans.ai" },
      {
        name: "description",
        content:
          "Interactive map of the P3 voice agent: 10 pipeline components, animated end to end, with every tracked defect filed under the component that owns it.",
      },
      { property: "og:title", content: "Voice Agent Pipeline & Defects — healthplans.ai" },
      {
        property: "og:description",
        content:
          "Explore the voice agent pipeline and every tracker row, component by component, from the live defect store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),

  component: Index,
});

function Index() {
  const { store, hasData, isEmpty, isLoading, loadError, refetch } = useDefectStore();
  const { components, summary } = store;

  const stats = [
    { label: "Components", value: String(components.filter((c) => c.id !== 0).length) },
    { label: "Tracker rows", value: String(summary.total) },
    { label: "Done", value: String(summary.done) },
    { label: "In progress", value: String(summary.wip) },
    { label: "Unmapped", value: String(summary.unmapped) },
  ];

  const owning = components
    .filter((c) => c.defects.length > 0)
    .sort((a, b) => b.defects.length - a.defects.length);

  const lastImport = store.imports[0];

  return (
    <main className="min-h-screen">
      <SiteHeader active="map" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="drift-slow pointer-events-none absolute -right-40 -top-32 size-[34rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--gradient-pipeline)" }}
        />
        <div className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <p
            className="rise font-display text-xs font-semibold uppercase tracking-[0.3em] text-primary"
            style={{ animationDelay: "40ms" }}
          >
            P3 claim-status voice agent
          </p>
          <h1
            className="rise mt-4 max-w-4xl font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            How a phone call becomes a claim answer — and where it breaks.
          </h1>
          <p
            className="rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ animationDelay: "220ms" }}
          >
            Audio arrives on a Twilio media socket, passes six capture layers, meets one dialog
            state machine, fans out to services, and returns as synthesised speech. This map walks
            that flow and pins every tracked defect to the component that owns it.
          </p>

          {loadError ? (
            <div className="rise mt-8 max-w-2xl">
              <StoreError message={loadError.message} onRetry={() => void refetch()} />
            </div>
          ) : (
            <p
              className="rise mt-6 text-xs text-muted-foreground"
              style={{ animationDelay: "260ms" }}
            >
              {!hasData
                ? "Loading the live store from Azure Blob…"
                : isEmpty
                  ? "Live from Azure Blob · no tracker rows imported yet"
                  : `Live from Azure Blob · ${summary.rows} · updated ${fmtStamp(store.updatedAt)}`}
              {lastImport
                ? ` · last import ${lastImport.fileName} (+${lastImport.totals.new} new, ${lastImport.totals.updated} updated)`
                : ""}
            </p>
          )}

          <div className="rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: "320ms" }}>
            <a
              href="#pipeline"
              className="rounded-full bg-primary px-6 py-3 font-display text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              Walk the pipeline
            </a>
            <a
              href="#defects"
              className="rounded-full border border-border bg-card px-6 py-3 font-display text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              See the defect map
            </a>
            <Link
              to="/analysis"
              className="rounded-full border border-border bg-card px-6 py-3 font-display text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              Analyse the tracker
            </Link>
            <Link
              to="/import"
              className="rounded-full border border-border bg-card px-6 py-3 font-display text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              Upload a tracker sheet
            </Link>
          </div>

          <dl className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="rise rounded-2xl border border-border bg-card p-4"
                style={{ animationDelay: `${400 + i * 80}ms`, boxShadow: "var(--shadow-card)" }}
              >
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="mt-1 font-display text-3xl font-bold text-primary">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Pipeline components={components} />

      {/* Defect map */}
      <section id="defects" className="border-t border-border bg-card/50">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Defect tracker — {summary.rows}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Where the defects landed
          </h2>

          {!hasData && !loadError ? (
            <div className="mt-6 max-w-2xl">
              <StoreLoading />
            </div>
          ) : isEmpty ? (
            <div className="mt-6">
              <StoreEmpty />
            </div>
          ) : (
            <>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {summary.total} tracker rows mapped to the component whose code actually changed:{" "}
                {summary.done} done, {summary.wip} in progress, {summary.blocked} blocked and{" "}
                {summary.noDefect} closed as “no defect — working”. {summary.resolved} have been
                retested and resolved.
                {summary.unmapped > 0 ? (
                  <>
                    {" "}
                    <span className="font-semibold text-foreground">
                      {summary.unmapped} row{summary.unmapped === 1 ? "" : "s"} carry no component
                      yet
                    </span>{" "}
                    — open the Unmapped card to assign them.
                  </>
                ) : null}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {owning.map((c, i) => {
                  const max = owning[0]!.defects.length;
                  return (
                    <div
                      key={c.id}
                      className="rise rounded-2xl border border-border bg-card p-5"
                      style={{ animationDelay: `${i * 90}ms`, boxShadow: "var(--shadow-card)" }}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-display text-sm font-semibold">
                          {c.id === 0 ? "" : c.id} {c.name}
                        </span>
                        <span className="font-display text-2xl font-bold text-primary">
                          {c.defects.length}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-1000"
                          style={{ width: `${(c.defects.length / max) * 100}%` }}
                        />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {c.defects
                          .slice(0, 8)
                          .map((d) => d.label)
                          .join(" · ")}
                        {c.defects.length > 8 ? ` · +${c.defects.length - 8} more` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(summary.byCategory).map(([cat, n]) => (
                  <div
                    key={cat}
                    className="rounded-2xl border border-border bg-background p-4 text-center"
                  >
                    <p className="font-display text-3xl font-bold">{n}</p>
                    <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                      {cat}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="bg-ink py-10 text-ink-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8">
          <span className="font-display text-lg font-bold">
            healthplans<span className="text-accent">.ai</span>
          </span>
          <p className="text-sm text-ink-foreground/60">
            P3 voice agent — component pipeline & defect map
          </p>
        </div>
      </footer>
    </main>
  );
}

function fmtStamp(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
