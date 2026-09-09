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
// The same status/retest colours the analysis page uses, so a "Done" here and a
// "Done" on a chart are the same green rather than two different ideas of it.
import { RETEST_COLOR, STATUS_COLOR } from "@/components/analysis/palette";

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

  /**
   * Retest read for the header.
   *
   * "Still to resolve" deliberately groups `Tested but Not Resolved` with
   * `Not retested`: a defect nobody has re-tested is not resolved either, so
   * counting only the explicit failures would flatter the number.
   */
  const resolvedCount = useMemo(
    () => filtered.filter((d) => d.retest === "Resolved").length,
    [filtered],
  );
  const openCount = useMemo(
    () =>
      filtered.filter((d) => d.retest === "Tested but Not Resolved" || d.retest === "Not retested")
        .length,
    [filtered],
  );

  /** Totals over the unfiltered set, so a chip never vanishes mid-filter. */
  const statusTotals = useMemo(() => {
    const base: Record<string, number> = {};
    for (const d of all) base[d.status] = (base[d.status] ?? 0) + 1;
    return base;
  }, [all]);

  const retestTotals = useMemo(() => {
    const base: Record<string, number> = {};
    for (const d of all) base[d.retest] = (base[d.retest] ?? 0) + 1;
    return base;
  }, [all]);

  const dirty =
    from !== "" || to !== "" || status !== "All" || retest !== "All" || category !== "All";

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
      {/*
        Flex column set inline on purpose: DialogContent ships `display: grid`,
        and a `flex` utility here is not guaranteed to win the cascade against
        it. Without a real flex column the header cannot stay put and the list
        cannot scroll — the overflow just clips every defect past the third.
      */}
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-hidden p-0"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {/* ---------------------------------------------------------- header */}
        <div className="shrink-0 bg-[image:var(--gradient-pipeline)] px-6 pb-5 pt-6 text-primary-foreground">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-foreground">
                {component.id === 0 ? "?" : component.id}
              </span>
              <div className="min-w-0 text-left">
                <DialogTitle className="font-display text-xl font-bold leading-tight">
                  {component.name}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-primary-foreground/75">
                  {component.blurb}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/*
            One bar instead of five tiles. The old header gave equal weight to
            "0 WIP" and "0 Blocked", so most of it was reporting the absence of
            things; this shows the shape of what is actually here.
          */}
          <div className="mt-5 flex items-end justify-between gap-4">
            <p className="font-display text-3xl font-bold leading-none">
              {filtered.length}
              <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">
                {filtered.length === 1 ? "defect" : "defects"}
                {filtered.length !== all.length ? ` of ${all.length}` : ""}
              </span>
            </p>
            {resolvedCount > 0 || openCount > 0 ? (
              <p className="text-xs text-primary-foreground/80">
                <span className="font-semibold text-primary-foreground">{resolvedCount}</span>{" "}
                retested &amp; resolved
                {openCount > 0 ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-primary-foreground">{openCount}</span> still
                    to resolve
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          {filtered.length > 0 ? (
            <>
              <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-primary-foreground/15">
                {STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                  <span
                    key={s}
                    title={`${s}: ${counts[s]}`}
                    style={{
                      flexGrow: counts[s] ?? 0,
                      flexBasis: 0,
                      background: STATUS_COLOR[s],
                    }}
                  />
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                  <li
                    key={s}
                    className="flex items-center gap-1.5 text-xs text-primary-foreground/80"
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: STATUS_COLOR[s] }}
                    />
                    {s}
                    <span className="font-semibold text-primary-foreground">{counts[s]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {/* --------------------------------------------------------- filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-primary"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Test category"
              className="h-8 max-w-52 rounded-lg border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-primary"
            >
              <option value="All">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <span className="mx-1 h-5 w-px bg-border" aria-hidden />

            <Chip active={status === "All"} onClick={() => setStatus("All")}>
              All
            </Chip>
            {STATUSES.filter((s) => (statusTotals[s] ?? 0) > 0).map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
              </Chip>
            ))}

            {/*
              Only worth offering when the rows disagree. With no retest verdict
              recorded at all, every option but one returns nothing.
            */}
            {hasRetestVerdicts ? (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Chip active={retest === "All"} onClick={() => setRetest("All")}>
                  Any retest
                </Chip>
                {RETESTS.filter((r) => (retestTotals[r] ?? 0) > 0).map((r) => (
                  <Chip key={r} active={retest === r} onClick={() => setRetest(r)}>
                    {r === "Tested but Not Resolved" ? "Not resolved" : r}
                  </Chip>
                ))}
              </>
            ) : null}

            {dirty ? (
              <button
                type="button"
                onClick={reset}
                className="ml-auto h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* ------------------------------------------------------------ list */}
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
                  className="rise overflow-hidden rounded-2xl border border-border bg-card"
                  style={{
                    animationDelay: `${Math.min(i, 10) * 40}ms`,
                    boxShadow: "var(--shadow-card)",
                    // A status stripe down the edge, so a long list can be
                    // scanned for the rows that still need work.
                    borderLeft: `4px solid ${STATUS_COLOR[d.status]}`,
                  }}
                >
                  <div className="p-4">
                    {/* Row 1: identity and state */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-medium text-primary-foreground">
                        {d.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmt(d.date)}</span>

                      <span className="mx-0.5 h-3 w-px bg-border" aria-hidden />

                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        <span
                          aria-hidden
                          className="size-2 rounded-full"
                          style={{ background: STATUS_COLOR[d.status] }}
                        />
                        {d.status}
                      </span>
                      {d.retest !== "Not retested" ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ background: RETEST_COLOR[d.retest] }}
                          />
                          {d.retest === "Tested but Not Resolved" ? "Not resolved" : d.retest}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setEditing(editing === d.defectId ? null : d.defectId)}
                        className="ml-auto rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {editing === d.defectId ? "close" : "edit mapping"}
                      </button>
                    </div>

                    <p className="mt-2.5 font-display text-base font-semibold leading-snug">
                      {d.title}
                    </p>

                    {/* Row 2: where it sits, as tags rather than a run-on line */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {d.category ? <Tag>{d.category}</Tag> : null}
                      {d.alsoTouches
                        ? d.alsoTouches
                            .split(";")
                            .map((c) => c.trim())
                            .filter(Boolean)
                            .map((c) => (
                              <Tag key={c} muted>
                                also {c}
                              </Tag>
                            ))
                        : null}
                      {d.phase ? <Tag muted>{d.phase}</Tag> : null}
                      {d.testType ? <Tag muted>{d.testType}</Tag> : null}
                      {d.batch && d.batch !== "-" ? <Tag mono>{d.batch}</Tag> : null}
                    </div>

                    {/* Row 3: the remaining columns, on a grid so labels line up */}
                    {d.testedBy || d.solvedOn ? (
                      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        {d.testedBy ? <Field label="Tested by">{d.testedBy}</Field> : null}
                        {d.solvedOn ? <Field label="Solved on">{fmt(d.solvedOn)}</Field> : null}
                      </dl>
                    ) : null}

                    {/*
                      Only shown when the row carries one. The tracker has no
                      Code References column, and a placeholder pointing at a
                      column that does not exist is worse than silence.
                    */}
                    {d.code ? (
                      <p className="mt-3 rounded-lg bg-ink px-3 py-2 font-mono text-xs leading-relaxed text-ink-foreground">
                        {d.code}
                      </p>
                    ) : null}

                    {d.notes || d.notesOnResolution ? (
                      <div className="mt-3 space-y-1.5 border-t border-border/70 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                        {d.notes ? (
                          <p>
                            <span className="font-semibold text-foreground">Remark </span>
                            {d.notes}
                          </p>
                        ) : null}
                        {d.notesOnResolution ? (
                          <p>
                            <span className="font-semibold text-foreground">Resolution </span>
                            {d.notesOnResolution}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {d.confidence || d.revision > 1 ? (
                      <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {[d.confidence || null, d.revision > 1 ? `rev ${d.revision}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}

                    {editing === d.defectId ? (
                      <MappingEditor
                        defect={d}
                        components={allComponents}
                        onDone={() => setEditing(null)}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A small neutral pill for the facts that only need to be legible, not loud. */
function Tag({
  children,
  muted,
  mono,
}: {
  children: React.ReactNode;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px]",
        mono && "font-mono",
        muted ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
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
