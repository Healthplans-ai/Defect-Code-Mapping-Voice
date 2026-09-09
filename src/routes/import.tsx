import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SiteHeader } from "@/components/SiteHeader";
import { cn } from "@/lib/utils";
import {
  clearStore,
  commitImport,
  fetchSchema,
  previewImport,
  templateUrl,
  type ImportItem,
  type ImportOutcome,
  type ImportReport,
} from "@/lib/api";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DEFECT_STORE_KEY, useDefectStore } from "@/hooks/useDefectStore";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Upload defect tracker — healthplans.ai" },
      {
        name: "description",
        content:
          "Upload the defect tracker as .xlsx. Existing rows are kept, changed statuses are updated and only genuinely new defects are added — or declare the sheet the whole tracker and the map ends up matching it exactly.",
      },
    ],
  }),
  component: ImportPage,
});

const OUTCOME_LABEL: Record<ImportOutcome, string> = {
  new: "New",
  updated: "Updated",
  unchanged: "Unchanged",
  invalid: "Skipped",
  removed: "Removed",
};

const OUTCOME_STYLE: Record<ImportOutcome, string> = {
  new: "bg-accent text-accent-foreground",
  updated: "bg-warn text-foreground",
  unchanged: "bg-muted text-muted-foreground",
  invalid: "bg-destructive text-destructive-foreground",
  removed: "bg-destructive text-destructive-foreground",
};

function ImportPage() {
  const queryClient = useQueryClient();
  const { store } = useDefectStore();
  const schema = useQuery({
    queryKey: ["defect-schema"],
    queryFn: fetchSchema,
    staleTime: 300_000,
  });

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<ImportOutcome | "all">("all");
  /**
   * Is this upload the whole tracker, or a slice of it?
   *
   * Off by default, because a partial upload must never delete anything. On, a
   * row the store holds and the sheet does not is treated as stale and dropped
   * — which is the only way the totals on the analysis page can ever equal the
   * spreadsheet's own after rows get renumbered or removed upstream.
   */
  const [pruneMissing, setPruneMissing] = useState(false);
  /** Danger-zone dialog, and the word that has to be typed into it. */
  const [clearOpen, setClearOpen] = useState(false);
  const [clearWord, setClearWord] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMutation({
    mutationFn: (f: File) => previewImport(f, { pruneMissing }),
    onSuccess: (r) => {
      setReport(r);
      setFilter(r.totals.new > 0 ? "new" : r.totals.updated > 0 ? "updated" : "all");
    },
    onError: (err: Error) => {
      setReport(null);
      toast.error(err.message);
    },
  });

  const commit = useMutation({
    mutationFn: (f: File) => commitImport(f, { pruneMissing }),
    onSuccess: ({ report: r, store: fresh }) => {
      queryClient.setQueryData(DEFECT_STORE_KEY, fresh);
      void queryClient.invalidateQueries({ queryKey: DEFECT_STORE_KEY });
      setReport(r);
      toast.success(
        `Saved to Azure Blob — ${r.totals.new} new, ${r.totals.updated} updated, ${r.totals.unchanged} unchanged.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const clear = useMutation({
    mutationFn: clearStore,
    onSuccess: ({ cleared, store: fresh }) => {
      queryClient.setQueryData(DEFECT_STORE_KEY, fresh);
      void queryClient.invalidateQueries({ queryKey: DEFECT_STORE_KEY });
      setClearOpen(false);
      setClearWord("");
      setReport(null);
      toast.success(
        cleared === 0
          ? "The tracker was already empty."
          : `Cleared ${cleared} row${cleared === 1 ? "" : "s"}. A snapshot was saved first.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const take = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      if (!/\.xlsx$/i.test(f.name)) {
        toast.error(
          `"${f.name}" is not an .xlsx file. Save the tracker as Excel Workbook (.xlsx).`,
        );
        return;
      }
      setFile(f);
      setReport(null);
      preview.mutate(f);
    },
    [preview],
  );

  const items = useMemo(() => {
    if (!report) return [];
    const order: ImportOutcome[] = ["invalid", "removed", "new", "updated", "unchanged"];
    return [...report.items]
      .filter((i) => filter === "all" || i.outcome === filter)
      .sort(
        (a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome) || a.sheetRow - b.sheetRow,
      )
      .slice(0, 400);
  }, [report, filter]);

  const busy = preview.isPending || commit.isPending;
  const canCommit =
    report !== null && !report.committed && report.totals.invalid < report.totals.sheetRows;

  return (
    <main className="min-h-screen">
      <SiteHeader active="import" />

      <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          Tracker import
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
          Upload the defect sheet
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Rows are matched on <span className="font-mono text-foreground">S: No.</span> (or{" "}
          <span className="font-mono text-foreground">Defect ID</span> when the sheet has one). Rows
          already in the store stay put, rows whose values moved are updated, and only genuinely new
          rows are added. Nothing is written until you press{" "}
          <span className="font-semibold text-foreground">Apply</span>.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            href={templateUrl(false)}
            className="rounded-full border border-border bg-card px-4 py-2 font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            Download current data as .xlsx
          </a>
          <a
            href={templateUrl(true)}
            className="rounded-full border border-border bg-card px-4 py-2 font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            Download empty template
          </a>
          <span className="rounded-full bg-muted px-4 py-2 text-muted-foreground">
            store: {store.summary.total} rows · {store.summary.unmapped} unmapped
          </span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "mt-8 rounded-3xl border-2 border-dashed p-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border bg-card",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => take(e.target.files?.[0])}
          />
          <p className="font-display text-lg font-semibold">
            {file ? file.name : "Drop the tracker .xlsx here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · ${busy ? "reading…" : "ready"}`
              : "or pick a file — the first sheet with a recognisable header row is used"}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2.5 font-display text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Choose file
            </button>
            {file && (
              <button
                type="button"
                disabled={busy}
                onClick={() => preview.mutate(file)}
                className="rounded-full border border-border px-5 py-2.5 font-display text-sm font-semibold disabled:opacity-60"
              >
                Re-check
              </button>
            )}
            {file && report && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setReport(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-full border border-border px-5 py-2.5 font-display text-sm font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/*
          The one decision the uploader has to make, put where the file is
          picked rather than buried next to the commit button — it changes what
          the preview below is a preview of.
        */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <input
            type="checkbox"
            checked={pruneMissing}
            disabled={busy}
            onChange={(e) => {
              setPruneMissing(e.target.checked);
              if (file) preview.mutate(file);
            }}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="text-sm">
            <span className="font-display font-semibold">This sheet is the whole tracker</span>
            <span className="mt-0.5 block text-muted-foreground">
              Rows the store holds and this sheet does not are dropped, so the map ends up with
              exactly the sheet's rows. Leave it off for a partial upload — then nothing is ever
              deleted. Either way the preview below lists every row before anything is saved.
            </span>
          </span>
        </label>

        {preview.isPending && (
          <p className="mt-6 text-sm text-muted-foreground">Reading the workbook…</p>
        )}

        {preview.error && (
          <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="font-display text-sm font-semibold text-destructive">
              That sheet could not be read
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{(preview.error as Error).message}</p>
          </div>
        )}

        {report && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Tile label="Rows in sheet" value={report.totals.sheetRows} />
              <Tile label="New" value={report.totals.new} tone="accent" />
              <Tile label="Updated" value={report.totals.updated} tone="warn" />
              <Tile label="Unchanged" value={report.totals.unchanged} />
              <Tile
                label="Skipped"
                value={report.totals.invalid}
                tone={report.totals.invalid ? "destructive" : undefined}
              />
              {pruneMissing ? (
                <Tile
                  label="Removed"
                  value={report.totals.removed}
                  tone={report.totals.removed ? "destructive" : undefined}
                />
              ) : null}
              <Tile label="Store after" value={report.totals.storeTotalAfter} tone="primary" />
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {report.totals.statusChanged} row
              {report.totals.statusChanged === 1 ? "" : "s"} changed status or retest.{" "}
              {pruneMissing ? (
                <>
                  {report.totals.removed} row
                  {report.totals.removed === 1 ? "" : "s"} already in the store are not in this
                  sheet and will be removed.
                </>
              ) : (
                <>
                  {report.totals.keptUntouched} row
                  {report.totals.keptUntouched === 1 ? "" : "s"} already in the store were not in
                  this sheet and are left untouched.
                </>
              )}
              {report.committed ? " Applied and saved to Azure Blob." : " Nothing saved yet."}
            </p>

            {report.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-2xl border border-warn/50 bg-warn/10 p-4 text-sm">
                {report.warnings.slice(0, 12).map((w) => (
                  <li key={w} className="text-foreground/80">
                    · {w}
                  </li>
                ))}
                {report.warnings.length > 12 && (
                  <li className="text-muted-foreground">…and {report.warnings.length - 12} more</li>
                )}
              </ul>
            )}

            {report.columns.unmapped.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Ignored columns: {report.columns.unmapped.join(", ")}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canCommit || busy || !file}
                onClick={() => file && commit.mutate(file)}
                className="rounded-full bg-accent px-6 py-3 font-display text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {commit.isPending
                  ? "Saving…"
                  : report.committed
                    ? "Applied ✓"
                    : `Apply — add ${report.totals.new}, update ${report.totals.updated}`}
              </button>
              {report.committed && report.sourceBlob && (
                <span className="text-xs text-muted-foreground">
                  archived at <span className="font-mono">{report.sourceBlob}</span>
                </span>
              )}
            </div>

            {/* Row-level detail */}
            <div className="mt-8 flex flex-wrap gap-2">
              {(["all", "new", "updated", "unchanged", "invalid", "removed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {f === "all" ? "All rows" : OUTCOME_LABEL[f]}
                  {f !== "all" ? ` (${report.totals[f]})` : ""}
                </button>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Defect</th>
                    <th className="px-4 py-3">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <ItemRow key={`${it.outcome}-${it.sheetRow}`} item={it} />
                  ))}
                </tbody>
              </table>
            </div>
            {report.items.length > items.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {items.length} of {report.items.length} rows.
              </p>
            )}
          </>
        )}

        {/* Column reference */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold">What the sheet needs</h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Headers are matched loosely — punctuation and case are ignored, so{" "}
            <span className="font-mono text-foreground">S: No.</span> and{" "}
            <span className="font-mono text-foreground">S No</span> both work. The amber rows are
            the columns to add so a defect can be tied to the code that owns it.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Column</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">What to put in it</th>
                </tr>
              </thead>
              <tbody>
                {(schema.data?.columns ?? []).map((c) => (
                  <tr
                    key={c.field}
                    className={cn(
                      "border-t border-border align-top",
                      c.isNew ? "bg-warn/10" : undefined,
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{c.header}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          c.required
                            ? "bg-destructive text-destructive-foreground"
                            : c.isNew
                              ? "bg-warn text-foreground"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.required ? "required" : c.isNew ? "add this" : "existing"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schema.isError && (
            <p className="mt-3 text-sm text-muted-foreground">
              Could not load the column reference: {(schema.error as Error).message}
            </p>
          )}
        </section>

        {/* Recent imports */}
        {store.imports.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-2xl font-bold">Recent imports</h2>
            <ul className="mt-4 space-y-2">
              {store.imports.slice(0, 10).map((imp) => (
                <li
                  key={imp.importId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(imp.uploadedAt).toLocaleString()}
                  </span>
                  <span className="font-semibold">{imp.fileName}</span>
                  <span className="text-muted-foreground">
                    +{imp.totals.new} new · {imp.totals.updated} updated · {imp.totals.unchanged}{" "}
                    unchanged → {imp.totals.storeTotalAfter} rows
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          Danger zone.
          Clearing rewrites one blob — the defect store — with an empty
          document, after the server snapshots it. No blob is deleted and
          nothing else in the container is touched, which is what the copy
          below promises and what the endpoint is written to guarantee.
        */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold">Danger zone</h2>
          <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="font-display text-sm font-semibold">Clear the tracker</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Removes all {store.summary.total} defect rows and the import history, leaving the
                  ten pipeline components. Every page then shows an empty map until the tracker is
                  uploaded again.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This rewrites one file —{" "}
                  <span className="font-mono text-xs text-foreground">
                    defects-mapping/defects.json
                  </span>{" "}
                  — with an empty tracker, and takes a snapshot of it first. It deletes nothing: the
                  archived .xlsx uploads, the import reports and the snapshots all stay, and no
                  other blob in the container is touched.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClearWord("");
                  setClearOpen(true);
                }}
                disabled={clear.isPending || store.summary.total === 0}
                className="shrink-0 rounded-full border border-destructive px-5 py-2.5 font-display text-sm font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-destructive"
              >
                {store.summary.total === 0 ? "Already empty" : "Clear tracker…"}
              </button>
            </div>
          </div>
        </section>

        <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all {store.summary.total} tracker rows?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Every defect row and the import history are removed. The ten pipeline components
                    stay, and a snapshot of the current tracker is saved first, so this is
                    recoverable from blob storage.
                  </p>
                  <p>
                    Nothing is deleted: only{" "}
                    <span className="font-mono text-xs">defects-mapping/defects.json</span> is
                    rewritten. The archived uploads and every other blob in the container are left
                    alone.
                  </p>
                  <p>
                    Type <span className="font-mono font-semibold text-foreground">CLEAR</span> to
                    confirm.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <input
              value={clearWord}
              onChange={(e) => setClearWord(e.target.value)}
              placeholder="CLEAR"
              autoComplete="off"
              spellCheck={false}
              aria-label="Type CLEAR to confirm"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-destructive"
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clear.isPending}>Cancel</AlertDialogCancel>
              {/*
                Not an AlertDialogAction: that closes the dialog on click, which
                would dismiss it before the request has come back and leave a
                failure with nowhere to show.
              */}
              <button
                type="button"
                disabled={clearWord !== "CLEAR" || clear.isPending}
                onClick={() => clear.mutate()}
                className="rounded-full bg-destructive px-5 py-2.5 font-display text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {clear.isPending ? "Clearing…" : "Clear the tracker"}
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </main>
  );
}

function ItemRow({ item }: { item: ImportItem }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {item.label || `row ${item.sheetRow}`}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            OUTCOME_STYLE[item.outcome],
          )}
        >
          {OUTCOME_LABEL[item.outcome]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="line-clamp-2">{item.title || item.reason}</span>
        {item.componentId !== null && (
          <span className="mt-1 block text-xs text-muted-foreground">C{item.componentId}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {item.outcome === "invalid" ? (
          item.reason
        ) : item.changes.length === 0 ? (
          item.outcome === "new" ? (
            "added"
          ) : (
            "—"
          )
        ) : (
          <ul className="space-y-0.5">
            {item.changes.slice(0, 5).map((c) => (
              <li key={c.field}>
                <span className="font-semibold text-foreground">{c.field}</span>: {short(c.from)} →{" "}
                {short(c.to)}
              </li>
            ))}
            {item.changes.length > 5 && <li>+{item.changes.length - 5} more</li>}
          </ul>
        )}
      </td>
    </tr>
  );
}

const short = (v: unknown) => {
  const s = v === null || v === undefined || v === "" ? "(blank)" : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent" | "warn" | "destructive" | "primary" | undefined;
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/50 bg-accent/10"
      : tone === "warn"
        ? "border-warn/50 bg-warn/10"
        : tone === "destructive"
          ? "border-destructive/40 bg-destructive/10"
          : tone === "primary"
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-card";

  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <p className="font-display text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
