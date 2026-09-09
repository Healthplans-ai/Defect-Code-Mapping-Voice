import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RETESTS, STATUSES, type Retest, type Status } from "@/lib/api";
import { patchDefect, type ComponentView, type DefectRecord } from "@/lib/api";
import { DEFECT_STORE_KEY } from "@/hooks/useDefectStore";

const statusStyles: Record<Status, string> = {
  Done: "bg-accent/25 text-accent-foreground border-accent/50",
  WIP: "bg-warn/20 text-foreground border-warn/50",
  Blocked: "bg-destructive/15 text-destructive border-destructive/40",
  "No defect": "bg-muted text-muted-foreground border-border",
};

const retestStyles: Record<Retest, string> = {
  Resolved: "bg-accent text-accent-foreground",
  "Tested but Not Resolved": "bg-destructive text-destructive-foreground",
  "No defect": "bg-muted text-muted-foreground",
  "Not retested": "bg-secondary text-secondary-foreground",
};

function fmt(d: string) {
  if (!d) return "no date";
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function DefectDialog({
  component,
  allComponents,
  open,
  onOpenChange,
}: {
  component: ComponentView | null;
  allComponents: ComponentView[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<Status | "All">("All");
  const [retest, setRetest] = useState<Retest | "All">("All");
  const [category, setCategory] = useState<string>("All");
  const [editing, setEditing] = useState<string | null>(null);

  const all = useMemo(() => component?.defects ?? [], [component]);

  const categories = useMemo(
    () => Array.from(new Set(all.map((d) => d.category).filter(Boolean))).sort(),
    [all],
  );

  /** Does any row here carry an actual retest verdict, or is it all the default? */
  const hasRetestVerdicts = useMemo(() => all.some((d) => d.retest !== "Not retested"), [all]);

  const filtered = useMemo(
    () =>
      all.filter(
        (d) =>
          (!from || (d.date && d.date >= from)) &&
          (!to || (d.date && d.date <= to)) &&
          (status === "All" || d.status === status) &&
          (retest === "All" || d.retest === retest) &&
          (category === "All" || d.category === category),
      ),
    [all, from, to, status, retest, category],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { Done: 0, WIP: 0, Blocked: 0, "No defect": 0 };
    for (const d of filtered) base[d.status] = (base[d.status] ?? 0) + 1;
    return base;
  }, [filtered]);

  const reset = () => {
    setFrom("");
    setTo("");
    setStatus("All");
    setRetest("All");
    setCategory("All");
    setEditing(null);
  };

  if (!component) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <div className="bg-[image:var(--gradient-pipeline)] p-6 text-primary-foreground">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent font-display text-base font-bold text-accent-foreground">
                {component.id === 0 ? "?" : component.id}
              </span>
              <div className="text-left">
                <DialogTitle className="font-display text-2xl font-bold">
                  {component.name}
                </DialogTitle>
                <DialogDescription className="text-primary-foreground/80">
                  {component.blurb}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Total" value={filtered.length} highlight />
            {STATUSES.map((s) => (
              <Stat key={s} label={s} value={counts[s] ?? 0} />
            ))}
          </div>
        </div>

        <div className="space-y-4 p-6">
          {/* Filters */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                From date
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                To date
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Test category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="All">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip active={status === "All"} onClick={() => setStatus("All")}>
                All statuses
              </Chip>
              {STATUSES.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                  {s}
                </Chip>
              ))}
            </div>
            {/*
              Only worth offering when the rows disagree. With no Retest column
              in the sheet every row is "Not retested", and a filter whose every
              option but one returns nothing is just a dead control.
            */}
            {hasRetestVerdicts && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip active={retest === "All"} onClick={() => setRetest("All")}>
                  Any retest
                </Chip>
                {RETESTS.map((r) => (
                  <Chip key={r} active={retest === r} onClick={() => setRetest(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="font-display text-lg font-semibold">
                {all.length === 0 ? "No defects filed here" : "No defects match these filters"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {all.length === 0
                  ? "No tracker rows landed in this component."
                  : "Try widening the date range or clearing the filters."}
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {filtered.map((d, i) => (
                <li
                  key={d.defectId}
                  className="rise rounded-2xl border border-border bg-card p-4"
                  style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-medium text-primary-foreground">
                      {d.label}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {fmt(d.date)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        statusStyles[d.status],
                      )}
                    >
                      {d.status}
                      {d.rawStatus && d.rawStatus !== d.status ? ` (“${d.rawStatus}”)` : ""}
                    </span>
                    {/*
                      "Not retested" is the absence of a verdict, not a verdict.
                      A tracker with no Retest column would otherwise stamp it on
                      every single row, which reads as a finding.
                    */}
                    {d.retest !== "Not retested" && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          retestStyles[d.retest],
                        )}
                      >
                        {d.retest}
                      </span>
                    )}
                    {d.phase && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {d.phase}
                      </span>
                    )}
                    {d.batch && d.batch !== "-" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {d.batch}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(editing === d.defectId ? null : d.defectId)}
                      className="ml-auto rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {editing === d.defectId ? "close" : "edit mapping"}
                    </button>
                  </div>

                  <p className="mt-2 font-display text-base font-semibold leading-snug">
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      d.category || "uncategorised",
                      d.alsoTouches ? `also touches ${d.alsoTouches}` : null,
                      d.testType || null,
                      d.testedBy ? `tested by ${d.testedBy}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {/*
                    Only shown when the row carries one. The tracker has no Code
                    References column, and a placeholder telling the reader to
                    fill in a column that does not exist is worse than silence.
                  */}
                  {d.code && (
                    <p className="mt-3 rounded-lg bg-ink px-3 py-2 font-mono text-xs leading-relaxed text-ink-foreground">
                      {d.code}
                    </p>
                  )}

                  {/* Every remaining column, labelled as the sheet labels it. */}
                  {(d.solvedOn || d.testByTeamMembers || d.notes || d.notesOnResolution) && (
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {d.solvedOn && (
                        <div>
                          <dt className="inline font-semibold">Solved on: </dt>
                          <dd className="inline">{fmt(d.solvedOn)}</dd>
                        </div>
                      )}
                      {d.testByTeamMembers && (
                        <div>
                          <dt className="inline font-semibold">Test by team members: </dt>
                          <dd className="inline">{d.testByTeamMembers}</dd>
                        </div>
                      )}
                      {d.notes && (
                        <div>
                          <dt className="inline font-semibold">Remark: </dt>
                          <dd className="inline">{d.notes}</dd>
                        </div>
                      )}
                      {d.notesOnResolution && (
                        <div>
                          <dt className="inline font-semibold">Resolution: </dt>
                          <dd className="inline">{d.notesOnResolution}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {(d.confidence || d.revision > 1) && (
                    <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {[d.confidence || null, d.revision > 1 ? `rev ${d.revision}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  {editing === d.defectId && (
                    <MappingEditor
                      defect={d}
                      components={allComponents}
                      onDone={() => setEditing(null)}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Inline curation for one row — the same fields the Excel mapping columns set. */
function MappingEditor({
  defect,
  components,
  onDone,
}: {
  defect: DefectRecord;
  components: ComponentView[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [componentId, setComponentId] = useState(String(defect.componentId ?? ""));
  const [code, setCode] = useState(defect.code);
  const [confidence, setConfidence] = useState(defect.confidence);
  const [retestValue, setRetestValue] = useState<Retest>(defect.retest);
  const [batch, setBatch] = useState(defect.batch);

  const save = useMutation({
    mutationFn: () =>
      patchDefect(defect.defectId, {
        componentId: componentId === "" ? null : Number(componentId),
        code,
        confidence,
        retest: retestValue,
        batch,
      }),
    onSuccess: ({ changes }) => {
      void queryClient.invalidateQueries({ queryKey: DEFECT_STORE_KEY });
      toast.success(
        changes.length === 0
          ? `${defect.label} — nothing changed`
          : `${defect.label} updated (${changes.map((c) => c.field).join(", ")})`,
      );
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const assignable = components.filter((c) => c.id !== 0);

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-primary/30 bg-muted/40 p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Owning component
        <select
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">Unmapped</option>
          {assignable.map((c) => (
            <option key={c.id} value={c.id}>
              C{c.id} {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Retest
        <select
          value={retestValue}
          onChange={(e) => setRetestValue(e.target.value as Retest)}
          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        >
          {RETESTS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
        Code references
        <textarea
          value={code}
          rows={2}
          onChange={(e) => setCode(e.target.value)}
          placeholder="server/twilio_handler.py:2338; server/config.py:544"
          className="rounded-lg border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Mapping confidence
        <input
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          placeholder="Verified / Inferred"
          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Fix batch
        <input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="V39;V45"
          className="rounded-lg border border-input bg-background px-2 py-1.5 font-mono text-sm text-foreground"
        />
      </label>

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save to blob"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2",
        highlight ? "bg-accent text-accent-foreground" : "bg-primary-foreground/10",
      )}
    >
      <p className="font-display text-2xl font-bold leading-none">{value}</p>
      <p
        className={cn(
          "mt-1 text-[11px] uppercase tracking-wider",
          highlight ? "text-accent-foreground/80" : "text-primary-foreground/70",
        )}
      >
        {label}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
