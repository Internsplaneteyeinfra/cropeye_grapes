import React, { createContext, useCallback, useContext, useState } from "react";
import { clearAllCache, getCache, setCache } from "../components/utils/cache";

interface GlobalCache {
  [key: string]: any;
}

interface ApiDataStore {
  growthData?: { [plotName: string]: any };
  waterUptakeData?: { [plotName: string]: any };
  soilMoistureData?: { [plotName: string]: any };
  pestData?: { [plotName: string]: any };
  brixData?: { [plotName: string]: any };
  canopyVigourData?: { [plotName: string]: any };
  brixQualityData?: { [plotName: string]: any };
  farmerDashboardData?: { [plotName: string]: any };
  indicesData?: { [plotName: string]: any };
  stressData?: { [plotName: string]: any };
  irrigationData?: { [plotName: string]: any };
  agroStatsData?: { [plotName: string]: any };
  fertilizerData?: { [plotName: string]: any };
  npkData?: { [plotName: string]: any };
  soilAnalysisData?: { [plotName: string]: any };
  etData?: { [plotName: string]: any };
  soilMoistureTrendData?: { [plotName: string]: any };
  brixTimeSeriesData?: { [plotName: string]: any };
  fieldScoreData?: { [plotName: string]: any };
  isLoading?: { [endpoint: string]: boolean };
  isPreloading?: boolean;
  preloadComplete?: boolean;
}

interface AppState {
  weatherData?: any;
  soilAnalysis?: any;
  fieldScore?: any;
  selectedPlotName?: string | null;
  apiData: ApiDataStore;
  [key: string]: any;
}

interface AppContextType {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  globalCache: GlobalCache;
  setGlobalCache: React.Dispatch<React.SetStateAction<GlobalCache>>;
  getCached: (key: string, maxAgeMs?: number) => any;
  setCached: (key: string, data: any) => void;
  selectedPlotName: string | null;
  setSelectedPlotName: (plotName: string | null) => void;
  selectedAnalysisDate: string | null;
  setSelectedAnalysisDate: (date: string | null) => void;
  getApiData: (endpoint: string, plotName: string) => any;
  setApiData: (endpoint: string, plotName: string, data: any) => void;
  isDataLoading: (endpoint: string) => boolean;
  setDataLoading: (endpoint: string, loading: boolean) => void;
  isPreloading: () => boolean;
  setPreloading: (loading: boolean) => void;
  isPreloadComplete: () => boolean;
  setPreloadComplete: (complete: boolean) => void;
  hasApiData: (endpoint: string, plotName: string) => boolean;
  clearApiCache: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const createEmptyApiData = (): ApiDataStore => ({
  growthData: {},
  waterUptakeData: {},
  soilMoistureData: {},
  pestData: {},
  brixData: {},
  canopyVigourData: {},
  brixQualityData: {},
  farmerDashboardData: {},
  indicesData: {},
  stressData: {},
  irrigationData: {},
  agroStatsData: {},
  fertilizerData: {},
  npkData: {},
  soilAnalysisData: {},
  etData: {},
  soilMoistureTrendData: {},
  brixTimeSeriesData: {},
  fieldScoreData: {},
  isLoading: {},
  isPreloading: false,
  preloadComplete: false,
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [appState, setAppState] = useState<AppState>(() => {
    const savedPlot = localStorage.getItem("selectedPlot");

    return {
      selectedPlotName: savedPlot || null,
      apiData: createEmptyApiData(),
    };
  });
  const [globalCache, setGlobalCache] = useState<GlobalCache>({});
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState<string | null>(null);

  const getCached = useCallback(
    (key: string, maxAgeMs?: number) => {
      if (Object.prototype.hasOwnProperty.call(globalCache, key)) {
        return globalCache[key];
      }
      return getCache(key, maxAgeMs);
    },
    [globalCache],
  );

  const setCached = useCallback((key: string, data: any) => {
    setGlobalCache((prev) => ({ ...prev, [key]: data }));
    setCache(key, data);
  }, []);

  const setSelectedPlotName = useCallback((plotName: string | null) => {
    setAppState((prev) => ({ ...prev, selectedPlotName: plotName }));
    if (plotName) {
      localStorage.setItem("selectedPlot", plotName);
    } else {
      localStorage.removeItem("selectedPlot");
    }
  }, []);

  const getApiData = useCallback(
    (endpoint: string, plotName: string) => {
      const endpointMap: { [key: string]: keyof ApiDataStore } = {
        growth: "growthData",
        waterUptake: "waterUptakeData",
        soilMoisture: "soilMoistureData",
        pest: "pestData",
        brix: "brixData",
        canopyVigour: "canopyVigourData",
        brixQuality: "brixQualityData",
        farmerDashboard: "farmerDashboardData",
        indices: "indicesData",
        stress: "stressData",
        irrigation: "irrigationData",
        agroStats: "agroStatsData",
        npk: "npkData",
        soilAnalysis: "soilAnalysisData",
        et: "etData",
        soilMoistureTrend: "soilMoistureTrendData",
        brixTimeSeries: "brixTimeSeriesData",
        fieldScore: "fieldScoreData",
      };

      const dataKey = endpointMap[endpoint];
      if (!dataKey) return null;

      return appState.apiData[dataKey]?.[plotName] || null;
    },
    [appState.apiData],
  );

  const setApiData = useCallback((endpoint: string, plotName: string, data: any) => {
    const endpointMap: { [key: string]: keyof ApiDataStore } = {
      growth: "growthData",
      waterUptake: "waterUptakeData",
      soilMoisture: "soilMoistureData",
      pest: "pestData",
      brix: "brixData",
      canopyVigour: "canopyVigourData",
      brixQuality: "brixQualityData",
      farmerDashboard: "farmerDashboardData",
      indices: "indicesData",
      stress: "stressData",
      irrigation: "irrigationData",
      agroStats: "agroStatsData",
      npk: "npkData",
      soilAnalysis: "soilAnalysisData",
      et: "etData",
      soilMoistureTrend: "soilMoistureTrendData",
      brixTimeSeries: "brixTimeSeriesData",
      fieldScore: "fieldScoreData",
    };

    const dataKey = endpointMap[endpoint];
    if (!dataKey) return;

    setAppState((prev) => ({
      ...prev,
      apiData: {
        ...prev.apiData,
        [dataKey]: {
          ...prev.apiData[dataKey],
          [plotName]: data,
        },
      },
    }));
  }, []);

  const isDataLoading = useCallback(
    (endpoint: string) => appState.apiData.isLoading?.[endpoint] || false,
    [appState.apiData.isLoading],
  );

  const setDataLoading = useCallback((endpoint: string, loading: boolean) => {
    setAppState((prev) => ({
      ...prev,
      apiData: {
        ...prev.apiData,
        isLoading: {
          ...prev.apiData.isLoading,
          [endpoint]: loading,
        },
      },
    }));
  }, []);

  const isPreloading = useCallback(
    () => appState.apiData.isPreloading || false,
    [appState.apiData.isPreloading],
  );

  const setPreloading = useCallback((loading: boolean) => {
    setAppState((prev) => ({
      ...prev,
      apiData: {
        ...prev.apiData,
        isPreloading: loading,
      },
    }));
  }, []);

  const isPreloadComplete = useCallback(
    () => appState.apiData.preloadComplete || false,
    [appState.apiData.preloadComplete],
  );

  const setPreloadComplete = useCallback((complete: boolean) => {
    setAppState((prev) => ({
      ...prev,
      apiData: {
        ...prev.apiData,
        preloadComplete: complete,
      },
    }));
  }, []);

  const hasApiData = useCallback(
    (endpoint: string, plotName: string) => {
      const data = getApiData(endpoint, plotName);
      return data !== null && data !== undefined;
    },
    [getApiData],
  );

  const clearApiCache = useCallback(() => {
    setGlobalCache({});
    clearAllCache();
    setAppState((prev) => ({
      ...prev,
      apiData: createEmptyApiData(),
    }));
    console.log("API cache cleared");
  }, []);

  return (
    <AppContext.Provider
      value={{
        appState,
        setAppState,
        globalCache,
        setGlobalCache,
        getCached,
        setCached,
        selectedPlotName: appState.selectedPlotName || null,
        setSelectedPlotName,
        selectedAnalysisDate,
        setSelectedAnalysisDate,
        getApiData,
        setApiData,
        isDataLoading,
        setDataLoading,
        isPreloading,
        setPreloading,
        isPreloadComplete,
        setPreloadComplete,
        hasApiData,
        clearApiCache,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
