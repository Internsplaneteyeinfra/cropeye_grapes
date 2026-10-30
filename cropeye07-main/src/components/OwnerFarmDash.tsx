import React, { useState, useEffect, useRef } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
  ReferenceArea,
  Scatter,
  ComposedChart,
  BarChart,
  Bar,
} from "recharts";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Tooltip as LeafletTooltip,
  useMap,
} from "react-leaflet";
import {
  Loader2,
  Calendar,
  Droplets,
  Thermometer,
  Activity,
  Target,
  Leaf,
  BarChart3,
  // PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Users,
  MapPin,
  Beaker,
  // Crop,
  // Zap,
  // Clock,
  // Gauge,
  // Filter,
  // RefreshCw,
  Maximize2,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import api, {
  getCurrentUser,
  getFarmersByFieldOfficer,
  getTeamConnect,
} from "../api"; // Import the authenticated api instance + hierarchy helpers
import CommonSpinner from "./CommanSpinner";

// Constants (same as FarmerDashboard)
const BASE_URL = "https://events-cropeye.up.railway.app";
const OPTIMAL_BIOMASS = 150;
const SOIL_API_URL = "https://main-cropeye.up.railway.app";
const SOIL_DATE = "2025-10-03";

const OTHER_FARMERS_RECOVERY = {
  regional_average: 7.85,
  top_quartile: 8.52,
  bottom_quartile: 6.58,
  similar_farms: 7.63,
};

// Type definitions (keeping the same as original)
interface LineChartData {
  date: string;
  growth: number;
  stress: number;
  water: number;
  moisture: number;
  stressLevel?: number | null;
  isStressEvent?: boolean;
  stressEventData?: any;
}

interface VisibleLines {
  growth: boolean;
  stress: boolean;
  water: boolean;
  moisture: boolean;
}

interface LineStyles {
  [key: string]: {
    color: string;
    label: string;
  };
}

interface StressEvent {
  from_date: string;
  to_date: string;
  stress: number;
}

interface CustomStressDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

interface Metrics {
  brix: number | null;
  brixMin: number | null;
  brixMax: number | null;
  recovery: number | null;
  area: number | null;
  biomass: number | null;
  totalBiomass: number | null;
  stressCount: number | null;
  irrigationEvents: number | null;
  expectedYield: number | null;
  daysToHarvest: number | null;
  growthStage: string | null;
  soilPH: number | null;
  organicCarbonDensity: number | null;
  actualYield: number | null;
  cnRatio: number | null;
  sugarYieldMax: number | null;
  sugarYieldMin: number | null;
}

interface PieChartWithNeedleProps {
  value: number;
  max: number;
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
}

type TimePeriod = "daily" | "weekly" | "monthly" | "yearly";

const OwnerFarmDash: React.FC = () => {
  // const center: [number, number] = [17.5789, 75.053]; // Unused - using mapCenter state instead
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Farmer and Plot selection state
  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const [selectedFieldOfficerId, setSelectedFieldOfficerId] =
    useState<string>("");
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>("");
  const [selectedPlotId, setSelectedPlotId] = useState<string>(""); // Start empty, will be set based on farmer selection
  const selectedPlotIdRef = useRef<string>("");
  const [managers, setManagers] = useState<any[]>([]);
  const [fieldOfficers, setFieldOfficers] = useState<any[]>([]);
  // Raw field officers list (used to filter per selected manager).
  const [teamFieldOfficersRaw, setTeamFieldOfficersRaw] = useState<any[]>([]);
  const [farmersForSelectedOfficer, setFarmersForSelectedOfficer] = useState<
    any[]
  >([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const lineStyles: LineStyles = {
    growth: { color: "#22c55e", label: "Growth Index" },
    stress: { color: "#ef4444", label: "Stress Index" },
    water: { color: "#3b82f6", label: "Water Index" },
    moisture: { color: "#f59e0b", label: "Moisture Index" },
  };

  const [lineChartData, setLineChartData] = useState<LineChartData[]>([]);
  const [plotCoordinates, setPlotCoordinates] = useState<[number, number][]>(
    [],
  );
  const [visibleLines, setVisibleLines] = useState<VisibleLines>({
    growth: true,
    stress: true,
    water: true,
    moisture: true,
  });

  const [metrics, setMetrics] = useState<Metrics>({
    brix: null,
    brixMin: null,
    brixMax: null,
    recovery: null,
    area: null,
    biomass: null,
    totalBiomass: null,
    stressCount: null,
    irrigationEvents: null,
    expectedYield: null,
    daysToHarvest: null,
    growthStage: null,
    soilPH: null,
    organicCarbonDensity: null,
    actualYield: null,
    cnRatio: null,
    sugarYieldMax: null,
    sugarYieldMin: null,
  });

  const [stressEvents, setStressEvents] = useState<StressEvent[]>([]);
  const [showStressEvents] = useState<boolean>(false);
  const [ndreStressEvents, setNdreStressEvents] = useState<StressEvent[]>([]);
  const [showNDREEvents, setShowNDREEvents] = useState<boolean>(false);
  const [combinedChartData, setCombinedChartData] = useState<LineChartData[]>(
    [],
  );
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("weekly");
  const [aggregatedData, setAggregatedData] = useState<LineChartData[]>([]);

  // Mobile layout flag for charts
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const [mapKey, setMapKey] = useState<number>(0);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    17.5789, 75.053,
  ]);
  const [plotCoordinatesCache, setPlotCoordinatesCache] = useState<
    Map<string, [number, number][]>
  >(new Map());
  const hierarchyRequestIdRef = useRef<number>(0);

  // Fetch farmers list on component mount
  useEffect(() => {
    fetchOwnerHierarchy();
  }, []);

  // Keep a ref so background retries can verify they're updating the latest plot.
  useEffect(() => {
    selectedPlotIdRef.current = selectedPlotId;
  }, [selectedPlotId]);

  // NEW: Function to set plot coordinates from existing state
  const setPlotCoordinatesFromState = (plotId: string): void => {
    // Only rely on the currently loaded farmers list.
    const farmer = farmersForSelectedOfficer.find((f: any) => {
      const farmerId =
        f?.id ?? f?.farmer_id ?? f?.farmerId ?? f?.user_id ?? null;
      return farmerId != null && String(farmerId) === String(selectedFarmerId);
    });

    const plot =
      farmer?.plots?.find((p: any) => {
        const pid = p?.fastapi_plot_id ?? p?.plot_id ?? p?.id;
        return pid != null && String(pid) === String(plotId);
      }) ?? null;

    const boundary = plot?.boundary;
    const coordsList = boundary?.coordinates;

    if (coordsList && Array.isArray(coordsList) && coordsList.length > 0) {
      const geom = coordsList[0];
      if (geom) {
        // The API gives [lng, lat], Leaflet needs [lat, lng]
        const coords = geom.map(
          ([lng, lat]: [number, number]) => [lat, lng],
        );
        setPlotCoordinates(coords);

        // Calculate and set map center
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1); // Force map re-render
        return;
      }
    }

    setPlotCoordinates([]);
  };

  // Update field officers dropdown when manager changes
  useEffect(() => {
    if (!selectedManagerId) {
      setFieldOfficers([]);
      setSelectedFieldOfficerId("");
      setFarmersForSelectedOfficer([]);
      setSelectedFarmerId("");
      setPlots([]);
      setSelectedPlotId("");
      return;
    }

    // teamFieldOfficersRaw is flattened; filter officers by manager_id.
    const filtered = teamFieldOfficersRaw.filter((fo: any) => {
      const mid =
        fo?.manager_id ??
        fo?.manager?.id ??
        fo?.managerId ??
        fo?.manager_id;
      return mid != null && String(mid) === String(selectedManagerId);
    });

    setFieldOfficers(filtered);
    // Step-by-step: do not auto-select field officer
    setSelectedFieldOfficerId("");
    setFarmersForSelectedOfficer([]);
    setSelectedFarmerId("");
    setPlots([]);
    setSelectedPlotId("");
  }, [selectedManagerId, teamFieldOfficersRaw]);

  // Update farmers dropdown when field officer changes
  useEffect(() => {
    if (!selectedFieldOfficerId) {
      setFarmersForSelectedOfficer([]);
      setSelectedFarmerId("");
      setPlots([]);
      setSelectedPlotId("");
      return;
    }

    let cancelled = false;

    // Step-by-step: load farmers only when an officer is selected.
    // Primary: API call via /users/farmers-by-field-officer/<id>/
    (async () => {
      setFarmersForSelectedOfficer([]);
      setSelectedFarmerId("");
      setPlots([]);
      setSelectedPlotId("");

      try {
        const res = await getFarmersByFieldOfficer(
          selectedFieldOfficerId as unknown as number,
        );
        const data = res?.data;
        const farmers =
          (data && (data.results || data.farmers)) ??
          data ??
          [];
        if (!cancelled) {
          setFarmersForSelectedOfficer(Array.isArray(farmers) ? farmers : []);
        }
      } catch (err) {
        // Fallback: use any nested farmers that might exist on the filtered FO object.
        const officer = fieldOfficers.find(
          (fo) => String(fo.id) === String(selectedFieldOfficerId),
        );
        const fallbackFarmers = officer?.farmers ?? [];
        if (!cancelled) {
          setFarmersForSelectedOfficer(
            Array.isArray(fallbackFarmers) ? fallbackFarmers : [],
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFieldOfficerId, fieldOfficers]);

  // Fetch plots when farmer is selected
  useEffect(() => {
    if (selectedFarmerId) {
      const selectedFarmer = farmersForSelectedOfficer.find(
        (f) =>
          String(f.id || f.farmer_id || f.farmerId) ===
          String(selectedFarmerId),
      );

      if (selectedFarmer) {
        // Extract fastapi_plot_id from plots array
        const farmerPlots = selectedFarmer.plots || [];
        const plotIds = farmerPlots.map((plot: any) => plot.fastapi_plot_id);

        setPlots(plotIds);

        // Auto-select first plot if available
        if (plotIds.length > 0) {
          const firstPlotId = plotIds[0];
          setSelectedPlotId(firstPlotId);
        } else {
          setSelectedPlotId("");
        }
      } else {
        setPlots([]);
        setSelectedPlotId("");
      }
    } else {
      setPlots([]);
      setSelectedPlotId("");
    }
  }, [selectedFarmerId, farmersForSelectedOfficer]);

  useEffect(() => {
    if (selectedPlotId) {
      fetchAllData();
      setPlotCoordinatesFromState(selectedPlotId); // This will now work
    }
  }, [selectedPlotId]);

  useEffect(() => {
    if (lineChartData.length > 0) {
      const aggregated = aggregateDataByPeriod(lineChartData, timePeriod);
      setAggregatedData(aggregated);
    }
  }, [lineChartData, timePeriod]);

  useEffect(() => {
    if (aggregatedData.length > 0) {
      const combined = aggregatedData.map((point) => {
        const stressEvent = showNDREEvents
          ? ndreStressEvents.find((event) => {
              const eventStart = new Date(event.from_date);
              const eventEnd = new Date(event.to_date);
              const pointDate = new Date(point.date);
              return pointDate >= eventStart && pointDate <= eventEnd;
            })
          : null;

        return {
          ...point,
          stressLevel: stressEvent ? stressEvent.stress : null,
          isStressEvent: !!stressEvent,
          stressEventData: stressEvent,
        };
      });

      setCombinedChartData(combined);
    }
  }, [aggregatedData, ndreStressEvents, showNDREEvents]);

  // Helper function to make axios requests with timeout and retry logic
  // Optimized with shorter timeout for faster retrieval
  const makeRequestWithRetry = async (
    url: string,
    retries = 1,
    timeout = 15000,
  ): Promise<any> => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);

    try {
      const response = await axios.get(url, {
        signal: abortController.signal,
        timeout: timeout,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      clearTimeout(timeoutId);
      return response.data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle CORS errors
      if (
        error.message?.includes("CORS") ||
        error.message?.includes("Access-Control-Allow-Origin")
      ) {
        throw new Error(
          `CORS error: The server at ${
            new URL(url).origin
          } is not configured to allow requests from this origin. Please contact the API administrator.`,
        );
      }

      // Handle timeout errors (including AbortError from AbortController)
      if (
        error.name === "AbortError" ||
        error.code === "ECONNABORTED" ||
        error.message?.includes("timeout") ||
        error.message?.includes("canceled")
      ) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Request timeout: The server took too long to respond. Please try again later.`,
        );
      }

      // Handle network errors
      if (
        error.code === "ERR_NETWORK" ||
        error.message?.includes("ERR_FAILED")
      ) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Network error: Unable to connect to the server. Please check your internet connection.`,
        );
      }

      // Handle 504 Gateway Timeout
      if (error.response?.status === 504) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Gateway timeout: The server is taking too long to process your request. Please try again later.`,
        );
      }

      // Re-throw other errors
      throw error;
    }
  };

  // Fetch all data for selected plot - Optimized for faster retrieval
  const fetchAllData = async (): Promise<void> => {
    if (!selectedPlotId) return;

    // Don't block the UI with a long spinner; cards will show "-" until data updates.
    setLoadingData(false);
    // Optimistic guard: avoid dashboard staying on spinner forever
    // if one backend endpoint is slow. UI will still update when data arrives.
    const optimisticSpinnerTimeout = window.setTimeout(() => {
      setLoadingData(false);
    }, 2500);
    try {
      const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
      const endDate = new Date(Date.now() - tzOffsetMs)
        .toISOString()
        .slice(0, 10);
      const today = endDate; // For compatibility with existing code

      // Step 1: Harvest status (do NOT block dashboard render)
      // We show the dashboard using endDate first, then update growthStage when harvest status arrives.
      const harvestCacheKey = `harvest_${selectedPlotId}_${endDate}`;
      let harvestStatus: string | null = null;
      let harvestData = getCache(harvestCacheKey);
      let harvestDate: string | null = null;
      let isHarvested = false;

      const parseHarvest = (data: any) => {
        const harvestProperties =
          data?.features?.[0]?.properties || data?.harvest_summary;
        const parsedHarvestStatus =
          harvestProperties?.harvest_status ||
          data?.harvest_summary?.harvest_status ||
          null;
        const parsedHarvestDate = harvestProperties?.harvest_date || null;
        const parsedIsHarvested =
          harvestProperties?.has_harvest === true &&
          harvestProperties?.harvest_status === "harvested";
        return {
          harvestStatus: parsedHarvestStatus,
          harvestDate: parsedHarvestDate,
          isHarvested: parsedIsHarvested,
        };
      };

      if (harvestData) {
        const parsed = parseHarvest(harvestData);
        harvestStatus = parsed.harvestStatus;
        harvestDate = parsed.harvestDate;
        isHarvested = parsed.isHarvested;
      }

      const harvestPromise = harvestData
        ? Promise.resolve({ harvestStatus, harvestDate, isHarvested })
        : axios
            .post(
              `${BASE_URL}/sugarcane-harvest?plot_name=${selectedPlotId}&end_date=${endDate}`,
            )
            .then((harvestRes) => {
              const data = harvestRes.data;
              setCache(harvestCacheKey, data);
              const parsed = parseHarvest(data);
              return parsed;
            })
            .catch((harvestErr) => {
              console.error("Error fetching harvest status:", harvestErr);
              return { harvestStatus: null, harvestDate: null, isHarvested: false };
            });

      // Step 2: Use endDate immediately for agroStats/indices/stress/irrigation.
      // If we later find a harvested plot, we will still update growthStage,
      // but we avoid blocking the first paint waiting for harvest.
      const yieldDataDate = endDate;

      // Step 3: Fetch critical data (agroStats) with versioned caching
      // Optimization: prefer the faster single-plot endpoint (analyzeSinglePlot),
      // avoid downloading agroStats for ALL plots on owner dashboard load.
      const singlePlotCacheKey = `agroSingle_v1_${selectedPlotId}_${yieldDataDate}`;
      let currentPlotData = getCache(singlePlotCacheKey);

      const applyPlotStatsToState = (plot: any) => {
        const toNumberOrNull = (v: any): number | null => {
          if (v === null || v === undefined) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        const expectedYieldValue = toNumberOrNull(
          plot?.brix_sugar?.sugar_yield?.mean ??
            plot?.brix_sugar?.sugar_yield?.avg ??
            plot?.brix_sugar?.sugar_yield?.average ??
            plot?.brix_sugar?.sugar_yield_mean ??
            plot?.sugar_yield_mean ??
            plot?.expected_yield,
        );

        let calculatedBiomass = null;
        let totalBiomassForMetric = null;

        if (expectedYieldValue !== null && expectedYieldValue !== undefined) {
          const totalBiomass = expectedYieldValue * 1.27;
          const underGroundBiomassInTons = totalBiomass * 0.12;
          calculatedBiomass = underGroundBiomassInTons;
          totalBiomassForMetric = totalBiomass;
        }

        setMetrics((prev) => ({
          ...prev,
          brix: toNumberOrNull(plot?.brix_sugar?.brix?.mean),
          brixMin: toNumberOrNull(plot?.brix_sugar?.brix?.min),
          brixMax: toNumberOrNull(plot?.brix_sugar?.brix?.max),
          recovery: toNumberOrNull(plot?.brix_sugar?.recovery?.mean),
          area:
            plot?.area_acres ??
            plot?.area ??
            plot?.area_ha ??
            null,
          biomass: calculatedBiomass,
          totalBiomass: totalBiomassForMetric,
          expectedYield: expectedYieldValue,
          daysToHarvest: plot?.days_to_harvest ?? null,
          growthStage: plot?.Sugarcane_Status ?? plot?.sugarcane_status ?? null,
          soilPH:
            toNumberOrNull(plot?.soil?.phh2o) ??
            toNumberOrNull(plot?.soil?.ph_h2o) ??
            null,
          organicCarbonDensity:
            plot?.soil?.organic_carbon_stock != null
              ? toNumberOrNull(plot.soil.organic_carbon_stock)
                ? parseFloat(plot.soil.organic_carbon_stock.toFixed(2))
                : null
              : null,
          actualYield: toNumberOrNull(
            plot?.brix_sugar?.sugar_yield?.mean ??
              plot?.brix_sugar?.sugar_yield_mean,
          ),
          sugarYieldMax: toNumberOrNull(
            plot?.brix_sugar?.sugar_yield?.max ??
              plot?.sugar_yield_max,
          ),
          sugarYieldMin: toNumberOrNull(
            plot?.brix_sugar?.sugar_yield?.min ??
              plot?.sugar_yield_min,
          ),
        }));
      };

      // Step 5: Update metrics immediately with cached data.
      // If missing, fetch plot stats in the background (no abort controller timeouts)
      // because the events endpoints can be slow.
      if (currentPlotData) {
        applyPlotStatsToState(currentPlotData);
      } else {
        const plotIdAtStart = selectedPlotId;
        void (async () => {
          try {
            // Re-check cache (might be filled while this async started).
            let plotData = getCache(singlePlotCacheKey);
            if (!plotData) {
              // Prefer single-plot endpoint.
              const singleRes = await axios.get(
                `https://events-cropeye.up.railway.app/plots/analyzeSinglePlot?plot_id=${plotIdAtStart}`,
              );
              plotData = singleRes?.data ?? null;
              if (plotData) setCache(singlePlotCacheKey, plotData);
            }

            // Fallback: use all-plots agroStats only if single-plot has no usable data.
            if (!plotData) {
              const agroStatsCacheKey = `agroStats_v3_${yieldDataDate}`;
              let allPlotsData = getCache(agroStatsCacheKey);
              if (!allPlotsData) {
                const agroStatsRes = await axios.get(
                  `https://events-cropeye.up.railway.app/plots/agroStats?end_date=${yieldDataDate}`,
                );
                allPlotsData = agroStatsRes?.data ?? null;
                if (allPlotsData) setCache(agroStatsCacheKey, allPlotsData);
              }

              const keys = Object.keys(allPlotsData || {});
              const keyCandidate =
                keys.find(
                  (k) =>
                    k === plotIdAtStart ||
                    k === `"${plotIdAtStart}"` ||
                    k.replace(/^"|"$/g, "") === plotIdAtStart,
                ) ?? null;
              plotData = keyCandidate ? (allPlotsData as any)[keyCandidate] : null;
              if (plotData) setCache(singlePlotCacheKey, plotData);
            }

            if (
              plotData &&
              selectedPlotIdRef.current === plotIdAtStart
            ) {
              if (import.meta.env.DEV) {
                console.log("[OwnerFarmDash] plot stats loaded:", {
                  plotId: plotIdAtStart,
                  expectedYield: plotData?.brix_sugar?.sugar_yield?.mean ?? null,
                });
              }
              applyPlotStatsToState(plotData);
            }
          } catch (e) {
            console.error("[OwnerFarmDash] plot stats fetch failed:", e);
          }
        })();
      }

      // Turn off the big dashboard spinner as soon as the main plot stats are ready.
      // Stress/irrigation/indices are loaded afterwards and will update cards/charts when ready.
      setLoadingData(false);

      // When harvest status arrives, update growthStage without blocking render.
      harvestPromise.then(({ harvestStatus: hs }) => {
        if (!hs) return;
        setMetrics((prev) => ({
          ...prev,
          growthStage: hs || prev.growthStage,
        }));
      });

      // Step 6: Fetch additional data in parallel with shorter timeouts
      // Check cache first for each endpoint
      const indicesCacheKey = `indices_${selectedPlotId}`;
      const stressCacheKey = `stress_${selectedPlotId}_NDRE_0.15`;
      const irrigationCacheKey = `irrigation_${selectedPlotId}`;

      let cachedIndices = getCache(indicesCacheKey);
      let cachedStress = getCache(stressCacheKey);
      let cachedIrrigation = getCache(irrigationCacheKey);

      // Fetch indices first (chart), then fetch stress/irrigation in the background.
      // This reduces the perceived "dashboard load time".
      if (cachedIndices) {
        // Cached indices are already in LineChartData[] format.
        setLineChartData(cachedIndices as LineChartData[]);
      } else {
        // Don't block dashboard further on indices (chart can render later).
        setLineChartData([]);
        makeRequestWithRetry(
          `${BASE_URL}/plots/${selectedPlotId}/indices`,
          1,
          10000,
        )
          .then((data) => {
            const mapped = (data || []).map((item: any) => ({
              date: new Date(item.date).toISOString().split("T")[0],
              growth: item.NDVI,
              stress: item.NDMI,
              water: item.NDWI,
              moisture: item.NDRE,
            }));
            setCache(indicesCacheKey, mapped);
            setLineChartData(mapped);
          })
          .catch(() => {
            setLineChartData([]);
          });
      }

      // Stress (NDRE events) - background
      if (!cachedStress) {
        makeRequestWithRetry(
          `${BASE_URL}/plots/${selectedPlotId}/stress?index_type=NDRE&threshold=0.15`,
          1,
          10000,
        )
          .then((data) => {
            setCache(stressCacheKey, data);
            const events = data?.events ?? [];
            setStressEvents(events);
            setNdreStressEvents(events);
            setMetrics((prev) => ({
              ...prev,
              stressCount: data?.total_events ?? 0,
              cnRatio: null,
            }));
          })
          .catch(() => {
            const events: any[] = [];
            setStressEvents(events);
            setNdreStressEvents(events);
            setMetrics((prev) => ({
              ...prev,
              stressCount: 0,
              cnRatio: null,
            }));
          });
      } else {
        const events = cachedStress?.events ?? [];
        setStressEvents(events);
        setNdreStressEvents(events);
        setMetrics((prev) => ({
          ...prev,
          stressCount: cachedStress?.total_events ?? 0,
          cnRatio: null,
        }));
      }

      // Irrigation events - background
      if (!cachedIrrigation) {
        makeRequestWithRetry(
          `${BASE_URL}/plots/${selectedPlotId}/irrigation?threshold_ndmi=0.05&threshold_ndwi=0.05&min_days_between_events=10`,
          1,
          10000,
        )
          .then((data) => {
            setCache(irrigationCacheKey, data);
            setMetrics((prev) => ({
              ...prev,
              irrigationEvents: data?.total_events ?? null,
            }));
          })
          .catch(() => {
            setMetrics((prev) => ({
              ...prev,
              irrigationEvents: null,
            }));
          });
      } else {
        setMetrics((prev) => ({
          ...prev,
          irrigationEvents: cachedIrrigation?.total_events ?? null,
        }));
      }
    } catch (err: any) {
      // You could add a toast notification here to inform the user
      // For now, we'll just log the error and continue with partial data
    } finally {
      clearTimeout(optimisticSpinnerTimeout);
      setLoadingData(false);
    }
  };

  // Fetch farmers from API - using authenticated endpoint
  const fetchOwnerHierarchy = async (): Promise<void> => {
    const HIERARCHY_CACHE_KEY = "ownerTeamConnect_v3";
    const HIERARCHY_TTL_MS = 30 * 60 * 1000; // 30 minutes

    // Fast path: hydrate managers/field officers from cache immediately
    const cached = getCache(HIERARCHY_CACHE_KEY, HIERARCHY_TTL_MS);
    if (cached?.managers && Array.isArray(cached.managers)) {
      const cachedManagers = cached.managers;
      const hasAnyFieldOfficer = cachedManagers.some(
        (m: any) => (m?.field_officers_count ?? 0) > 0,
      );
      const looksIncomplete = cachedManagers.length <= 1 && !hasAnyFieldOfficer;

      if (!looksIncomplete) {
        setManagers(cachedManagers);
        setTeamFieldOfficersRaw(
          Array.isArray(cached.fieldOfficers) ? cached.fieldOfficers : [],
        );
        setLoadingHierarchy(false);
        return;
      }
    }

    const requestId = ++hierarchyRequestIdRef.current;
    setLoadingHierarchy(true);

    const normalizeRole = (u: any) => {
      const roleId = u?.role_id ?? u?.role?.id ?? u?.role?.role_id ?? null;
      const roleNameRaw =
        u?.role?.name ?? u?.role_name ?? u?.roleName ?? u?.type ?? u?.user_type ?? "";
      const roleName = `${roleNameRaw}`.toLowerCase();
      return { roleId, roleName };
    };

    try {
      let managersTmp: any[] = [];
      let fieldOfficersTmp: any[] = [];

      // Prefer team-connect for lighter payload (if possible)
      const meRes = await getCurrentUser();
      const me = meRes?.data;
      const industryId =
        me?.industry_id ??
        me?.industry?.id ??
        me?.industry?.industry_id ??
        me?.industryId;

      if (industryId) {
        const teamRes = await getTeamConnect(industryId);
        const d = teamRes?.data;

        // Format: { users_by_role: { managers: [], field_officers: [] } }
        if (d?.users_by_role) {
          managersTmp = Array.isArray(d.users_by_role.managers)
            ? d.users_by_role.managers
            : [];
          fieldOfficersTmp = Array.isArray(d.users_by_role.field_officers)
            ? d.users_by_role.field_officers
            : [];
        }

        // Format: { managers: [], field_officers: [] }
        if ((!managersTmp || managersTmp.length === 0) && Array.isArray(d?.managers)) {
          managersTmp = d.managers;
        }
        if ((!fieldOfficersTmp || fieldOfficersTmp.length === 0) && Array.isArray(d?.field_officers)) {
          fieldOfficersTmp = d.field_officers;
        }

        // Format: { results: [...] } (role detection per item)
        if ((!managersTmp || managersTmp.length === 0) && Array.isArray(d?.results)) {
          d.results.forEach((u: any) => {
            const { roleId, roleName } = normalizeRole(u);
            if (roleId === 3 || roleName.includes("manager")) managersTmp.push(u);
            if (roleId === 2 || (roleName.includes("field") && roleName.includes("officer")))
              fieldOfficersTmp.push(u);
          });
        }
      }

      // If team-connect gives managers but no flat field-officers array,
      // try deriving field officers from nested manager objects.
      if (
        Array.isArray(managersTmp) &&
        managersTmp.length > 0 &&
        (!Array.isArray(fieldOfficersTmp) || fieldOfficersTmp.length === 0)
      ) {
        fieldOfficersTmp = managersTmp.flatMap((m: any) => {
          const mid = m?.id ?? m?.user_id ?? null;
          const nestedFos = m?.field_officers ?? m?.fieldOfficers ?? m?.fo_list ?? [];
          if (!Array.isArray(nestedFos)) return [];
          return nestedFos.map((fo: any) => ({
            ...fo,
            manager_id: fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? mid,
          }));
        });
      }

      // Fallback to owner-hierarchy if team-connect doesn't provide managers
      if (
        !Array.isArray(managersTmp) ||
        managersTmp.length === 0 ||
        !Array.isArray(fieldOfficersTmp) ||
        fieldOfficersTmp.length === 0
      ) {
        const response = await api.get(
          `${import.meta.env.VITE_API_BASE_URL || "https://cropeye-backendd.up.railway.app/api"}/users/owner-hierarchy/`,
        );
        const responseData = response.data;

        managersTmp = Array.isArray(responseData?.managers)
          ? responseData.managers
          : Array.isArray(responseData?.results)
            ? responseData.results
            : [];

        // Flatten managers -> field_officers and attach manager_id for filtering.
        if (Array.isArray(managersTmp)) {
          fieldOfficersTmp = managersTmp.flatMap((m: any) =>
            (Array.isArray(m?.field_officers) ? m.field_officers : []).map((fo: any) => ({
              ...fo,
              manager_id: fo?.manager_id ?? fo?.manager?.id ?? m?.id,
            })),
          );
        }
      }

      // Ensure each field officer has manager_id for filtering.
      fieldOfficersTmp = (fieldOfficersTmp || []).map((fo: any) => ({
        ...fo,
        manager_id:
          fo?.manager_id ??
          fo?.manager?.id ??
          fo?.managerId ??
          fo?.manager_id_number ??
          null,
      }));

      // Compute field_officers_count for each manager (used in the dropdown UI).
      const managersNormalized = (managersTmp || []).map((m: any) => {
        const mid = m?.id ?? m?.user_id ?? null;
        const count = (fieldOfficersTmp || []).filter((fo: any) => {
          const foMid = fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? null;
          return mid != null && foMid != null && String(foMid) === String(mid);
        }).length;
        return {
          ...m,
          field_officers_count:
            m?.field_officers_count ??
            m?.fieldOfficersCount ??
            count,
        };
      });

      // If the team-connect parsing produced an incomplete tree (common issue:
      // only 1 manager with 0 field officers), force-fetch the heavier
      // owner-hierarchy endpoint to ensure the managers dropdown is correct.
      const managersCount = managersNormalized.length;
      const hasAnyFieldOfficer =
        managersNormalized.some(
          (m: any) => (m.field_officers_count ?? 0) > 0,
        );

      let finalManagers = managersNormalized;
      let finalFieldOfficers = fieldOfficersTmp;

      if (managersCount <= 1 && !hasAnyFieldOfficer) {
        // IMPORTANT: Don't block UI. Run the heavy fallback in background.
        void (async () => {
          try {
            const response = await api.get(
              `${import.meta.env.VITE_API_BASE_URL || "https://cropeye-backendd.up.railway.app/api"}/users/owner-hierarchy/`,
            );
            if (hierarchyRequestIdRef.current !== requestId) return;

            const responseData = response.data;
            const fallbackManagersTmp = Array.isArray(responseData?.managers)
              ? responseData.managers
              : Array.isArray(responseData?.results)
                ? responseData.results
                : [];

            const fallbackFieldOfficersTmp = (
              fallbackManagersTmp || []
            ).flatMap((m: any) =>
              (Array.isArray(m?.field_officers) ? m.field_officers : []).map(
                (fo: any) => ({
                  ...fo,
                  manager_id: fo?.manager_id ?? fo?.manager?.id ?? m?.id,
                }),
              ),
            );

            const fallbackManagersNormalized = (fallbackManagersTmp || []).map(
              (m: any) => {
                const mid = m?.id ?? m?.user_id ?? null;
                const count = (fallbackFieldOfficersTmp || []).filter(
                  (fo: any) => {
                    const foMid =
                      fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? null;
                    return (
                      mid != null &&
                      foMid != null &&
                      String(foMid) === String(mid)
                    );
                  },
                ).length;
                return {
                  ...m,
                  field_officers_count:
                    m?.field_officers_count ?? count,
                };
              },
            );

            setManagers(fallbackManagersNormalized);
            setTeamFieldOfficersRaw(fallbackFieldOfficersTmp);
            setCache(HIERARCHY_CACHE_KEY, {
              managers: fallbackManagersNormalized,
              fieldOfficers: fallbackFieldOfficersTmp,
            });
          } catch {
            // Keep whatever we already computed.
          }
        })();
      }

      if (import.meta.env.DEV) {
        console.log("[OwnerFarmDash] hierarchy final:", {
          managersCount: finalManagers.length,
          managersPreview: finalManagers.slice(0, 5).map((m: any) => ({
            id: m?.id ?? m?.user_id,
            name: `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim(),
            foCount: m?.field_officers_count ?? 0,
          })),
          fieldOfficersCount: (finalFieldOfficers || []).length,
        });
      }

      setManagers(finalManagers);
      setTeamFieldOfficersRaw(finalFieldOfficers);
      setCache(HIERARCHY_CACHE_KEY, {
        managers: finalManagers,
        fieldOfficers: finalFieldOfficers,
      });

      // Manager-first loading: do not auto-select manager on first load.
      setSelectedManagerId("");
    } catch (error: any) {
      console.error("Owner hierarchy load failed:", error?.message || error);
      setManagers([]);
      setTeamFieldOfficersRaw([]);
    } finally {
      setLoadingHierarchy(false);
    }
  };

  // Fetch plots from API - No longer needed, plots come from farmers data
  // const fetchPlots = async (): Promise<void> => {
  //   setLoadingPlots(true);
  //   try {
  //     const response = await axios.get(`${BASE_URL}/plots`);
  //     setPlots(response.data);
  //   } catch (error) {
  //     console.error("Error fetching plots:", error);
  //   } finally {
  //     setLoadingPlots(false);
  //   }
  // };

  // Fetch plot coordinates immediately when plot is selected
  const fetchPlotCoordinates = async (plotId: string): Promise<void> => {
    // Check cache first
    if (plotCoordinatesCache.has(plotId)) {
      const cachedCoords = plotCoordinatesCache.get(plotId);
      if (cachedCoords && cachedCoords.length > 0) {
        setPlotCoordinates(cachedCoords);
        // Calculate center from coordinates
        const center = calculateCenter(cachedCoords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1);
        return;
      }
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await axios.post(
        `${BASE_URL}/analyze?plot_name=${plotId}&date=${today}`,
      );

      const geom = response.data?.features?.[0]?.geometry?.coordinates?.[0];
      if (geom) {
        const coords = geom.map(([lng, lat]: [number, number]) => [lat, lng]);
        setPlotCoordinates(coords);

        // Cache the coordinates
        setPlotCoordinatesCache((prev) => new Map(prev.set(plotId, coords)));

        // Calculate and set map center
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1);
      }
    } catch (error) {}
  };

  // Calculate center point from coordinates
  const calculateCenter = (coords: [number, number][]): [number, number] => {
    if (coords.length === 0) return [17.5789, 75.053];

    const sumLat = coords.reduce((sum, [lat]) => sum + lat, 0);
    const sumLng = coords.reduce((sum, [, lng]) => sum + lng, 0);

    return [sumLat / coords.length, sumLng / coords.length];
  };

  // Aggregation logic (same as FarmerDashboard)
  const aggregateDataByPeriod = (
    data: LineChartData[],
    period: TimePeriod,
  ): LineChartData[] => {
    if (period === "daily") {
      if (data.length < 2) return data;
      const sorted = [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const last = sorted[sorted.length - 1];
      const secondLast = sorted[sorted.length - 2];
      return [secondLast, last];
    }
    const groupedData: { [key: string]: LineChartData[] } = {};
    data.forEach((item) => {
      const date = new Date(item.date);
      let key: string;
      switch (period) {
        case "weekly":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split("T")[0];
          break;
        case "monthly":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
            2,
            "0",
          )}`;
          break;
        case "yearly":
          return;
        default:
          key = item.date;
      }
      if (!groupedData[key]) {
        groupedData[key] = [];
      }
      groupedData[key].push(item);
    });
    if (period === "yearly") {
      return [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    }
    return Object.entries(groupedData)
      .map(([key, items]) => {
        const avgGrowth =
          items.reduce((sum, item) => sum + item.growth, 0) / items.length;
        const avgStress =
          items.reduce((sum, item) => sum + item.stress, 0) / items.length;
        const avgWater =
          items.reduce((sum, item) => sum + item.water, 0) / items.length;
        const avgMoisture =
          items.reduce((sum, item) => sum + item.moisture, 0) / items.length;
        let displayDate: string;
        if (period === "monthly") {
          const [year, month] = key.split("-");
          displayDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
          ).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = key;
        }
        return {
          date: key,
          displayDate,
          growth: avgGrowth,
          stress: avgStress,
          water: avgWater,
          moisture: avgMoisture,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Utility functions
  const toggleLine = (key: string): void => {
    const isOnlyThis = Object.keys(visibleLines).every((k) =>
      k === key
        ? visibleLines[k as keyof VisibleLines]
        : !visibleLines[k as keyof VisibleLines],
    );

    if (isOnlyThis) {
      setVisibleLines({
        growth: true,
        stress: true,
        water: true,
        moisture: true,
      });
    } else {
      setVisibleLines({
        growth: key === "growth",
        stress: key === "stress",
        water: key === "water",
        moisture: key === "moisture",
      });
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStressColor = (stress: number): string => {
    if (stress < 0.1) return "#dc2626";
    if (stress < 0.15) return "#f97316";
    return "#eab308";
  };

  const getStressSeverityLabel = (stress: number): string => {
    if (stress < 0.1) return "High";
    if (stress < 0.15) return "Medium";
    return "Low";
  };

  const CustomStressDot: React.FC<CustomStressDotProps> = (props) => {
    const { cx, cy, payload } = props;

    if (!payload || !payload.isStressEvent) return null;

    const color = getStressColor(payload.stressLevel);
    const radius =
      payload.stressLevel < 0.1 ? 10 : payload.stressLevel < 0.15 ? 8 : 6;

    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={radius + 1}
          fill="white"
          stroke={color}
          strokeWidth={2}
          fillOpacity={0.9}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={color}
          fillOpacity={0.8}
          stroke={color}
          strokeWidth={1}
        />
      </g>
    );
  };

  const fetchNDREStressEvents = async (): Promise<void> => {
    if (!selectedPlotId) {
      return;
    }

    try {
      const data = await makeRequestWithRetry(
        `${BASE_URL}/plots/${selectedPlotId}/stress?index_type=NDRE&threshold=0.15`,
        1,
        15000,
      );
      setNdreStressEvents(data.events ?? []);
      setShowNDREEvents(true);
    } catch (err: any) {
      // Optionally show user-friendly error message
      if (err.message) {
      }
    }
  };

  // Map auto-center component (from Harvest Dashboard)
  function MapAutoCenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  }

  const getPlotBorderStyle = () => ({
    color: "#ffffff",
    fillColor: "#10b981",
    weight: 3,
    opacity: 1,
    fillOpacity: 0.3,
  });

  // Biomass data setup (same as FarmerDashboard)
  const currentBiomass = metrics.biomass || 0;
  const totalBiomass = metrics.totalBiomass || 0;

  const biomassData = [
    {
      name: "Total Biomass",
      value: totalBiomass,
      fill: "#3b82f6",
    },
    {
      name: "Underground Biomass",
      value: currentBiomass,
      fill: "#10b981",
    },
  ];

  // Recovery Rate Comparison data (matching FarmerDashboard)
  const recoveryComparisonData = [
    {
      name: "Your Farm",
      value: metrics.recovery || 0,
      fill: "#10b981",
      label: "Your Recovery Rate",
    },
    {
      name: "Regional Average",
      value: OTHER_FARMERS_RECOVERY.regional_average,
      fill: "#3b82f6",
      label: "Regional Average",
    },
    {
      name: "Top 25%",
      value: OTHER_FARMERS_RECOVERY.top_quartile,
      fill: "#22c55e",
      label: "Top Quartile",
    },
    {
      name: "Similar Farms",
      value: OTHER_FARMERS_RECOVERY.similar_farms,
      fill: "#f59e0b",
      label: "Similar Farms",
    },
  ];

  // Time period toggle component
  const TimePeriodToggle: React.FC = () => (
    <div className="flex flex-wrap gap-1 mb-3">
      {(["daily", "weekly", "monthly", "yearly"] as TimePeriod[]).map(
        (period) => (
          <button
            key={period}
            onClick={() => setTimePeriod(period)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
              timePeriod === period
                ? "bg-blue-500 text-white shadow-md transform scale-105"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm"
            }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ),
      )}
    </div>
  );

  // Enhanced chart legend
  const ChartLegend: React.FC = () => (
    <div className="flex flex-wrap gap-1 text-xs font-medium mb-2">
      {Object.entries(lineStyles).map(([key, { color, label }]) => (
        <button
          key={key}
          onClick={() => toggleLine(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-200 ${
            visibleLines[key as keyof VisibleLines]
              ? "bg-white shadow-sm transform scale-105"
              : "bg-gray-100 opacity-50 hover:opacity-75"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-700 text-xs">{label}</span>
        </button>
      ))}
      {showNDREEvents && (
        <div className="flex items-center gap-1 ml-1 px-2 py-1 bg-orange-100 rounded-md border border-orange-300">
          <div className="w-2 h-2 rounded-full bg-orange-500 border border-orange-600"></div>
          <span className="text-orange-800 font-semibold text-xs">Stress</span>
        </div>
      )}
    </div>
  );

  // Custom tooltip component
  const CustomTooltip: React.FC<CustomTooltipProps> = ({
    active,
    payload,
    label,
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-200 rounded-lg shadow-lg backdrop-blur-sm">
          <p className="text-xs font-semibold text-gray-800 mb-1">
            {timePeriod === "monthly" ? label : formatDate(label || "")}
          </p>
          {payload.map((entry, index) => {
            let displayValue = "";
            let displayLabel = "";

            if (
              entry.dataKey === "stressLevel" &&
              entry.payload?.isStressEvent
            ) {
              displayValue = `${Number(entry.value).toFixed(
                4,
              )} (${getStressSeverityLabel(entry.value)})`;
              displayLabel = "NDRE Stress Level";
            } else if (lineStyles[entry.dataKey as keyof LineStyles]) {
              const value = entry.value;
              const numericValue =
                typeof value === "number" ? value : parseFloat(value);
              displayValue = !isNaN(numericValue)
                ? numericValue.toFixed(4)
                : "N/A";
              displayLabel =
                lineStyles[entry.dataKey as keyof LineStyles]?.label ||
                entry.dataKey;
            } else {
              return null;
            }

            return (
              <div key={index} className="flex items-center gap-1 mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-gray-600">
                  {displayLabel}: {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  // Gauge component
  const PieChartWithNeedle: React.FC<PieChartWithNeedleProps> = ({
    value,
    max,
    width = 200,
    height = 120,
    title = "Gauge",
    unit = "",
  }) => {
    const percent = Math.max(0, Math.min(1, value / max));
    const angle = 180 * percent;
    const cx = width / 2;
    const cy = height * 0.8;
    const r = width * 0.35;
    const needleLength = r * 0.9;
    const needleAngle = 180 - angle;
    const rad = (Math.PI * needleAngle) / 180;
    const x = cx + needleLength * Math.cos(rad);
    const y = cy - needleLength * Math.sin(rad);

    const getColor = (percent: number): string => {
      if (percent < 0.3) return "#ef4444";
      if (percent < 0.6) return "#f97316";
      if (percent < 0.8) return "#eab308";
      return "#10b981";
    };

    return (
      <div className="flex flex-col items-center">
        <svg width={width} height={height} className="overflow-visible">
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${
              cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180)
            } ${cy - r * Math.sin(Math.PI - (angle * Math.PI) / 180)}`}
            fill="none"
            stroke={getColor(percent)}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="#374151"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="4" fill="#374151" />
          <text
            x={cx}
            y={cy - r - 15}
            textAnchor="middle"
            className="text-lg font-bold fill-gray-700"
          >
            {value.toFixed(1)} {unit}
          </text>
        </svg>
        <p className="text-sm text-gray-600 mt-2 font-medium">{title}</p>
      </div>
    );
  };

  // IMPORTANT: Do not block the whole UI on hierarchy loading.
  // Dropdowns will show "Loading..." until data arrives.
  // This avoids long full-screen spinners for Owner dashboard.

  // const totalFarmers = fieldOfficers.reduce(
  //   (acc, officer) => acc + (officer.farmers?.length || 0),
  //   0
  // );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Enhanced Header */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
        {/* Debug Info Panel */}
        {showDebugInfo && (
          <div className="mb-6 bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-700">
            <h3 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Debug Information - API Request Details
            </h3>
            <div className="bg-black rounded-lg p-3 overflow-auto max-h-96">
              <pre className="text-xs text-green-300 font-mono">
                {JSON.stringify(
                  {
                    endpoint: `${import.meta.env.VITE_API_BASE_URL || "https://cropeye-backendd.up.railway.app/api"}/farms/recent-farmers/`,
                    method: "GET",
                    bearerToken: localStorage.getItem("token")
                      ? "✅ Present"
                      : "❌ Missing",
                    tokenPreview:
                      localStorage.getItem("token")?.substring(0, 30) + "...",
                    // totalFarmers: farmers.length,
                    selectedFarmer: selectedFarmerId,
                    selectedPlot: selectedPlotId,
                    farmersList: farmersForSelectedOfficer.map((f: any) => ({
                      id: f.id || f.farmer_id,
                      name:
                        `${f.first_name || ""} ${f.last_name || ""}`.trim() ||
                        f.name,
                      email: f.email,
                      plots: f.plots?.length || f.plot_ids?.length || 0,
                    })),
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 Check the browser console for detailed API request/response
              logs
            </p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center w-full lg:w-auto">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Managers ({managers.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedManagerId}
                    onChange={(e) => setSelectedManagerId(e.target.value)}
                    disabled={loadingHierarchy}
                  >
                    {loadingHierarchy ? (
                      <option>Loading...</option>
                    ) : managers.length === 0 ? (
                      <option>No managers found</option>
                    ) : (
                      <>
                        <option value="">Select a manager</option>
                        {managers.map((manager) => (
                          <option
                            key={`manager-${manager.id}`}
                            value={manager.id}
                          >
                            {manager.first_name} {manager.last_name} (
                            {manager.field_officers_count ??
                              manager.field_officers?.length ??
                              (manager.field_officers_count === 0 ? 0 : "—")}{" "}
                            FOs)
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Field Officer ({fieldOfficers.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedFieldOfficerId}
                    onChange={(e) => setSelectedFieldOfficerId(e.target.value)}
                    disabled={!selectedManagerId || fieldOfficers.length === 0}
                  >
                    {!selectedManagerId ? (
                      <option>Select a manager first</option>
                    ) : fieldOfficers.length === 0 ? (
                      <option>No officers found</option>
                    ) : (
                      <>
                        <option value="">Select an officer</option>
                        {fieldOfficers.map((officer) => (
                          <option
                            key={`officer-${officer.id}`}
                            value={officer.id}
                          >
                            {officer.first_name} {officer.last_name} (
                            {officer.farmers?.length || 0} farmers)
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Farmers (
                    {farmersForSelectedOfficer.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedFarmerId}
                    onChange={(e) => {
                      setSelectedFarmerId(e.target.value);
                    }}
                    disabled={
                      !selectedFieldOfficerId ||
                      farmersForSelectedOfficer.length === 0
                    }
                  >
                    {!selectedFieldOfficerId ? (
                      <option>Select an officer first</option>
                    ) : loadingHierarchy ? (
                      <option>Loading farmers...</option>
                    ) : farmersForSelectedOfficer.length === 0 ? (
                      <option>No farmers found</option>
                    ) : (
                      <>
                        <option value="">Select a farmer</option>
                        {farmersForSelectedOfficer.map((farmer, index) => {
                          const farmerId = String(farmer.id);
                          const farmerName =
                            `${farmer.first_name} ${farmer.last_name}`.trim();
                          const plotsCount = farmer.plots?.length || 0;

                          return (
                            <option key={`farmer-${farmerId}`} value={farmerId}>
                              {farmerName} ({plotsCount} plot
                              {plotsCount !== 1 ? "s" : ""})
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Plots ({plots.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedPlotId}
                    onChange={(e) => {
                      const newPlotId = e.target.value;
                      setSelectedPlotId(newPlotId);
                      if (newPlotId) {
                        // Immediately fetch coordinates and update map
                        fetchPlotCoordinates(newPlotId);
                      }
                    }}
                    disabled={!selectedFarmerId || plots.length === 0}
                  >
                    {!selectedFarmerId ? (
                      <option value="">Select farmer first</option>
                    ) : plots.length === 0 ? (
                      <option value="">No plots available</option>
                    ) : (
                      <>
                        <option value="">Select a plot</option>
                        {plots.map((plotId, index) => {
                          return (
                            <option
                              key={`plot-${plotId}-${index}`}
                              value={plotId}
                            >
                              Plot: {plotId}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gradient-to-r from-gray-100 to-blue-50 px-4 py-3 rounded-lg ">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-medium">
              {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Top Priority Metrics - 4 Key Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-green-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <MapPin className="w-6 h-6 text-green-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.area?.toFixed(2) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-green-600">acre</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Field Area</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-emerald-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Leaf className="w-6 h-6 text-emerald-600" />
              <div className="text-right">
                <div className="text-lg font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.growthStage || "-"
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium mt-7">
              Crop Stage
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-orange-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-6 h-6 text-orange-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : metrics.growthStage?.toLowerCase().includes("harvested") ? (
                    0
                  ) : metrics.daysToHarvest !== null ? (
                    metrics.daysToHarvest
                  ) : (
                    "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-orange-600">
                  Days
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Days to Harvest</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-blue-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Beaker className="w-6 h-6 text-blue-600" />
              <div className="text-right">
                <div className="text-xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {metrics.brix || "-"}
                      <span className="text-xl font-bold text-blue-600">
                        {"\u00B0"}Brix(Avg)
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xl text-gray-600">
              <p className="text-xs text-gray-600 font-medium">Sugar Content</p>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="font-semibold text-red-600">
                    {loadingData ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      metrics.brixMax || "-"
                    )}
                  </div>
                  <div className="text-gray-500">Max</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-600">
                    {loadingData ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      metrics.brixMin || "-"
                    )}
                  </div>
                  <div className="text-gray-500">Min</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-purple-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-6 h-6 text-purple-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.recovery?.toFixed(1) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-purple-600">%</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Recovery Rate</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-indigo-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.expectedYield?.toFixed(0) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-indigo-600">
                  T/acre
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Expected Yield</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-teal-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Thermometer className="w-6 h-6 text-teal-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.organicCarbonDensity?.toFixed(1) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-teal-600">g/kg</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Organic Carbon</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-cyan-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Droplets className="w-6 h-6 text-cyan-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    (metrics.irrigationEvents ?? 0)
                  )}
                </div>
                <div className="text-sm font-semibold text-cyan-600">
                  Events
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">
              Irrigation Events
            </p>
          </div>

          <button
            onClick={fetchNDREStressEvents}
            onDoubleClick={() => setShowNDREEvents(!showNDREEvents)}
            className="w-full"
          >
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-red-200 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-5 h-5 text-red-600" />
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-800">
                    {loadingData ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      (metrics.stressCount ?? 0)
                    )}
                  </div>
                  <div className="text-xs font-semibold text-red-600">
                    Events
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600">Stress Events</p>
            </div>
          </button>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-pink-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-6 h-6 text-pink-600" />
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.biomass?.toFixed(1) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold text-pink-600">kg/acre</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 font-medium">Avg Biomass</p>
          </div>
        </div>

        {/* Map and Status Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg overflow-hidden">
            <div
              ref={mapWrapperRef}
              className="relative w-full h-[400px] sm:h-[400px] md:h-[450px] lg:h-[500px] xl:h-full min-h-[300px]"
            >
              {/* Fullscreen Toggle */}
              <div
                className="absolute top-4 right-4 z-20 bg-white text-gray-700 border border-gray-200 shadow-md p-2 rounded cursor-pointer hover:bg-gray-100 transition"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    mapWrapperRef.current?.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
              >
                <Maximize2 className="w-4 h-4" />
              </div>

              {/* Centered Growth Stage Indicator */}
              <div className="absolute top-10 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <div className="bg-black/20 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/30 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                    <div className="text-center">
                      <div className="text-white font-bold text-lg drop-shadow-lg">
                        {metrics.growthStage ?? "Loading..."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <MapContainer
                key={mapKey}
                center={mapCenter}
                zoom={16}
                minZoom={10}
                maxZoom={20}
                className="w-full h-full z-0"
                style={{
                  height: "100%",
                  width: "100%",
                  borderRadius: "inherit",
                  position: "relative",
                }}
              >
                <MapAutoCenter center={mapCenter} />
                <TileLayer
                  url="http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  attribution="© Google"
                  maxZoom={20}
                  maxNativeZoom={18}
                  minZoom={10}
                  tileSize={256}
                  zoomOffset={0}
                  updateWhenZooming={false}
                  updateWhenIdle={true}
                />
                {plotCoordinates.length > 0 && (
                  <Polygon
                    positions={plotCoordinates}
                    pathOptions={getPlotBorderStyle()}
                  >
                    <LeafletTooltip
                      direction="top"
                      offset={[0, -10]}
                      opacity={0.9}
                      sticky
                    >
                      <div className="text-sm">
                        <p>
                          <strong>Plot:</strong> {selectedPlotId}
                        </p>
                        {/* <p>
                          <strong>Farmer:</strong> Ramesh Patil
                        </p>
                        <p>
                          <strong>Representative:</strong> Sunil Joshi
                        </p> */}
                        <p>
                          <strong>Status:</strong>{" "}
                          {metrics.growthStage ?? "Loading..."}
                        </p>
                        <p>
                          <strong>Area:</strong> {metrics.area ?? "Loading..."}{" "}
                          Ha
                        </p>
                      </div>
                    </LeafletTooltip>
                  </Polygon>
                )}
              </MapContainer>
            </div>
          </div>

          {/* Performance Gauges */}
          <div className="space-y-4">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-800">
                  Sugarcane Yield Projection
                </h3>
              </div>
              <div className="flex flex-col items-center">
                <PieChartWithNeedle
                  value={metrics.expectedYield || 0}
                  max={metrics.sugarYieldMax || 400}
                  title="Sugarcane Yield Forecast"
                  unit=" T/acre"
                  width={260}
                  height={130}
                />
                <div className="mt-2 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-red-500"></div>
                      <span className="text-red-700 font-semibold">
                        min: {(metrics.sugarYieldMin || 0).toFixed(1)} T/acre
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-purple-500"></div>
                      <span className="text-purple-700 font-semibold">
                        mean: {(metrics.expectedYield || 0).toFixed(1)}{" "}
                        T/acre
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-green-500"></div>
                      <span className="text-green-700 font-semibold">
                        max: {(metrics.sugarYieldMax || 0).toFixed(1)} T/acre
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Performance:{" "}
                    {metrics.sugarYieldMax
                      ? (((metrics.expectedYield || 0) / metrics.sugarYieldMax) * 100).toFixed(1)
                      : "0.0"}% of optimal yield
                  </div>
                </div>
              </div>
            </div>

            {/* Biomass Performance */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                  Biomass Performance
                </h3>
              </div>
              <div className="h-48 sm:h-56 md:h-64 flex flex-col items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={biomassData}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      outerRadius={110}
                      innerRadius={70}
                      dataKey="value"
                      labelLine={false}
                    >
                      {biomassData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <text
                      x="50%"
                      y="70%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-base sm:text-lg font-semibold fill-blue-600"
                    >
                      {totalBiomass.toFixed(1)} T/acre
                    </text>
                    <Tooltip
                      wrapperStyle={{ zIndex: 50 }}
                      contentStyle={{ fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)} T/acre`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm sm:text-base text-gray-700 font-medium text-center mb-3">
                Biomass Distribution Chart
              </p>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 text-sm sm:text-base flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-blue-500"></div>
                    <span className="text-blue-700 font-semibold">
                      Total: {totalBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-green-500"></div>
                    <span className="text-green-700 font-semibold">
                      Underground: {currentBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recovery Rate Comparison */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3">
                <div className="flex items-center gap-2 mb-2 lg:mb-0">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Recovery Rate Comparison
                  </h3>
                </div>
              </div>
              <div className="h-36 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={recoveryComparisonData}
                    margin={{ top: 1, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} height={10} />
                    <YAxis tick={{ fontSize: 8 }} domain={[0, 10]} />
                    <Tooltip
                      formatter={(value: number) => [
                        `${value.toFixed(1)}%`,
                        "Recovery Rate",
                      ]}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]}>
                      {recoveryComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-center text-xs text-gray-600">
                <span className="font-semibold text-green-700">
                  Your Farm: {(metrics.recovery || 0).toFixed(1)}%
                </span>
                {" vs "}
                <span className="font-semibold text-blue-700">
                  Regional Avg:{" "}
                  {OTHER_FARMERS_RECOVERY.regional_average.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Field Indices Analysis Chart */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3">
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <LineChartIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-800">
                Field Indices Analysis
              </h3>
            </div>
            <TimePeriodToggle />
          </div>

          <ChartLegend />

          <div className="h-80 sm:h-96 md:h-[28rem] bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg px-0 sm:px-3 -mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={combinedChartData}
                margin={{ top: 10, right: 6, left: 9, bottom: 10 }}
                layout={isMobile ? "vertical" : "horizontal"}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                {isMobile ? (
                  <>
                    <XAxis
                      type="number"
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey={
                        timePeriod === "monthly" ? "displayDate" : "date"
                      }
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey={
                        timePeriod === "monthly" ? "displayDate" : "date"
                      }
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                )}
                <Tooltip content={<CustomTooltip />} />

                {/* Performance zone annotations - Dynamic based on visible indices */}
                {(() => {
                  // Define ranges for each index type
                  const indexRanges = {
                    water: { good: [0.4, 0.8], bad: [-0.3, -0.75] },
                    moisture: { good: [-0.25, 0.8], bad: [-0.6, -0.75] },
                    growth: { good: [0.2, 0.8], bad: [0.15, -0.75] },
                    stress: { good: [0.35, 0.8], bad: [0.2, -0.75] },
                  };

                  // Count visible indices
                  const visibleCount = Object.values(visibleLines).filter(
                    (v) => v,
                  ).length;

                  let goodRange: [number, number] = [0.3, 0.6]; // Default values
                  let badRange: [number, number] = [-0.1, 0.1]; // Default values
                  let labelText = "Average";

                  if (visibleCount === 1) {
                    // Single index selected - use its specific range
                    const selectedIndex = Object.keys(visibleLines).find(
                      (key) => visibleLines[key as keyof VisibleLines],
                    );
                    if (
                      selectedIndex &&
                      indexRanges[selectedIndex as keyof typeof indexRanges]
                    ) {
                      const range =
                        indexRanges[selectedIndex as keyof typeof indexRanges];
                      goodRange = range.good as [number, number];
                      badRange = range.bad as [number, number];
                      labelText =
                        selectedIndex.charAt(0).toUpperCase() +
                        selectedIndex.slice(1);
                    }
                  } else {
                    // Multiple or no indices - use averaged ranges
                    const allGoodRanges = Object.values(indexRanges).map(
                      (r) => r.good,
                    );
                    const allBadRanges = Object.values(indexRanges).map(
                      (r) => r.bad,
                    );

                    const avgGoodMin =
                      allGoodRanges.reduce((sum, [min]) => sum + min, 0) /
                      allGoodRanges.length;
                    const avgGoodMax =
                      allGoodRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allGoodRanges.length;
                    const avgBadMin =
                      allBadRanges.reduce((sum, [min]) => sum + min, 0) /
                      allBadRanges.length;
                    const avgBadMax =
                      allBadRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allBadRanges.length;

                    goodRange = [avgGoodMin, avgGoodMax] as [number, number];
                    badRange = [avgBadMin, avgBadMax] as [number, number];
                    labelText = "Average";
                  }

                  return (
                    <>
                      {isMobile ? (
                        <>
                          <ReferenceArea
                            x1={goodRange[0]}
                            x2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            x1={badRange[0]}
                            x2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      ) : (
                        <>
                          <ReferenceArea
                            y1={goodRange[0]}
                            y2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            y1={badRange[0]}
                            y2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      )}
                      {isMobile ? (
                        <>
                          {/* Mobile: two-line labels using tspans */}
                          <text
                            x="79"
                            y="25%"
                            textAnchor="middle"
                            className="text-xs font-left fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan x="79%" dy="0">
                              Average
                            </tspan>
                            <tspan x="79%" dy="12">
                              Good ({goodRange[0].toFixed(2)} -{" "}
                              {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="79%"
                            y="35%"
                            textAnchor="middle"
                            className="text-xs font-right fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan x="30%" dy="0">
                              Average
                            </tspan>
                            <tspan x="35%" dy="12">
                              Bad ({badRange[0].toFixed(2)} -{" "}
                              {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x="95%"
                            y="25%"
                            textAnchor="end"
                            className="text-xs font-medium fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            {labelText} Good ({goodRange[0].toFixed(2)} -{" "}
                            {goodRange[1].toFixed(2)})
                          </text>
                          <text
                            x="95%"
                            y="75%"
                            textAnchor="end"
                            className="text-xs font-medium fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            {labelText} Bad ({badRange[0].toFixed(2)} -{" "}
                            {badRange[1].toFixed(2)})
                          </text>
                        </>
                      )}
                    </>
                  );
                })()}

                {showStressEvents &&
                  stressEvents.map((event, index) => (
                    <React.Fragment key={index}>
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.from_date }
                          : { x: event.from_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `Start: ${formatDate(event.from_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.to_date }
                          : { x: event.to_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `End: ${formatDate(event.to_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      {isMobile ? (
                        <ReferenceArea
                          y1={event.from_date}
                          y2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      ) : (
                        <ReferenceArea
                          x1={event.from_date}
                          x2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      )}
                    </React.Fragment>
                  ))}

                {visibleLines.growth && (
                  <Line
                    type="monotone"
                    dataKey="growth"
                    stroke={lineStyles.growth.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.growth.color }}
                    activeDot={{ r: 4, fill: lineStyles.growth.color }}
                  />
                )}
                {visibleLines.stress && (
                  <Line
                    type="monotone"
                    dataKey="stress"
                    stroke={lineStyles.stress.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.stress.color }}
                    activeDot={{ r: 4, fill: lineStyles.stress.color }}
                  />
                )}
                {visibleLines.water && (
                  <Line
                    type="monotone"
                    dataKey="water"
                    stroke={lineStyles.water.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.water.color }}
                    activeDot={{ r: 4, fill: lineStyles.water.color }}
                  />
                )}
                {visibleLines.moisture && (
                  <Line
                    type="monotone"
                    dataKey="moisture"
                    stroke={lineStyles.moisture.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.moisture.color }}
                    activeDot={{ r: 4, fill: lineStyles.moisture.color }}
                  />
                )}

                {showNDREEvents && (
                  <Scatter
                    dataKey="stressLevel"
                    fill="#f97316"
                    shape={<CustomStressDot />}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerFarmDash;
