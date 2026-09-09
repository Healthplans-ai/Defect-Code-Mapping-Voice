import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Upload } from "lucide-react";

/**
 * What a page shows when it has no rows to draw.
 *
 * There is no bundled snapshot to fall back on: blob storage is the only source
 * of defect data, so "the API is down" and "nothing has been uploaded yet" are
 * different situations and get different, actionable messages.
 */

export function StoreLoading({ label = "Loading the defect store…" }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function StoreError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6">
      <p className="flex items-center gap-2 font-display text-sm font-semibold text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        The defect store could not be read
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
      >
        Try again
      </button>
    </div>
  );
}

export function StoreEmpty({
  title = "No defects in the store yet",
  blurb = "The store is live but holds no tracker rows. Upload the tracker sheet and every row lands under the component whose code owns it.",
}: {
  title?: string;
  blurb?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <Upload className="mx-auto size-6 text-primary" aria-hidden />
      <h2 className="mt-3 font-display text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{blurb}</p>
      <Link
        to="/import"
        className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 font-display text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        Upload the tracker
      </Link>
    </div>
  );
}
