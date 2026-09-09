import { Check, ChevronDown, RotateCcw, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Retest, Status } from "@/data/voiceAgent";
import {
  CONFIDENCE_ORDER,
  EMPTY_FILTERS,
  RETEST_ORDER,
  STATUS_ORDER,
  UNMAPPED_KEY,
  hasActiveFilters,
  type ConfidenceBucket,
  type Filters,
  type Granularity,
} from "@/lib/analytics";

/**
 * One filter row above everything it scopes — every panel on the page re-renders
 * against the same slice, so the numbers always agree.
 */

export type FilterBarProps = {
  filters: Filters;
  onChange: (next: Filters) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  components: { id: number; name: string }[];
  categories: string[];
  /** Full date span of the store, used by the "all time" preset. */
  span: { from: string; to: string };
  matched: number;
  total: number;
};

const PRESETS = [
  { label: "All", days: null },
  { label: "30 d", days: 30 },
  { label: "90 d", days: 90 },
  { label: "180 d", days: 180 },
] as const;

export function FilterBar({
  filters,
  onChange,
  granularity,
  onGranularityChange,
  components,
  categories,
  span,
  matched,
  total,
}: FilterBarProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  /**
   * Presets anchor on the store's newest row rather than today — the tracker is
   * a fixed test window, so "last 30 days" from today would come back empty.
   */
  const applyPreset = (days: number | null) => {
    if (days === null || span.to === "") {
      onChange({ ...filters, from: "", to: "" });
      return;
    }
    const to = span.to;
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    onChange({ ...filters, from: from < span.from ? "" : from, to: "" });
  };

  const activePreset = PRESETS.find((p) => {
    if (p.days === null) return filters.from === "" && filters.to === "";
    if (filters.to !== "" || filters.from === "" || span.to === "") return false;
    const expected = new Date(Date.parse(`${span.to}T00:00:00Z`) - (p.days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return filters.from === expected;
  });

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* Date range first — it is the control every reader reaches for. */}
        <Group label="Window">
          <div className="flex items-center gap-1">
            {PRESETS.map((p) => (
              <Chip
                key={p.label}
                active={activePreset?.label === p.label}
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <DateInput
              value={filters.from}
              min={span.from}
              max={span.to}
              onChange={(v) => set("from", v)}
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <DateInput
              value={filters.to}
              min={span.from}
              max={span.to}
              onChange={(v) => set("to", v)}
              aria-label="To date"
            />
          </div>
        </Group>

        <Group label="Bucket">
          <div className="flex items-center gap-1">
            {(["day", "week", "month"] as const).map((g) => (
              <Chip key={g} active={granularity === g} onClick={() => onGranularityChange(g)}>
                {g}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Status">
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_ORDER.map((s) => (
              <Chip
                key={s}
                active={filters.statuses.includes(s)}
                onClick={() => set("statuses", toggleIn<Status>(filters.statuses, s))}
              >
                {s}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Retest">
          <div className="flex flex-wrap items-center gap-1">
            {RETEST_ORDER.map((r) => (
              <Chip
                key={r}
                active={filters.retests.includes(r)}
                onClick={() => set("retests", toggleIn<Retest>(filters.retests, r))}
              >
                {r === "Tested but Not Resolved" ? "Not resolved" : r}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Mapping">
          <div className="flex flex-wrap items-center gap-1">
            {CONFIDENCE_ORDER.map((c) => (
              <Chip
                key={c}
                active={filters.confidences.includes(c)}
                onClick={() =>
                  set("confidences", toggleIn<ConfidenceBucket>(filters.confidences, c))
                }
              >
                {c}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Component">
          <MultiSelect
            placeholder="All components"
            options={components.map((c) => ({
              value: String(c.id),
              label: c.id === UNMAPPED_KEY ? "Unmapped" : `C${c.id} ${c.name}`,
            }))}
            selected={filters.componentIds.map(String)}
            onToggle={(value) => set("componentIds", toggleIn(filters.componentIds, Number(value)))}
            onClear={() => set("componentIds", [])}
          />
        </Group>

        <Group label="Category">
          <MultiSelect
            placeholder="All categories"
            options={categories.map((c) => ({ value: c, label: c }))}
            selected={filters.categories}
            onToggle={(value) => set("categories", toggleIn(filters.categories, value))}
            onClear={() => set("categories", [])}
          />
        </Group>

        <Group label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="title, code, tester…"
              aria-label="Search defects"
              className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-2.5 text-xs outline-none transition-colors focus:border-primary"
            />
          </div>
        </Group>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{matched}</span> of{" "}
          <span className="tabular-nums">{total}</span> tracker rows in scope
          {filters.from !== "" || filters.to !== "" ? (
            <>
              {" "}
              · {filters.from === "" ? span.from || "start" : filters.from} →{" "}
              {filters.to === "" ? span.to || "latest" : filters.to}
            </>
          ) : null}
        </p>
        {hasActiveFilters(filters) ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <RotateCcw className="size-3.5" />
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
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
      aria-pressed={active}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-xs font-medium capitalize transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function DateInput({
  value,
  min,
  max,
  onChange,
  ...rest
}: {
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
} & React.AriaAttributes) {
  return (
    <input
      type="date"
      value={value}
      min={min || undefined}
      max={max || undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-primary"
      {...rest}
    />
  );
}

function MultiSelect({
  placeholder,
  options,
  selected,
  onToggle,
  onClear,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? placeholder)
        : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 max-w-56 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
          selected.length > 0
            ? "border-primary text-primary"
            : "border-border text-muted-foreground hover:border-primary hover:text-primary",
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="max-h-72 overflow-y-auto">
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle(o.value)}
                aria-pressed={on}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {on ? <Check className="size-4 stroke-[3] text-primary" /> : null}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 ? (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              Clear selection
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
