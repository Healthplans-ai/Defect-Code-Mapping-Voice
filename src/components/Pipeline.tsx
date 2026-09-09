import { useEffect, useState } from "react";
import { DefectDialog } from "@/components/DefectDialog";
import { cn } from "@/lib/utils";
import type { ComponentView } from "@/lib/api";

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-accent transition-opacity",
            active ? "opacity-100" : "opacity-40",
          )}
          style={{
            height: "100%",
            animation: `wave ${0.9 + i * 0.12}s ease-in-out ${i * 0.08}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ComponentCard({
  c,
  index,
  selected,
  onSelect,
}: {
  c: ComponentView;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const dark = c.tier !== "services";
  const unmapped = c.id === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rise group relative flex h-full w-full flex-col rounded-2xl border p-5 text-left transition-all duration-300",
        "hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dark
          ? "border-primary-deep/40 bg-[image:var(--gradient-pipeline)] text-primary-foreground"
          : "border-border bg-card text-card-foreground",
        unmapped && "border-dashed border-warn bg-warn/5",
        selected && "ring-2 ring-accent",
      )}
      style={{
        animationDelay: `${index * 90}ms`,
        boxShadow: selected ? "var(--shadow-glow)" : "var(--shadow-card)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
            dark ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground",
            unmapped && "bg-warn text-foreground",
            selected && "pulse-node",
          )}
        >
          {unmapped ? "?" : c.id}
        </span>
        <h3 className="font-display text-lg font-semibold leading-tight">{c.name}</h3>
      </div>

      <p
        className={cn(
          "mt-3 text-sm leading-relaxed",
          dark ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {c.blurb}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 pt-1">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            c.defects.length === 0
              ? dark
                ? "bg-primary-foreground/10 text-primary-foreground/70"
                : "bg-muted text-muted-foreground"
              : unmapped
                ? "bg-warn text-foreground"
                : "bg-accent text-accent-foreground",
          )}
        >
          {c.defects.length === 0
            ? "no defects"
            : `${c.defects.length} defect${c.defects.length > 1 ? "s" : ""}`}
        </span>
        <span
          className={cn(
            "text-xs font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100",
            dark ? "text-accent" : "text-primary",
          )}
        >
          view →
        </span>
      </div>
    </button>
  );
}

function Connector({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flow-line rounded-full",
        vertical ? "mx-auto h-8 w-[3px] bg-border" : "h-[3px] w-full bg-border",
      )}
    />
  );
}

export function Pipeline({ components }: { components: ComponentView[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [flowStep, setFlowStep] = useState(0);

  // Rows are derived from tier, not from array position, so the extra
  // "Unmapped" bucket the API appends never shifts the layout.
  const intake = components.filter((c) => c.tier === "in");
  const core = components.find((c) => c.tier === "core") ?? null;
  const services = components.filter((c) => c.tier === "services");
  const steps = Math.max(components.length, 1);

  useEffect(() => {
    const t = setInterval(() => setFlowStep((s) => (s + 1) % steps), 900);
    return () => clearInterval(t);
  }, [steps]);

  const active = components.find((c) => c.id === selected) ?? null;

  return (
    <section id="pipeline" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            The flow
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            {steps} components, one call
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Audio in, six capture layers, one state machine, services, audio out. Click any
            component to see every defect that landed in it.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
          <Waveform active />
          <span className="text-xs font-medium text-muted-foreground">
            live pipeline · step {flowStep + 1}/{steps}
          </span>
        </div>
      </div>

      {/* Row 1: intake */}
      <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        {intake.map((c, i) => (
          <div key={c.id} className="contents">
            <ComponentCard
              c={c}
              index={i}
              selected={selected === c.id}
              onSelect={() => setSelected(c.id)}
            />
            {i < intake.length - 1 && (
              <div className="hidden w-10 items-center lg:flex">
                <Connector />
              </div>
            )}
          </div>
        ))}
      </div>

      {core && (
        <>
          <div className="my-4">
            <Connector vertical />
          </div>

          <button
            type="button"
            onClick={() => setSelected(core.id)}
            aria-pressed={selected === core.id}
            className={cn(
              "rise group w-full rounded-3xl border border-ink bg-ink p-6 text-left text-ink-foreground transition-all duration-300 hover:-translate-y-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-8",
              selected === core.id && "ring-2 ring-accent",
            )}
            style={{ animationDelay: "420ms", boxShadow: "var(--shadow-lift)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full bg-accent font-display text-base font-bold text-accent-foreground",
                  selected === core.id && "pulse-node",
                )}
              >
                {core.id}
              </span>
              <h3 className="font-display text-xl font-bold sm:text-2xl">{core.name}</h3>
              <span className="font-mono text-xs text-accent">
                orchestrator/conversation_flow.py · advance()
              </span>
              <span className="ml-auto rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                {core.defects.length} defects
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-foreground/75">{core.details[0]}</p>
            <p className="mt-2 text-sm leading-relaxed text-accent/90">
              {core.details.slice(1).join("  ·  ")}
            </p>
          </button>

          <div className="my-4">
            <Connector vertical />
          </div>
        </>
      )}

      {/* Row 2: services (plus the Unmapped bucket, when there is one) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {services.map((c, i) => (
          <ComponentCard
            key={c.id}
            c={c}
            index={i + intake.length + 1}
            selected={selected === c.id}
            onSelect={() => setSelected(c.id)}
          />
        ))}
      </div>

      <DefectDialog
        component={active}
        allComponents={components}
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </section>
  );
}
