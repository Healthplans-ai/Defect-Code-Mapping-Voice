import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Status } from "@/data/voiceAgent";
import { STATUS_ORDER, UNMAPPED_KEY, type ComponentBreakdown, type Row } from "@/lib/analytics";
import { STATUS_COLOR } from "@/components/analysis/palette";
import { Empty } from "@/components/analysis/primitives";

/**
 * Per-component stacked bars, and the drill-down table the whole page filters
 * into. Both are hand-rolled: a 2px surface gap between stacked segments and a
 * sortable table are easier to get exactly right in HTML than in a chart lib.
 */

export function ComponentStacks({
  data,
  onSelect,
  selected,
}: {
  data: ComponentBreakdown[];
  onSelect?: (id: number) => void;
  selected?: number[];
}) {
  if (data.length === 0) return <Empty label="No component carries a row in this slice." />;

  const max = data.reduce((m, c) => Math.max(m, c.total), 0) || 1;

  return (
    <ul className="space-y-2.5">
      {data.map((c) => {
        const isSelected = selected?.includes(c.id) ?? false;
        const segments = STATUS_ORDER.filter((s) => c.byStatus[s] > 0);

        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs">
                <span
                  className={cn(
                    "font-mono",
                    isSelected ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>{" "}
                <span className={isSelected ? "font-semibold text-primary" : ""} title={c.name}>
                  {c.name}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums">
                <span className="font-semibold text-foreground">{c.total}</span>
                {c.open > 0 ? (
                  <span className="text-muted-foreground"> · {c.open} open</span>
                ) : null}
              </span>
            </div>
            <div
              className="mt-1 flex h-2.5 gap-0.5"
              style={{ width: `${Math.max(3, (c.total / max) * 100)}%` }}
            >
              {segments.map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "h-2.5",
                    i === segments.length - 1 && "rounded-r-[4px]",
                    i === 0 && "rounded-l-[1px]",
                  )}
                  style={{
                    flexGrow: c.byStatus[s],
                    flexBasis: 0,
                    background: STATUS_COLOR[s],
                  }}
                  title={`${c.label} · ${s}: ${c.byStatus[s]}`}
                />
              ))}
            </div>
          </>
        );

        return (
          <li key={`${c.id}-${c.name}`}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-pressed={isSelected}
                className="w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
              >
                {body}
              </button>
            ) : (
              <div className="px-1.5 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- table

type SortKey = "label" | "date" | "component" | "category" | "status" | "retest" | "days";

const COLUMNS: { key: SortKey; header: string; numeric?: boolean }[] = [
  { key: "label", header: "Row" },
  { key: "date", header: "Raised" },
  { key: "component", header: "Component" },
  { key: "category", header: "Category" },
  { key: "status", header: "Status" },
  { key: "retest", header: "Retest" },
  { key: "days", header: "Days", numeric: true },
];

const RENDER_CAP = 300;

/** The table-view twin for the whole page: every filtered row, nothing gated behind hover. */
export function DefectTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const value = (r: Row): string | number => {
      switch (sort.key) {
        case "label":
          return r.sNo ?? r.label;
        case "date":
          return r.date;
        case "component":
          return r.componentKey === UNMAPPED_KEY ? 99 : r.componentKey;
        case "category":
          return r.category;
        case "status":
          return STATUS_ORDER.indexOf(r.status);
        case "retest":
          return r.retest;
        case "days":
          return r.resolutionDays ?? Number.POSITIVE_INFINITY;
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, sort]);

  if (rows.length === 0) return <Empty label="No tracker row matches these filters." />;

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  return (
    <div>
      <div className="max-h-[36rem] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[52rem] text-xs">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={cn("px-3 py-2 font-medium", c.numeric ? "text-right" : "text-left")}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-primary",
                      sort.key === c.key ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.header}
                    {sort.key === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Defect</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, RENDER_CAP).map((r) => (
              <tr key={r.defectId} className="border-t border-border/70 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">
                  {r.label}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                  {r.date || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="font-mono text-muted-foreground">
                    {r.componentKey === UNMAPPED_KEY ? "—" : `C${r.componentKey}`}
                  </span>{" "}
                  {r.componentName}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.category || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusPill status={r.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.retest}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.resolutionDays ?? "—"}
                </td>
                <td className="max-w-md px-3 py-2">
                  <p className="line-clamp-2">{r.title}</p>
                  {r.files.length > 0 ? (
                    <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground">
                      {r.files.join(" · ")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > RENDER_CAP ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing the first {RENDER_CAP} of {sorted.length} rows — narrow the filters, or export the
          full slice as CSV.
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {status}
    </span>
  );
}
