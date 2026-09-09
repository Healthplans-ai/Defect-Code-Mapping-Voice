/**
 * The tracker's vocabulary, mirroring `Backend/src/types.ts`.
 *
 * These four-value unions are the contract, not data — the defect rows
 * themselves live only in blob storage and arrive through an import.
 */
export const STATUSES = ["Done", "WIP", "Blocked", "No defect"] as const;
export type Status = (typeof STATUSES)[number];

/** Retest verdict — tracked separately from status. */
export const RETESTS = [
  "Resolved",
  "Tested but Not Resolved",
  "No defect",
  "Not retested",
] as const;
export type Retest = (typeof RETESTS)[number];

const configuredApiUrl = (import.meta.env["VITE_API_URL"] as string | undefined)?.trim();

/**
 * Where a deployed build looks for the API when nothing overrides it.
 *
 * A plain string in a source file on purpose. It is not a secret — the value is
 * compiled into the client bundle, so the browser sees it either way — and a
 * literal here is the one place guaranteed to survive the build. Vercel's Vite
 * docs are explicit that reading a committed `.env` file "requires additional
 * configuration", so a `.env.production` is not something the platform picks up
 * on its own; depending on one is how this ended up unset in production twice.
 *
 * To point a deploy elsewhere, set `VITE_API_URL` in the host's environment
 * variables — that still wins. Change this constant to move the default.
 */
const DEPLOYED_API_URL = "https://defect-code-mapping-voice-backend-production.up.railway.app";

/**
 * Base URL of the defects API, resolved at build time in this order:
 *
 *   1. `VITE_API_URL` from the host's environment (Vercel project settings)
 *   2. `http://localhost:8787` during `vite dev`
 *   3. {@link DEPLOYED_API_URL} for any other build
 */
export const API_URL = (
  configuredApiUrl !== undefined && configuredApiUrl.length > 0
    ? configuredApiUrl
    : import.meta.env.DEV
      ? "http://localhost:8787"
      : DEPLOYED_API_URL
).replace(/\/+$/, "");

export type DefectRecord = {
  defectId: string;
  label: string;
  sNo: number | null;
  row: string;
  date: string;
  title: string;
  category: string;
  testType: string;
  testedBy: string;
  solvedOn: string;
  status: Status;
  rawStatus: string;
  testByTeamMembers: string;
  phase: string;
  notes: string;
  notesOnResolution: string;
  team: string;
  statusCategory: string;
  testedByCategory: string;
  defectCategory: string;
  componentId: number | null;
  alsoTouches: string;
  code: string;
  confidence: string;
  retest: Retest;
  batch: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  history: { field: string; from: unknown; to: unknown; at: string }[];
};

export type ComponentView = {
  id: number;
  name: string;
  tier: "in" | "core" | "services";
  blurb: string;
  details: string[];
  defects: DefectRecord[];
};

export type Summary = {
  total: number;
  done: number;
  wip: number;
  blocked: number;
  noDefect: number;
  resolved: number;
  notResolved: number;
  notRetested: number;
  mapped: number;
  unmapped: number;
  rows: string;
  window: { from: string; to: string };
  byCategory: Record<string, number>;
  byComponent: { id: number; name: string; count: number }[];
};

export type ImportOutcome = "new" | "updated" | "unchanged" | "invalid" | "removed";

export type ImportItem = {
  defectId: string;
  label: string;
  title: string;
  outcome: ImportOutcome;
  componentId: number | null;
  status: Status;
  retest: Retest;
  changes: { field: string; from: unknown; to: unknown }[];
  statusChanged: boolean;
  reason?: string;
  sheetRow: number;
};

export type ImportReport = {
  importId: string;
  fileName: string;
  sheetName: string;
  uploadedAt: string;
  committed: boolean;
  sourceBlob: string | null;
  columns: { mapped: Record<string, string>; unmapped: string[]; missingRecommended: string[] };
  totals: {
    sheetRows: number;
    new: number;
    updated: number;
    unchanged: number;
    invalid: number;
    statusChanged: number;
    keptUntouched: number;
    removed: number;
    storeTotalAfter: number;
  };
  items: ImportItem[];
  warnings: string[];
};

export type StoreView = {
  updatedAt: string;
  components: ComponentView[];
  summary: Summary;
  imports: (Omit<ImportReport, "items"> & { itemCount: number })[];
};

export type SchemaColumn = {
  field: string;
  header: string;
  required: boolean;
  isNew: boolean;
  help: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // No "unset" case to handle: API_URL always resolves to a real host, falling
  // back to DEPLOYED_API_URL rather than to the empty string.
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(
      import.meta.env.DEV
        ? `Cannot reach the defects API at ${API_URL}. Start it with \`npm run dev\` in Backend/.`
        : `Cannot reach the defects API at ${API_URL}. Check the service is up and that this origin is listed in its CORS_ORIGINS.`,
      0,
      "offline",
    );
  }

  const body = (await res.json().catch(() => null)) as
    (Record<string, unknown> & { error?: string; kind?: string }) | null;

  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status, body?.kind);
  }
  return body as T;
}

export const fetchStore = () => request<StoreView>("/api/store");

export const fetchSchema = () =>
  request<{ columns: SchemaColumn[]; statuses: Status[]; retests: Retest[] }>("/api/schema");

export type ImportOptions = {
  sheetName?: string;
  /**
   * The uploaded sheet is the complete tracker, so stored rows it does not
   * mention are stale and get dropped. Off by default — a partial upload must
   * never delete anything.
   */
  pruneMissing?: boolean;
};

const importForm = (file: File, options: ImportOptions): FormData => {
  const form = new FormData();
  form.append("file", file);
  if (options.sheetName) form.append("sheetName", options.sheetName);
  if (options.pruneMissing) form.append("pruneMissing", "true");
  return form;
};

/** Dry run: returns the report the commit would produce, writing nothing. */
export async function previewImport(
  file: File,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const { report } = await request<{ report: ImportReport }>("/api/import/preview", {
    method: "POST",
    body: importForm(file, options),
  });
  return report;
}

export async function commitImport(
  file: File,
  options: ImportOptions = {},
): Promise<{ report: ImportReport; store: StoreView }> {
  return request<{ report: ImportReport; store: StoreView }>("/api/import/commit", {
    method: "POST",
    body: importForm(file, options),
  });
}

export const patchDefect = (defectId: string, patch: Record<string, unknown>) =>
  request<{ defect: DefectRecord; changes: { field: string; from: unknown; to: unknown }[] }>(
    `/api/defects/${encodeURIComponent(defectId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );

export const templateUrl = (empty = false) =>
  `${API_URL}/api/template.xlsx${empty ? "?empty=1" : ""}`;
