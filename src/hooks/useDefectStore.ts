import { useQuery } from "@tanstack/react-query";
import { fetchStore, type ComponentView, type DefectRecord, type StoreView } from "@/lib/api";
import { components as staticComponents, type Defect } from "@/data/voiceAgent";

export const DEFECT_STORE_KEY = ["defect-store"] as const;

/**
 * Live defect store, backed by Azure Blob through the API.
 *
 * The bundled `src/data/voiceAgent.ts` map is used as placeholder data so the
 * page paints immediately and still renders something when the API is down —
 * `isFallback` says which one you are looking at.
 */
export function useDefectStore() {
  const query = useQuery({
    queryKey: DEFECT_STORE_KEY,
    queryFn: fetchStore,
    placeholderData: FALLBACK_STORE,
    staleTime: 15_000,
    retry: 1,
  });

  return {
    ...query,
    store: query.data ?? FALLBACK_STORE,
    isFallback: query.data === FALLBACK_STORE,
  };
}

// ---------------------------------------------------------------- fallback

const toRecord = (d: Defect, componentId: number): DefectRecord => {
  const sNo = Number(d.id.replace(/[^\d]/g, ""));
  return {
    defectId: String(sNo),
    label: d.id,
    sNo: Number.isFinite(sNo) ? sNo : null,
    row: d.row,
    date: d.date,
    title: d.title,
    category: d.category,
    testType: "",
    testedBy: "",
    solvedOn: "",
    status: d.status,
    rawStatus: d.status,
    testByTeamMembers: "",
    phase: "",
    notes: "",
    notesOnResolution: "",
    team: "",
    statusCategory: "",
    testedByCategory: "",
    defectCategory: "",
    componentId,
    alsoTouches: d.alsoTouches,
    code: d.code,
    confidence: d.confidence,
    retest: d.retest,
    batch: d.batch,
    createdAt: "",
    updatedAt: "",
    revision: 1,
    history: [],
  };
};

const FALLBACK_STORE: StoreView = (() => {
  const components: ComponentView[] = staticComponents.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    blurb: c.blurb,
    details: c.details,
    defects: c.defects.map((d) => toRecord(d, c.id)),
  }));

  const all = components.flatMap((c) => c.defects);
  const tally = <T extends string>(pick: (d: DefectRecord) => T) =>
    all.reduce<Record<string, number>>((acc, d) => {
      const k = pick(d);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

  const byStatus = tally((d) => d.status);
  const byRetest = tally((d) => d.retest);
  const dates = all
    .map((d) => d.date)
    .filter(Boolean)
    .sort();
  const sNos = all.map((d) => d.sNo).filter((n): n is number => n !== null);

  return {
    updatedAt: "",
    components,
    summary: {
      total: all.length,
      done: byStatus["Done"] ?? 0,
      wip: byStatus["WIP"] ?? 0,
      blocked: byStatus["Blocked"] ?? 0,
      noDefect: byStatus["No defect"] ?? 0,
      resolved: byRetest["Resolved"] ?? 0,
      notResolved: byRetest["Tested but Not Resolved"] ?? 0,
      notRetested: byRetest["Not retested"] ?? 0,
      mapped: all.length,
      unmapped: 0,
      rows: sNos.length ? `S.No ${Math.min(...sNos)}-${Math.max(...sNos)}` : "no rows",
      window: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" },
      byCategory: Object.fromEntries(
        Object.entries(tally((d) => d.category || "Uncategorised")).sort((a, b) => b[1] - a[1]),
      ),
      byComponent: components.map((c) => ({ id: c.id, name: c.name, count: c.defects.length })),
    },
    imports: [],
  };
})();
