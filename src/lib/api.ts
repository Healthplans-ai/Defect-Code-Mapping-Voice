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
 * Base URL of the defects API.
 *
 * `VITE_API_URL` is baked in at build time, so on Vercel it has to be set in
 * the project's environment variables before the build. In dev it falls back to
 * `npm run dev` in Backend/; in a production build with nothing configured it
 * stays empty on purpose, so {@link request} can say exactly what is missing
 * rather than quietly trying to reach the developer's own laptop.
 */
export const API_URL = (
  configuredApiUrl !== undefined && configuredApiUrl.length > 0
    ? configuredApiUrl
    : import.meta.env.DEV
      ? "http://localhost:8787"
      : ""
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

export type ImportOutcome = "new" | "updated" | "unchanged" | "invalid";

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
  if (API_URL === "") {
    throw new ApiError(
      "VITE_API_URL is not set in this deployment, so there is no defects API to call. Point it at the backend's public URL and redeploy.",
      0,
      "unconfigured",
    );
  }

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

/** Dry run: returns the report the commit would produce, writing nothing. */
export async function previewImport(file: File, sheetName?: string): Promise<ImportReport> {
  const form = new FormData();
  form.append("file", file);
  if (sheetName) form.append("sheetName", sheetName);
  const { report } = await request<{ report: ImportReport }>("/api/import/preview", {
    method: "POST",
    body: form,
  });
  return report;
}

export async function commitImport(
  file: File,
  sheetName?: string,
): Promise<{ report: ImportReport; store: StoreView }> {
  const form = new FormData();
  form.append("file", file);
  if (sheetName) form.append("sheetName", sheetName);
  return request<{ report: ImportReport; store: StoreView }>("/api/import/commit", {
    method: "POST",
    body: form,
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
