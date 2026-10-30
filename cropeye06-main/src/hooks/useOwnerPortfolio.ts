import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getTotalCounts, loadOwnerFieldOfficers, UNASSIGNED_TEAM_ID } from "../api";
import { readOwnerCounts, type OwnerBackendCounts } from "../utils/ownerCounts";
import { getCache, removeCache, setCache } from "../utils/cache";
import { getEventsBaseUrl } from "../utils/serviceUrls";
import { getStoredUserIndustry } from "../utils/userIndustry";
import { extractAgroStatsPlotRow } from "../utils/grapesEventsBundle";
import { harvestInfoFromAgroStatsBatch } from "../utils/harvestStatusService";
import {
  buildOwnerFarmerRecords,
  buildOwnerPlotRecords,
  normalizeGrapesStatus,
  readAgroMetrics,
  UNASSIGNED_MANAGER,
  type OwnerFarmerRecord,
  type OwnerPlotRecord,
} from "../utils/ownerPortfolio";

const HIERARCHY_CACHE_KEY = "ownerPortfolio_hierarchy_v3";

type Hierarchy = Awaited<ReturnType<typeof loadOwnerFieldOfficers>>;

export type AgroStatsState = "idle" | "loading" | "ready" | "unavailable";

/** One manager-led unit under the owner's industry, with team counts from the hierarchy. */
export type OwnerUnit = {
  key: string;
  name: string;
  phone: string;
  location: string;
  fieldOfficers: number;
  farmers: number;
};

function farmerKey(farmer: any): string | null {
  const id = farmer?.id ?? farmer?.farmer_id ?? farmer?.username ?? farmer?.phone_number;
  if (id == null || String(id) === `${UNASSIGNED_TEAM_ID}-farmer`) return null;
  return String(id);
}

function buildUnits(managers: any[], fieldOfficers: any[]): OwnerUnit[] {
  return managers
    .filter((m) => m?.id != null && m.id !== UNASSIGNED_TEAM_ID)
    .map((m) => {
      const key = String(m.id);
      const officers = fieldOfficers.filter(
        (fo) => String(fo?.manager_id ?? fo?.manager?.id ?? "") === key,
      );
      const farmers = new Set<string>();
      officers.forEach((fo) =>
        (Array.isArray(fo?.farmers) ? fo.farmers : []).forEach((f: any) => {
          const id = farmerKey(f);
          if (id) farmers.add(id);
        }),
      );
      const name = `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim() || m?.username || `Manager ${key}`;
      return {
        key,
        name,
        phone: String(m?.phone_number ?? m?.phone ?? "").trim(),
        location: [m?.village, m?.taluka, m?.district].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).join(", "),
        fieldOfficers: officers.length,
        farmers: farmers.size,
      };
    });
}

export type OwnerPortfolioState = {
  plots: OwnerPlotRecord[];
  farmers: OwnerFarmerRecord[];
  units: OwnerUnit[];
  managerCount: number;
  fieldOfficerCount: number;
  farmerCount: number;
  industryName: string | null;
  loading: boolean;
  error: string | null;
  agroState: AgroStatsState;
  updatedAt: Date | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function enrichWithAgroStats(plots: OwnerPlotRecord[], agroData: unknown): OwnerPlotRecord[] {
  const ids = plots.map((p) => p.plotId).filter(Boolean);
  const harvest = harvestInfoFromAgroStatsBatch(agroData, ids);
  return plots.map((plot) => {
    if (!plot.plotId) return plot;
    const metrics = readAgroMetrics(extractAgroStatsPlotRow(agroData, plot.plotId, null));
    if (!metrics) return plot;
    const info = harvest.get(plot.plotId);
    const batchStatus = info?.harvestStatus || (info?.isHarvested ? "Harvested" : "");
    return {
      ...plot,
      agro: {
        ...metrics,
        status: normalizeGrapesStatus(batchStatus) || metrics.status,
      },
    };
  });
}

/** Owner portfolio: hierarchy plots joined with the shared /plots/agroStats batch. */
export function useOwnerPortfolio() {
  const [state, setState] = useState<OwnerPortfolioState>({
    plots: [],
    farmers: [],
    units: [],
    managerCount: 0,
    fieldOfficerCount: 0,
    farmerCount: 0,
    industryName: null,
    loading: true,
    error: null,
    agroState: "idle",
    updatedAt: null,
  });
  const runRef = useRef(0);

  const load = useCallback(async (force = false) => {
    const run = ++runRef.current;
    const today = todayIso();
    const agroKey = `agroStats_${today}`;
    if (force) {
      removeCache(HIERARCHY_CACHE_KEY);
      removeCache(agroKey);
    }

    setState((s) => ({ ...s, loading: s.plots.length === 0, error: null }));

    let plots: OwnerPlotRecord[] = [];
    let hierarchy = getCache(HIERARCHY_CACHE_KEY) as Hierarchy | null;
    try {
      if (!hierarchy) {
        hierarchy = await loadOwnerFieldOfficers({ industryId: getStoredUserIndustry().id });
        setCache(HIERARCHY_CACHE_KEY, hierarchy);
      }
    } catch (err: any) {
      if (run !== runRef.current) return;
      const status = err?.response?.status;
      setState((s) => ({
        ...s,
        loading: false,
        error:
          status === 401 || status === 403
            ? "Your session does not have access to the owner plots. Please log in again."
            : "Could not load plots, managers and field officers.",
      }));
      return;
    }
    if (run !== runRef.current) return;

    plots = buildOwnerPlotRecords(hierarchy.fieldOfficers, hierarchy.managers);
    if (import.meta.env.DEV) {
      console.table(plots.map((p) => ({ plot: p.plotLabel, farmer: p.farmerName, variety: p.variety })));
    }
    const realManagers = hierarchy.managers.filter((m: any) => m?.id !== UNASSIGNED_TEAM_ID);
    const realOfficers = hierarchy.fieldOfficers.filter((fo: any) => fo?.id !== UNASSIGNED_TEAM_ID);
    const managerIds = new Set(
      plots.map((p) => p.managerId).filter((id) => id !== UNASSIGNED_MANAGER),
    );
    const farmerKeys = new Set<string>();
    for (const fo of hierarchy.fieldOfficers as any[]) {
      for (const farmer of Array.isArray(fo?.farmers) ? fo.farmers : []) {
        const id = farmerKey(farmer);
        if (id) farmerKeys.add(id);
      }
    }
    setState((s) => ({
      ...s,
      plots,
      farmers: buildOwnerFarmerRecords(hierarchy!.fieldOfficers, hierarchy!.managers),
      units: buildUnits(hierarchy!.managers, hierarchy!.fieldOfficers),
      managerCount: Math.max(realManagers.length, managerIds.size),
      fieldOfficerCount: realOfficers.length,
      farmerCount: farmerKeys.size,
      industryName:
        (
          hierarchy!.industry?.name ??
          realManagers.find((m: any) => m?.industry?.name)?.industry?.name ??
          null
        )?.replace(/\bgrapse\b/gi, "Grapes") ?? null,
      loading: false,
      error: plots.length === 0 ? "No grapes plots were found for your industry." : null,
      agroState: plots.length > 0 ? "loading" : "idle",
      updatedAt: new Date(),
    }));

    if (plots.length === 0) return;

    try {
      let agroData = getCache(agroKey);
      if (!agroData) {
        const res = await axios.get(
          `${getEventsBaseUrl().replace(/\/+$/, "")}/plots/agroStats`,
          {
            params: { end_date: today },
            timeout: 60_000,
            headers: { Accept: "application/json" },
          },
        );
        agroData = res.data;
        setCache(agroKey, agroData);
      }
      if (run !== runRef.current) return;
      const enriched = enrichWithAgroStats(plots, agroData);
      setState((s) => ({
        ...s,
        plots: enriched,
        agroState: enriched.some((p) => p.agro) ? "ready" : "unavailable",
        updatedAt: new Date(),
      }));
    } catch (err) {
      if (run !== runRef.current) return;
      console.warn("useOwnerPortfolio: agroStats unavailable", err);
      setState((s) => ({ ...s, agroState: "unavailable" }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [backendCounts, setBackendCounts] = useState<OwnerBackendCounts | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTotalCounts()
      .then((res) => {
        if (import.meta.env.DEV) console.info("[owner] /users/total-count/ response:", res.data);
        if (!cancelled) setBackendCounts(readOwnerCounts(res.data));
      })
      .catch((err) => console.warn("useOwnerPortfolio: /users/total-count/ unavailable", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, backendCounts, reload: () => load(true) };
}
