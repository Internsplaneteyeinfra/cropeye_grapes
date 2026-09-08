import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useFarmerProfile } from "./useFarmerProfile";
import { getGrapesMainBaseUrl } from "../utils/serviceUrls";
import { collectPlotApiIds } from "../utils/grapesEventsBundle";
import { isValidSoilNpkResponse, normalizeNpkFromApi } from "../utils/npkNormalize";

export function useNpkData(plotName: string) {
  const { profile, loading: profileLoading } = useFarmerProfile();
  const { getCached, setCached, getApiData, setApiData, setAppState, appState } =
    useAppContext();

  const preloaded = plotName ? getApiData("npk", plotName) : null;
  const [localNpk, setLocalNpk] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const npkData = useMemo(() => {
    const raw = preloaded || appState.npkData || localNpk || {};
    return normalizeNpkFromApi(raw);
  }, [preloaded, appState.npkData, localNpk]);

  const fetchNpk = useCallback(async () => {
    if (!plotName || fetchingRef.current) return;

    const contextData = getApiData("npk", plotName);
    if (contextData && Object.keys(contextData).length > 0) {
      const normalized = normalizeNpkFromApi(contextData);
      setAppState((prev: Record<string, unknown>) => ({ ...prev, npkData: normalized }));
      setLocalNpk(normalized);
      return;
    }

    const cacheKey = `npkData_${plotName}`;
    const cached = getCached(cacheKey);
    if (cached && Object.keys(cached).length > 0) {
      const normalized = normalizeNpkFromApi(cached);
      setAppState((prev: Record<string, unknown>) => ({ ...prev, npkData: normalized }));
      setLocalNpk(normalized);
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const currentDate = new Date().toISOString().split("T")[0];
      const baseUrl = getGrapesMainBaseUrl();
      const selectedPlot =
        profile?.plots?.find((p) => p.fastapi_plot_id === plotName) || profile?.plots?.[0];
      const plantationDate =
        (selectedPlot?.farms?.[0]?.plantation_date &&
          String(selectedPlot.farms[0].plantation_date).split("T")[0]) ||
        "2025-01-01";

      // OpenAPI: path + query only (no JSON body). Try alternate plot ids.
      const plotCandidates = collectPlotApiIds(profile, plotName);

      let json: any = null;
      let lastError = "NPK API failed";
      for (const id of plotCandidates) {
        const qs = new URLSearchParams({
          end_date: currentDate,
          plantation_date: plantationDate,
        });
        const url = `${baseUrl}/required-n/${encodeURIComponent(id)}?${qs}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { Accept: "application/json" },
          mode: "cors",
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          lastError = `NPK API ${res.status}${errorText ? `: ${errorText.slice(0, 120)}` : ""}`;
          continue;
        }
        const body = await res.json();
        if (isValidSoilNpkResponse(body)) {
          json = body;
          break;
        }
        lastError = "Invalid NPK response from required-n API";
      }

      if (!json) {
        throw new Error(lastError);
      }

      const npk = {
        ...normalizeNpkFromApi(json),
        N: json.soilN,
        P: json.soilP,
        K: json.soilK,
        plantanalysis_n: json.plantanalysis_n ?? null,
        plantanalysis_p: json.plantanalysis_p ?? null,
        plantanalysis_k: json.plantanalysis_k ?? null,
      };

      setAppState((prev: Record<string, unknown>) => ({ ...prev, npkData: npk }));
      setLocalNpk(npk);
      setCached(cacheKey, npk);
      setApiData("npk", plotName, npk);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch NPK data";
      setError(msg);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [plotName, profile?.plots, getApiData, getCached, setCached, setApiData, setAppState]);

  useEffect(() => {
    if (!plotName || profileLoading) return;
    void fetchNpk();
  }, [plotName, profileLoading, fetchNpk]);

  const hasValue = (value: unknown) =>
    value !== undefined && value !== null && value !== "";

  return { npkData, loading, error, hasValue };
}
