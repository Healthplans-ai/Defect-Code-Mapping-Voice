import { useQuery } from "@tanstack/react-query";

import { fetchStore, type StoreView } from "@/lib/api";

export const DEFECT_STORE_KEY = ["defect-store"] as const;

/**
 * An empty store, so a page can read `store.summary.total` while the request
 * is still in flight without null-checking every field.
 *
 * It is not a fallback dataset — there is none. Blob storage is the only source
 * of defect rows, so `hasData` says whether what you are reading came back from
 * the API, and pages render a loading, error or empty state when it did not.
 */
export const EMPTY_STORE: StoreView = {
  updatedAt: "",
  components: [],
  summary: {
    total: 0,
    done: 0,
    wip: 0,
    blocked: 0,
    noDefect: 0,
    resolved: 0,
    notResolved: 0,
    notRetested: 0,
    mapped: 0,
    unmapped: 0,
    rows: "no rows",
    window: { from: "", to: "" },
    byCategory: {},
    byComponent: [],
  },
  imports: [],
};

/** Live defect store, backed by Azure Blob through the API. */
export function useDefectStore() {
  const query = useQuery({
    queryKey: DEFECT_STORE_KEY,
    queryFn: fetchStore,
    staleTime: 15_000,
    retry: 1,
    // We talk to one known host, so leaving connectivity detection to decide
    // whether to try is no help — attempt it and report what happened.
    networkMode: "always",
  });

  /**
   * The failure to show the reader, whether or not react-query settled on it.
   *
   * When `onlineManager` believes there is no connection, a failed query parks
   * in `fetchStatus: "paused"` with `error` still null and the real cause in
   * `failureReason` — so branching on `error` alone leaves the page spinning
   * forever on exactly the failure the reader most needs to be told about.
   * Folding the paused case in means "unreachable" always surfaces.
   */
  const loadError: Error | null = query.error ?? (query.isPaused ? query.failureReason : null);

  return {
    ...query,
    store: query.data ?? EMPTY_STORE,
    loadError,
    /** The store came back from the API (it may still hold zero rows). */
    hasData: query.data !== undefined,
    /** The API answered and the store is genuinely empty — nothing imported yet. */
    isEmpty: query.data !== undefined && query.data.summary.total === 0,
  };
}
