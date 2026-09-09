import type { ComponentView, DefectRecord, Retest, Status } from "@/lib/api";

/**
 * Aggregation for the /analysis page.
 *
 * Everything here is a pure function over the rows the store already hands the
 * frontend, so the filter row can re-slice every chart without another request.
 * No React, no formatting decisions — those live in the components.
 */

export const STATUS_ORDER = ["Done", "WIP", "Blocked", "No defect"] as const satisfies Status[];
export const RETEST_ORDER = [
  "Resolved",
  "Tested but Not Resolved",
  "Not retested",
  "No defect",
] as const satisfies Retest[];

export const CONFIDENCE_ORDER = ["Verified", "Inferred", "Unmapped"] as const;
export type ConfidenceBucket = (typeof CONFIDENCE_ORDER)[number];

/** A defect with the derived fields every chart wants, computed once. */
export type Row = DefectRecord & {
  componentKey: number;
  componentName: string;
  componentLabel: string;
  confidenceBucket: ConfidenceBucket;
  /** Calendar days from `date` to `solvedOn`; null when either is missing. */
  resolutionDays: number | null;
  /** Distinct file paths mentioned in `code`, `:line` stripped. */
  files: string[];
  /** Component ids from `alsoTouches`, excluding the owning one. */
  alsoTouchesIds: number[];
  /** Fix batches, split out of the `V39;V45` form. */
  batches: string[];
  isOpen: boolean;
};

export type Filters = {
  from: string;
  to: string;
  componentIds: number[];
  statuses: Status[];
  retests: Retest[];
  categories: string[];
  confidences: ConfidenceBucket[];
  search: string;
};

export const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  componentIds: [],
  statuses: [],
  retests: [],
  categories: [],
  confidences: [],
  search: "",
};

export const hasActiveFilters = (f: Filters): boolean =>
  f.from !== "" ||
  f.to !== "" ||
  f.componentIds.length > 0 ||
  f.statuses.length > 0 ||
  f.retests.length > 0 ||
  f.categories.length > 0 ||
  f.confidences.length > 0 ||
  f.search.trim() !== "";

// ---------------------------------------------------------------- rows

/**
 * Paths look like `server/twilio_handler.py:2338`. The `code` column is prose
 * with paths embedded in it, so match on a known extension rather than trying
 * to guess where a sentence ends — `config.TRANSFER_RETRY_SECONDS` is not a file.
 */
const FILE_RE =
  /(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-]+\.(?:py|tsx?|jsx?|mjs|cjs|json|ya?ml|sql|sh|md|css|html)(?::\d+)?/g;

export function extractFiles(code: string): string[] {
  const out = new Set<string>();
  for (const match of code.matchAll(FILE_RE)) {
    const path = match[0].replace(/:\d+$/, "");
    if (path.length > 2) out.add(path);
  }
  return [...out];
}

const confidenceBucketOf = (raw: string): ConfidenceBucket => {
  const k = raw.toLowerCase();
  if (k.startsWith("verified")) return "Verified";
  if (k.startsWith("inferred")) return "Inferred";
  return "Unmapped";
};

const componentIdsIn = (list: string): number[] => {
  const out = new Set<number>();
  for (const part of list.split(";")) {
    const m = /^\s*c?\s*(\d{1,2})\b/i.exec(part);
    if (m) out.add(Number(m[1]));
  }
  return [...out];
};

const batchesIn = (raw: string): string[] =>
  raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "-");

export const UNMAPPED_KEY = 0;

/** Flatten the store's nested view into one array with derived fields attached. */
export function buildRows(components: ComponentView[]): Row[] {
  const names = new Map(components.map((c) => [c.id, c.name]));

  return components.flatMap((component) =>
    component.defects.map((d): Row => {
      const own = component.id;
      return {
        ...d,
        componentKey: own,
        componentName: component.name,
        componentLabel: own === UNMAPPED_KEY ? "Unmapped" : `C${own}`,
        confidenceBucket: confidenceBucketOf(d.confidence),
        resolutionDays: daysBetween(d.date, d.solvedOn),
        files: extractFiles(d.code),
        alsoTouchesIds: componentIdsIn(d.alsoTouches).filter((id) => id !== own && names.has(id)),
        batches: batchesIn(d.batch),
        isOpen: d.status === "WIP" || d.status === "Blocked",
      };
    }),
  );
}

export function applyFilters(rows: Row[], f: Filters): Row[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.from !== "" && (r.date === "" || r.date < f.from)) return false;
    if (f.to !== "" && (r.date === "" || r.date > f.to)) return false;
    if (f.componentIds.length > 0 && !f.componentIds.includes(r.componentKey)) return false;
    if (f.statuses.length > 0 && !f.statuses.includes(r.status)) return false;
    if (f.retests.length > 0 && !f.retests.includes(r.retest)) return false;
    if (f.categories.length > 0 && !f.categories.includes(r.category || "Uncategorised"))
      return false;
    if (f.confidences.length > 0 && !f.confidences.includes(r.confidenceBucket)) return false;
    if (needle !== "") {
      const haystack = `${r.label} ${r.defectId} ${r.title} ${r.code} ${r.notes} ${r.testedBy}`;
      if (!haystack.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- dates

/** Inclusive whole-day difference, or null when either end is missing/bogus. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  if (fromIso === "" || toIso === "") return null;
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86_400_000);
  return days < 0 ? null : days;
}

export type Granularity = "day" | "week" | "month";

const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Monday of the week the date falls in — ISO weeks, so charts line up with sprints. */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

export function bucketOf(iso: string, gran: Granularity): string {
  if (iso === "") return "";
  if (gran === "month") return iso.slice(0, 7);
  if (gran === "week") return weekStart(iso);
  return iso;
}

function nextBucket(key: string, gran: Granularity): string {
  if (gran === "month") {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return addDays(key, gran === "week" ? 7 : 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function bucketLabel(key: string, gran: Granularity): string {
  if (key === "") return "no date";
  if (gran === "month") {
    const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? key.slice(5, 7);
    return `${month} ${key.slice(0, 4)}`;
  }
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? key.slice(5, 7);
  const day = Number(key.slice(8, 10));
  return gran === "week" ? `${day} ${month}` : `${day} ${month}`;
}

/** Every bucket from first to last, gaps included — a timeline must not skip empty periods. */
function bucketRange(keys: string[], gran: Granularity): string[] {
  const present = keys.filter(Boolean).sort();
  const first = present[0];
  const last = present[present.length - 1];
  if (first === undefined || last === undefined) return [];

  const out: string[] = [];
  let cursor = first;
  for (let guard = 0; guard <= MAX_TIMELINE_BUCKETS && cursor <= last; guard++) {
    out.push(cursor);
    cursor = nextBucket(cursor, gran);
  }

  // Past the cap, keep the newest end — a truncated chart is only honest if the
  // caller says so, which is what the `truncated` flag on the result is for.
  return out.length > MAX_TIMELINE_BUCKETS ? out.slice(-MAX_TIMELINE_BUCKETS) : out;
}

/**
 * Ceiling on how many periods a timeline will draw. At day granularity this is
 * a bit over four years; at week or month it is unreachable in practice.
 */
export const MAX_TIMELINE_BUCKETS = 1500;

// ---------------------------------------------------------------- timeline

export type TimelinePoint = {
  key: string;
  label: string;
  reported: number;
  solved: number;
};

export type Timeline = {
  points: TimelinePoint[];
  /** True when the range was longer than {@link MAX_TIMELINE_BUCKETS} periods. */
  truncated: boolean;
};

/**
 * Rows per period by the date they were raised, alongside the count that were
 * marked solved in that same period. Same unit on both series, so one axis.
 */
export function timeline(rows: Row[], gran: Granularity): Timeline {
  const reported = new Map<string, number>();
  const solved = new Map<string, number>();

  for (const r of rows) {
    const raised = bucketOf(r.date, gran);
    if (raised !== "") reported.set(raised, (reported.get(raised) ?? 0) + 1);
    const fixed = bucketOf(r.solvedOn, gran);
    if (fixed !== "") solved.set(fixed, (solved.get(fixed) ?? 0) + 1);
  }

  const keys = bucketRange([...reported.keys(), ...solved.keys()], gran);
  return {
    truncated: keys.length >= MAX_TIMELINE_BUCKETS,
    points: keys.map((key) => ({
      key,
      label: bucketLabel(key, gran),
      reported: reported.get(key) ?? 0,
      solved: solved.get(key) ?? 0,
    })),
  };
}

/**
 * Does anything in this slice carry a `Solved on` date?
 *
 * When nothing does, the solved series is not "zero everywhere" — it is absent,
 * and the charts drop it rather than plot a flat line that looks like a finding.
 */
export const hasSolvedDates = (points: TimelinePoint[]): boolean =>
  points.some((p) => p.solved > 0);

export type BacklogPoint = TimelinePoint & {
  cumulativeReported: number;
  cumulativeSolved: number;
  open: number;
};

/** Running totals — the gap between the two lines is the open backlog. */
export function backlog(points: TimelinePoint[]): BacklogPoint[] {
  let reported = 0;
  let solved = 0;
  return points.map((p) => {
    reported += p.reported;
    solved += p.solved;
    return {
      ...p,
      cumulativeReported: reported,
      cumulativeSolved: solved,
      open: reported - solved,
    };
  });
}

// ---------------------------------------------------------------- tallies

export type Slice = { name: string; value: number };

export function tally(rows: Row[], pick: (r: Row) => string): Slice[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r);
    if (key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort(bySizeThenName);
}

/** Multi-valued fields (files, alsoTouches, batches) — one row can hit several keys. */
export function tallyMany(rows: Row[], pick: (r: Row) => string[]): Slice[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const key of new Set(pick(r))) {
      if (key === "") continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort(bySizeThenName);
}

const bySizeThenName = (a: Slice, b: Slice) => b.value - a.value || a.name.localeCompare(b.name);

/** Keep the head, fold the tail into one "Other" row so hues never get cycled. */
export function withOther(slices: Slice[], keep: number): Slice[] {
  if (slices.length <= keep) return slices;
  const head = slices.slice(0, keep);
  const rest = slices.slice(keep).reduce((sum, s) => sum + s.value, 0);
  return rest > 0 ? [...head, { name: `Other (${slices.length - keep})`, value: rest }] : head;
}

/** Counts in a fixed order, so a status split never reorders as the data moves. */
export function tallyOrdered<T extends string>(
  rows: Row[],
  order: readonly T[],
  pick: (r: Row) => T,
): { name: T; value: number }[] {
  const counts = new Map<T, number>(order.map((k) => [k, 0]));
  for (const r of rows) {
    const key = pick(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.map((name) => ({ name, value: counts.get(name) ?? 0 }));
}

// ---------------------------------------------------------------- components

export type ComponentBreakdown = {
  id: number;
  label: string;
  name: string;
  total: number;
  byStatus: Record<Status, number>;
  byRetest: Record<Retest, number>;
  open: number;
  resolved: number;
  verified: number;
  /** Median days to resolve for rows in this component that have both dates. */
  medianResolution: number | null;
};

/**
 * Grouped by owning component.
 *
 * Grouping is driven by the rows themselves, not by the catalog, so the totals
 * here always add up to `rows.length`. A row whose component is somehow not in
 * the catalog would otherwise vanish from this panel while still counting in
 * the KPI tiles — two numbers on one screen that disagree.
 */
export function componentBreakdown(rows: Row[], components: ComponentView[]): ComponentBreakdown[] {
  const buckets = new Map<number, Row[]>();
  for (const r of rows) {
    const list = buckets.get(r.componentKey);
    if (list) list.push(r);
    else buckets.set(r.componentKey, [r]);
  }

  const names = new Map(components.map((c) => [c.id, c.name]));

  return [...buckets]
    .map(([id, own]): ComponentBreakdown => ({
      id,
      label: id === UNMAPPED_KEY ? "Unmapped" : `C${id}`,
      name: names.get(id) ?? own[0]?.componentName ?? `Component ${id}`,
      total: own.length,
      byStatus: countInto(STATUS_ORDER, own, (r) => r.status),
      byRetest: countInto(RETEST_ORDER, own, (r) => r.retest),
      open: own.filter((r) => r.isOpen).length,
      resolved: own.filter((r) => r.retest === "Resolved").length,
      verified: own.filter((r) => r.confidenceBucket === "Verified").length,
      medianResolution: median(
        own.map((r) => r.resolutionDays).filter((n): n is number => n !== null),
      ),
    }))
    .sort((a, b) => b.total - a.total || a.id - b.id);
}

function countInto<T extends string>(
  order: readonly T[],
  rows: Row[],
  pick: (r: Row) => T,
): Record<T, number> {
  const out = Object.fromEntries(order.map((k) => [k, 0])) as Record<T, number>;
  for (const r of rows) out[pick(r)] = (out[pick(r)] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------- distributions

/**
 * Days-to-resolve, bucketed. Fixed edges rather than a computed histogram so the
 * bands mean the same thing whatever the filter says.
 */
export const RESOLUTION_BANDS = [
  { name: "same day", min: 0, max: 0 },
  { name: "1–2 d", min: 1, max: 2 },
  { name: "3–7 d", min: 3, max: 7 },
  { name: "8–14 d", min: 8, max: 14 },
  { name: "15–30 d", min: 15, max: 30 },
  { name: "30 d +", min: 31, max: Number.POSITIVE_INFINITY },
] as const;

export const AGE_BANDS = [
  { name: "0–7 d", min: 0, max: 7 },
  { name: "8–30 d", min: 8, max: 30 },
  { name: "31–90 d", min: 31, max: 90 },
  { name: "90 d +", min: 91, max: Number.POSITIVE_INFINITY },
] as const;

export function bandCounts(
  values: number[],
  bands: readonly { name: string; min: number; max: number }[],
): Slice[] {
  return bands.map((band) => ({
    name: band.name,
    value: values.filter((v) => v >= band.min && v <= band.max).length,
  }));
}

export function resolutionDistribution(rows: Row[]): Slice[] {
  return bandCounts(
    rows.map((r) => r.resolutionDays).filter((n): n is number => n !== null),
    RESOLUTION_BANDS,
  );
}

/** Age of everything still open, measured from the day it was raised. */
export function ageDistribution(rows: Row[], today: string): Slice[] {
  const ages = rows
    .filter((r) => r.isOpen)
    .map((r) => daysBetween(r.date, today))
    .filter((n): n is number => n !== null);
  return bandCounts(ages, AGE_BANDS);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  return lo === undefined || hi === undefined ? null : (lo + hi) / 2;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

// ---------------------------------------------------------------- matrix

export type Matrix = {
  columns: string[];
  rows: { label: string; name: string; cells: number[]; total: number }[];
  max: number;
};

/** Component × (status | retest) counts, for the heatmap. */
export function componentMatrix(
  breakdown: ComponentBreakdown[],
  dimension: "status" | "retest",
): Matrix {
  const columns: string[] = dimension === "status" ? [...STATUS_ORDER] : [...RETEST_ORDER];
  const rows = breakdown.map((c) => {
    const source: Record<string, number> = dimension === "status" ? c.byStatus : c.byRetest;
    const cells = columns.map((col) => source[col] ?? 0);
    return { label: c.label, name: c.name, cells, total: c.total };
  });
  const max = rows.reduce((m, r) => Math.max(m, ...r.cells), 0);
  return { columns, rows, max };
}

// ---------------------------------------------------------------- kpis

export type Kpis = {
  total: number;
  done: number;
  open: number;
  blocked: number;
  mapped: number;
  unmapped: number;
  verified: number;
  resolved: number;
  notResolved: number;
  notRetested: number;
  medianResolution: number | null;
  p90Resolution: number | null;
  measured: number;
  perWeek: number | null;
  window: { from: string; to: string; days: number | null };
  files: number;
  categories: number;
};

export function kpis(rows: Row[]): Kpis {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? "";
  const spanDays = daysBetween(from, to);
  const durations = rows.map((r) => r.resolutionDays).filter((n): n is number => n !== null);

  const files = new Set<string>();
  for (const r of rows) for (const f of r.files) files.add(f);

  return {
    total: rows.length,
    done: rows.filter((r) => r.status === "Done").length,
    open: rows.filter((r) => r.isOpen).length,
    blocked: rows.filter((r) => r.status === "Blocked").length,
    mapped: rows.filter((r) => r.componentKey !== UNMAPPED_KEY).length,
    unmapped: rows.filter((r) => r.componentKey === UNMAPPED_KEY).length,
    verified: rows.filter((r) => r.confidenceBucket === "Verified").length,
    resolved: rows.filter((r) => r.retest === "Resolved").length,
    notResolved: rows.filter((r) => r.retest === "Tested but Not Resolved").length,
    notRetested: rows.filter((r) => r.retest === "Not retested").length,
    medianResolution: median(durations),
    p90Resolution: percentile(durations, 90),
    measured: durations.length,
    perWeek:
      spanDays === null || rows.length === 0 ? null : rows.length / Math.max(1, (spanDays + 1) / 7),
    window: { from, to, days: spanDays },
    files: files.size,
    categories: new Set(rows.map((r) => r.category || "Uncategorised")).size,
  };
}

// ---------------------------------------------------------------- csv

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  // Prefix a quote on anything Excel would read as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const CSV_COLUMNS: { header: string; get: (r: Row) => unknown }[] = [
  { header: "Defect ID", get: (r) => r.defectId },
  { header: "Label", get: (r) => r.label },
  { header: "Date", get: (r) => r.date },
  { header: "Solved on", get: (r) => r.solvedOn },
  { header: "Days to resolve", get: (r) => r.resolutionDays ?? "" },
  { header: "Title", get: (r) => r.title },
  { header: "Category", get: (r) => r.category },
  {
    header: "Component",
    get: (r) => (r.componentKey === UNMAPPED_KEY ? "" : `C${r.componentKey}`),
  },
  { header: "Component name", get: (r) => r.componentName },
  { header: "Also touches", get: (r) => r.alsoTouches },
  { header: "Status", get: (r) => r.status },
  { header: "Retest", get: (r) => r.retest },
  { header: "Mapping confidence", get: (r) => r.confidence },
  { header: "Fix batch", get: (r) => r.batch },
  { header: "Tested by", get: (r) => r.testedBy },
  { header: "Team", get: (r) => r.team },
  { header: "Phase", get: (r) => r.phase },
  { header: "Code references", get: (r) => r.code },
  { header: "Files", get: (r) => r.files.join("; ") },
];

export function toCsv(rows: Row[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.get(r))).join(","));
  // Excel wants the BOM and CRLF endings to read the file back cleanly.
  const CRLF = "\r\n";
  const BOM = "\uFEFF";
  return BOM + lines.join(CRLF) + CRLF;
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);
