import { useState } from "react";
import { DefectDialog } from "@/components/DefectDialog";
import { cn } from "@/lib/utils";
import type { ComponentView } from "@/lib/api";

/**
 * Defect load is a *magnitude*, so it wears steps of the one sequential hue,
 * light → dark, on the shared card surface. Every card prints its count as a
 * direct label, which is the relief the two lightest steps owe for sitting
 * under 3:1 against that surface — colour never carries the number alone.
 */
const LOAD_STEPS = [
  "var(--seq-350)",
  "var(--seq-450)",
  "var(--seq-550)",
  "var(--seq-700)",
] as const;

/** Which step a count lands on, as a share of the busiest component. */
function loadStep(count: number, max: number) {
  if (count === 0 || max === 0) return null;
  const i = Math.ceil((count / max) * LOAD_STEPS.length) - 1;
  return LOAD_STEPS[Math.min(LOAD_STEPS.length - 1, Math.max(0, i))]!;
}

/**
 * The head of a core `details` line — everything before the separator that
 * introduces the long tail. Turns "Phase guards (allowed fields, required
 * slots, locks, holds)" into "Phase guards", which is all a chip needs to say.
 */
function chipLabel(detail: string) {
  const head = detail.split(/\s[—·]\s|[:(]/)[0]!.trim();
  return head.length > 34 ? `${head.slice(0, 33).trimEnd()}…` : head;
}

function LoadMeter({ count, max, onInk = false }: { count: number; max: number; onInk?: boolean }) {
  const fill = onInk ? "var(--accent)" : loadStep(count, max);
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full",
        onInk ? "h-2 bg-ink-foreground/20" : "h-1.5 bg-muted",
      )}
      aria-hidden
    >
      {fill && (
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(6, (count / max) * 100)}%`, background: fill }}
        />
      )}
    </div>
  );
}

function BusiestPill({ onInk = false }: { onInk?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider",
        onInk ? "bg-accent text-accent-foreground" : "bg-ink text-ink-foreground",
      )}
    >
      busiest
    </span>
  );
}

function ComponentCard({
  c,
  index,
  max,
  hottest,
  selected,
  onSelect,
}: {
  c: ComponentView;
  index: number;
  max: number;
  hottest: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const n = c.defects.length;
  const unmapped = c.id === 0;
  const step = loadStep(n, max);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rise group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card pl-6 pr-5 pt-5 pb-5 text-left",
        "transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        unmapped ? "border-dashed border-warn" : "border-border",
        selected && "border-accent ring-2 ring-accent",
      )}
      style={{
        animationDelay: `${index * 70}ms`,
        boxShadow: selected ? "var(--shadow-glow)" : "var(--shadow-card)",
      }}
    >
      {/* Load rail — the same magnitude as the bar, read down the card edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: unmapped ? "var(--warn)" : (step ?? "var(--muted)") }}
      />

      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md font-display text-[11px] font-bold",
            unmapped ? "bg-warn text-foreground" : "bg-secondary text-secondary-foreground",
            selected && "bg-accent text-accent-foreground",
          )}
        >
          {unmapped ? "?" : c.id}
        </span>
        <h3 className="font-display text-[15px] font-semibold leading-snug">{c.name}</h3>
        <span
          aria-hidden
          className="ml-auto shrink-0 font-display text-sm text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        >
          →
        </span>
      </div>

      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{c.blurb}</p>

      {/* The headline metric, bottom-anchored so it lines up across the row. */}
      <div className="mt-auto pt-5">
        <div className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-display text-[2.5rem] font-extrabold leading-none tabular-nums",
                n === 0 ? "text-muted-foreground/35" : "text-foreground",
              )}
            >
              {n}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {n === 0 ? "clean" : `defect${n === 1 ? "" : "s"}`}
            </span>
          </div>
          {hottest && n > 0 && <BusiestPill />}
        </div>
        <div className="mt-2.5">
          <LoadMeter count={n} max={max} />
        </div>
      </div>
    </button>
  );
}

/** Horizontal step-to-step link, drawn only where the row stays a row. */
function Arrow() {
  return (
    <div aria-hidden className="hidden shrink-0 items-center justify-center lg:flex lg:w-7">
      <div className="flow-line h-[2px] w-full rounded-full bg-border" />
    </div>
  );
}

/** Vertical link into and out of the core card. */
function Drop() {
  return (
    <div aria-hidden className="flex justify-center py-3">
      <div className="flow-line-y h-8 w-[2px] rounded-full bg-border" />
    </div>
  );
}

export function Pipeline({ components }: { components: ComponentView[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  // Rows come from tier, not array position, so the extra "Unmapped" bucket
  // the API appends never shifts the layout.
  const intake = components.filter((c) => c.tier === "in");
  const core = components.find((c) => c.tier === "core") ?? null;
  const services = components.filter((c) => c.tier === "services" && c.id !== 0);
  const unmapped = components.find((c) => c.id === 0) ?? null;
  const mapped = components.filter((c) => c.id !== 0);

  // The scale every card is measured against: the busiest mapped component.
  // The unmapped bucket stays out of it — it is a triage queue, not a component.
  const max = Math.max(0, ...mapped.map((c) => c.defects.length));
  const hottestId = max > 0 ? (mapped.find((c) => c.defects.length === max)?.id ?? null) : null;
  const totalDefects = mapped.reduce((sum, c) => sum + c.defects.length, 0);

  const active = components.find((c) => c.id === selected) ?? null;
  const coreCount = core?.defects.length ?? 0;

  return (
    <section id="pipeline" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            The flow
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            {mapped.length} code components, {totalDefects} defects
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Every component of the voice agent, in call order. The bar and the number on each card
            are its defect count — click one to read them.
          </p>
        </div>

        {/* Legend for the magnitude encoding: light = few, dark = many. */}
        <div
          className="rounded-2xl border border-border bg-card px-5 py-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Defect load
          </p>
          <div className="mt-3 flex items-center gap-[2px]">
            <span
              className="h-3 w-7 rounded-l-full"
              style={{ background: "var(--muted)" }}
              aria-hidden
            />
            {LOAD_STEPS.map((step, i) => (
              <span
                key={step}
                aria-hidden
                className={cn("h-3 w-7", i === LOAD_STEPS.length - 1 && "rounded-r-full")}
                style={{ background: step }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>clean</span>
            <span>{max} defects</span>
          </div>
        </div>
      </div>

      {/* Intake: audio in, text out */}
      <div className="mt-10">
        <p className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Intake — audio to structured fields
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:items-stretch lg:gap-0">
          {intake.map((c, i) => (
            <div key={c.id} className="contents">
              <div className="min-w-0 lg:flex-1">
                <ComponentCard
                  c={c}
                  index={i}
                  max={max}
                  hottest={c.id === hottestId}
                  selected={selected === c.id}
                  onSelect={() => setSelected(c.id)}
                />
              </div>
              {i < intake.length - 1 && <Arrow />}
            </div>
          ))}
        </div>
      </div>

      {core && (
        <>
          <Drop />

          <button
            type="button"
            onClick={() => setSelected(core.id)}
            aria-pressed={selected === core.id}
            className={cn(
              "rise group relative w-full overflow-hidden rounded-3xl border border-ink bg-ink p-6 text-left text-ink-foreground",
              "transition-all duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-7",
              selected === core.id && "ring-2 ring-accent",
            )}
            style={{ animationDelay: "320ms", boxShadow: "var(--shadow-lift)" }}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-accent-foreground",
                  selected === core.id && "pulse-node",
                )}
              >
                {core.id}
              </span>
              <div>
                <h3 className="font-display text-xl font-bold sm:text-2xl">{core.name}</h3>
                <p className="font-mono text-[11px] text-accent">
                  orchestrator/conversation_flow.py · advance()
                </p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {core.id === hottestId && coreCount > 0 && <BusiestPill onInk />}
                <div className="text-right">
                  <p className="font-display text-5xl font-extrabold leading-none tabular-nums text-accent">
                    {coreCount}
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-ink-foreground/60">
                    defects
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <LoadMeter count={coreCount} max={max} onInk />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {core.details.map((d) => (
                <span
                  key={d}
                  className="rounded-md bg-ink-foreground/10 px-2.5 py-1 font-mono text-[11px] text-ink-foreground/80"
                >
                  {chipLabel(d)}
                </span>
              ))}
            </div>
          </button>

          <Drop />
        </>
      )}

      {/* Services the state machine calls out to */}
      <div>
        <p className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Services — data, speech and everything after the call
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {services.map((c, i) => (
            <ComponentCard
              key={c.id}
              c={c}
              index={i + intake.length + 1}
              max={max}
              hottest={c.id === hottestId}
              selected={selected === c.id}
              onSelect={() => setSelected(c.id)}
            />
          ))}
        </div>
      </div>

      {unmapped && unmapped.defects.length > 0 && (
        <div className="mt-4 sm:max-w-sm">
          <ComponentCard
            c={unmapped}
            index={intake.length + services.length + 1}
            max={max}
            hottest={false}
            selected={selected === 0}
            onSelect={() => setSelected(0)}
          />
        </div>
      )}

      <DefectDialog
        component={active}
        allComponents={components}
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </section>
  );
}
