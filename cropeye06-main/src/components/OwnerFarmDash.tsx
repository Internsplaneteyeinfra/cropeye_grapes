import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Activity,
  Target,
  BarChart3,
  LineChart as LineChartIcon,
  Users,
  MapPin,
  Beaker,
  Maximize2,
  Leaf,
  CloudSun,
  Star,
  Gauge,
  Sprout,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import {
  getBackendApiBaseUrl,
  getEventsBaseUrl,
  getGrapesAdminBaseUrl,
} from "../utils/serviceUrls";
import {
  fetchGrapesPlotDashboardData,
  grapesPlotFormBody,
  ripeningMilestonesFromPayload,
} from "../utils/grapesEventsBundle";
import {
  fetchRipeningStageMilestones,
  formatMilestoneDate,
} from "../utils/ripeningMilestones";
import {
  RECOVERY_QUALITY_CHART_PLOT_H,
  type VigourPixelPct,
  parseCanopyVigourPixelSummary,
  vigourToBarRows,
  dominantVigourCategory,
} from "../utils/canopyVigour";
import {
  getFieldOfficersByManager,
  loadOwnerFieldOfficers,
} from "../api";
import { fetchGrapesOwnerFarmersByFieldOfficer } from "../api/grapesOwnerHierarchy";
import {
  getStoredUserIndustry,
  isGrapesIndustry,
} from "../utils/userIndustry";

/** Prefer non-empty arrays; unwrap {results|data|farmers|items}. */
function pickArray(...candidates: unknown[]): any[] {
  let fallback: any[] | null = null;
  for (const c of candidates) {
    if (Array.isArray(c)) {
      if (c.length > 0) return c;
      if (fallback == null) fallback = c;
      continue;
    }
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      for (const key of [
        "results",
        "data",
        "farmers",
        "farmer_list",
        "field_officers",
        "fieldOfficers",
        "items",
        "users",
      ]) {
        const nested = obj[key];
        if (Array.isArray(nested) && nested.length > 0) return nested;
        if (Array.isArray(nested) && fallback == null) fallback = nested;
      }
    }
  }
  return fallback ?? [];
}

function managerKey(m: any): string | null {
  const id = m?.id ?? m?.user_id ?? m?.userId ?? null;
  return id == null || id === "" ? null : String(id);
}

function extractNestedOfficers(manager: any): any[] {
  return pickArray(
    manager?.field_officers,
    manager?.fieldOfficers,
    manager?.fo_list,
    manager?.field_officer_list,
    manager?.field_officer,
    manager?.officers,
  );
}

function extractNestedFarmers(officer: any): any[] {
  return pickArray(
    officer?.farmers,
    officer?.farmer_list,
    officer?.farmer,
    officer?.assigned_farmers,
    officer?.farmer_details,
    officer?.farmer_profiles,
    officer?.my_farmers,
    officer?.farmer_set,
    officer?.all_farmers,
    // only use users if they look like farmers (have plots or farmer role)
    Array.isArray(officer?.users)
      ? officer.users.filter(
          (u: any) =>
            Array.isArray(u?.plots) ||
            Array.isArray(u?.plot_list) ||
            String(u?.role || u?.role_name || "").toLowerCase().includes("farmer") ||
            u?.farmer_id != null ||
            u?.phone_number != null,
        )
      : null,
  ).map((farmer: any) => {
    const user =
      farmer?.user && typeof farmer.user === "object" ? farmer.user : null;
    return {
      ...user,
      ...farmer,
      id:
        farmer?.id ??
        farmer?.farmer_id ??
        farmer?.farmerId ??
        farmer?.user_id ??
        user?.id,
      first_name: farmer?.first_name ?? user?.first_name ?? farmer?.name,
      last_name: farmer?.last_name ?? user?.last_name ?? "",
      plots: pickArray(
        farmer?.plots,
        farmer?.plot_list,
        farmer?.plot,
        farmer?.farms,
        user?.plots,
      ),
    };
  });
}

function normalizeOfficer(fo: any, managerId: string | null): any {
  const createdById =
    fo?.created_by?.id ??
    (typeof fo?.created_by === "number" || typeof fo?.created_by === "string"
      ? fo.created_by
      : null) ??
    fo?.created_by_id ??
    null;

  return {
    ...fo,
    id: fo?.id ?? fo?.user_id ?? fo?.userId,
    manager_id:
      fo?.manager_id ??
      fo?.manager?.id ??
      fo?.managerId ??
      fo?.manager_id_number ??
      createdById ??
      managerId,
    farmers: extractNestedFarmers(fo),
  };
}

// Constants (same as FarmerDashboard)
const BASE_URL = getEventsBaseUrl();

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
  biomassMax: number | null;
  biomassMin: number | null;
  totalBiomass: number | null;
  stressCount: number | null;
  stressTotalDays: number | null;
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
  sugarYieldMean: number | null;
  fieldScore: number | null;
  cci: number | null;
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
  const [managers, setManagers] = useState<any[]>([]);
  const [teamFieldOfficersRaw, setTeamFieldOfficersRaw] = useState<any[]>([]);
  const teamFieldOfficersRawRef = useRef<any[]>([]);
  teamFieldOfficersRawRef.current = teamFieldOfficersRaw;
  const [fieldOfficers, setFieldOfficers] = useState<any[]>([]);
  const [loadingFieldOfficers, setLoadingFieldOfficers] = useState(false);
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const [farmersForSelectedOfficer, setFarmersForSelectedOfficer] = useState<
    any[]
  >([]);
  /** Top-level farmers from last owner-hierarchy?manager_id= response */
  const [hierarchyFarmers, setHierarchyFarmers] = useState<any[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [showDebugInfo] = useState(false);
  void showDebugInfo;

  const lineStyles: LineStyles = {
    growth: { color: "#22c55e", label: "Growth Index" },
    stress: { color: "#ef4444", label: "Crop Stress Index (CSI)" },
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
    biomassMax: null,
    biomassMin: null,
    totalBiomass: null,
    stressCount: null,
    stressTotalDays: null,
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
    sugarYieldMean: null,
    fieldScore: null,
    cci: null,
  });

  const [stressEvents, setStressEvents] = useState<StressEvent[]>([]);
  const [showStressEvents] = useState<boolean>(false);
  const [ndreStressEvents, setNdreStressEvents] = useState<StressEvent[]>([]);
  const [showNDREEvents, setShowNDREEvents] = useState<boolean>(false);
  const [milestoneState, setMilestoneState] = useState<{
    ripeningStartDate: string | null;
    harvestReadyStartDate: string | null;
    loading: boolean;
    error: boolean;
  }>({
    ripeningStartDate: null,
    harvestReadyStartDate: null,
    loading: false,
    error: false,
  });
  const [combinedChartData, setCombinedChartData] = useState<LineChartData[]>(
    [],
  );
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("yearly");
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

  // Grapes owner: load managers (then FOs after manager pick) like sugarcane
  useEffect(() => {
    fetchOwnerFieldOfficers();
  }, []);

  // When manager changes: show that manager's FOs only (do not auto-select FO)
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

    let cancelled = false;

    (async () => {
      setLoadingFieldOfficers(true);
      const clearDownstream = () => {
        setSelectedFieldOfficerId("");
        setFarmersForSelectedOfficer([]);
        setSelectedFarmerId("");
        setPlots([]);
        setSelectedPlotId("");
      };

      const applyFilteredRaw = () => {
        const filtered = teamFieldOfficersRaw.filter((fo: any) => {
          const mid =
            fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? null;
          return mid != null && String(mid) === String(selectedManagerId);
        });
        setFieldOfficers(filtered);
        clearDownstream();
      };

      try {
        // Same as sugarcane: GET /users/owner-hierarchy/?manager_id=
        // (Do not call /users/owner-hierarchy/grapes/ here — Railway returns 404)
        try {
          const detail = await getFieldOfficersByManager(selectedManagerId);
          if (cancelled) return;
          const fos = Array.isArray(detail?.data?.field_officers)
            ? detail.data.field_officers
            : Array.isArray(detail?.data)
              ? detail.data
              : [];
          if (fos.length > 0) {
            setFieldOfficers(fos);
            clearDownstream();
            return;
          }
        } catch (hierErr) {
          console.warn(
            "OwnerFarmDash: owner-hierarchy?manager_id= failed",
            hierErr,
          );
        }

        if (cancelled) return;
        applyFilteredRaw();
      } catch (err) {
        console.error("OwnerFarmDash: failed to load FOs for manager", err);
        if (!cancelled) applyFilteredRaw();
      } finally {
        if (!cancelled) setLoadingFieldOfficers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedManagerId, teamFieldOfficersRaw]);

  // Ripening / Harvest milestones for selected plot
  useEffect(() => {
    if (!selectedPlotId) {
      setMilestoneState({
        ripeningStartDate: null,
        harvestReadyStartDate: null,
        loading: false,
        error: false,
      });
      return;
    }

    let cancelled = false;
    setMilestoneState((s) => ({ ...s, loading: true, error: false }));

    (async () => {
      try {
        const data = await fetchRipeningStageMilestones(BASE_URL, selectedPlotId);
        if (cancelled) return;
        const milestones = ripeningMilestonesFromPayload(data);
        setMilestoneState({
          ripeningStartDate: milestones.ripeningStartDate,
          harvestReadyStartDate: milestones.harvestReadyStartDate,
          loading: false,
          error: !(milestones.ripeningStartDate || milestones.harvestReadyStartDate),
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Ripening milestones fetch failed:", err);
        setMilestoneState({
          ripeningStartDate: null,
          harvestReadyStartDate: null,
          loading: false,
          error: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlotId]);

  // NEW: Function to set plot coordinates from existing state
  const setPlotCoordinatesFromState = (plotId: string): void => {
    // Find the selected farmer and their plot
    const farmer = farmersForSelectedOfficer.find(
      (f) => String(f.id) === selectedFarmerId,
    );
    const plot = pickArray(
      farmer?.plots,
      farmer?.plot_list,
      farmer?.plot,
      farmer?.farms,
    ).find(
      (p: any) =>
        String(p.fastapi_plot_id || p.plot_id || p.id || "") === String(plotId),
    );

    if (plot && plot.boundary?.coordinates) {
      const geom = plot.boundary.coordinates[0];
      if (geom) {
        // The API gives [lng, lat], Leaflet needs [lat, lng]
        const coords = geom.map(([lng, lat]: [number, number]) => [lat, lng]);
        setPlotCoordinates(coords);

        // Calculate and set map center
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1); // Force map re-render
      } else {
        setPlotCoordinates([]);
      }
    } else {
      setPlotCoordinates([]);
    }
  };

  // Farmers: nested on FO, else grapes farmers-by-field-officer API
  useEffect(() => {
    if (!selectedFieldOfficerId) {
      setFarmersForSelectedOfficer([]);
      setSelectedFarmerId("");
      setPlots([]);
      setSelectedPlotId("");
      setLoadingFarmers(false);
      return;
    }

    if (loadingFieldOfficers) return;

    let cancelled = false;

    (async () => {
      setLoadingFarmers(true);
      const officer = fieldOfficers.find(
        (fo) =>
          String(fo?.id) === String(selectedFieldOfficerId) ||
          String(fo?.user_id ?? "") === String(selectedFieldOfficerId),
      );
      let nestedFarmers = extractNestedFarmers(officer);

      if (
        nestedFarmers.length === 0 &&
        isGrapesIndustry(getStoredUserIndustry())
      ) {
        try {
          const foId = Number(selectedFieldOfficerId);
          if (!Number.isNaN(foId)) {
            const res = await fetchGrapesOwnerFarmersByFieldOfficer(foId);
            if (cancelled) return;
            nestedFarmers = res.farmers || [];
          }
        } catch (err) {
          console.error(
            "OwnerFarmDash: farmers-by-field-officer failed",
            err,
          );
        }
      }

      // Fallback: top-level farmers from same hierarchy response
      if (nestedFarmers.length === 0 && hierarchyFarmers.length > 0) {
        const foId = String(selectedFieldOfficerId);
        const linked = hierarchyFarmers.filter((farmer: any) => {
          const link =
            farmer?.field_officer_id ??
            farmer?.field_officer?.id ??
            farmer?.created_by?.id ??
            farmer?.created_by ??
            farmer?.created_by_id ??
            farmer?.fo_id;
          return link != null && String(link) === foId;
        });
        nestedFarmers = linked.length > 0 ? linked : hierarchyFarmers;
      }

      if (cancelled) return;
      setFarmersForSelectedOfficer(nestedFarmers);
      if (nestedFarmers.length > 0) {
        const firstId =
          nestedFarmers[0]?.id ??
          nestedFarmers[0]?.farmer_id ??
          nestedFarmers[0]?.farmerId;
        setSelectedFarmerId(firstId != null ? String(firstId) : "");
      } else {
        setSelectedFarmerId("");
        setPlots([]);
        setSelectedPlotId("");
      }
      setLoadingFarmers(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedFieldOfficerId,
    fieldOfficers,
    loadingFieldOfficers,
    hierarchyFarmers,
  ]);

  // Fetch plots when farmer is selected
  useEffect(() => {
    if (selectedFarmerId) {
      const selectedFarmer = farmersForSelectedOfficer.find(
        (f) =>
          String(f.id || f.farmer_id || f.farmerId) ===
          String(selectedFarmerId),
      );

      if (selectedFarmer) {
        const farmerPlots = pickArray(
          selectedFarmer.plots,
          selectedFarmer.plot_list,
          selectedFarmer.plot,
          selectedFarmer.farms,
        );
        const plotIds = farmerPlots
          .map(
            (plot: any) =>
              plot.fastapi_plot_id || plot.plot_id || plot.id || null,
          )
          .filter(Boolean)
          .map(String);

        setPlots(plotIds);

        if (plotIds.length > 0) {
          setSelectedPlotId(plotIds[0]);
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
          `CORS error: The server at ${new URL(url).origin
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

  // Fetch all data for selected plot — grapes bundle + indices (same as FarmerDashboard)
  const fetchAllData = async (): Promise<void> => {
    if (!selectedPlotId) return;

    setLoadingData(true);
    try {
      const selectedFarmer = farmersForSelectedOfficer.find(
        (f) =>
          String(f.id || f.farmer_id || f.farmerId) === String(selectedFarmerId),
      );
      const ownerProfile = selectedFarmer
        ? {
            plots: pickArray(
              selectedFarmer.plots,
              selectedFarmer.plot_list,
              selectedFarmer.plot,
              selectedFarmer.farms,
            ),
          }
        : null;

      const { metrics, lineChartData, stressEvents } =
        await fetchGrapesPlotDashboardData(
          selectedPlotId,
          ownerProfile,
          BASE_URL,
          { get: getCache, set: setCache },
        );

      setLineChartData(lineChartData);
      setStressEvents(stressEvents);
      setNdreStressEvents(stressEvents);
      setMetrics({
        brix: metrics.brix,
        brixMin: metrics.brixMin,
        brixMax: metrics.brixMax,
        recovery: metrics.recovery,
        area: metrics.area,
        biomass: metrics.biomass,
        biomassMax: metrics.biomassMax ?? null,
        biomassMin: metrics.biomassMin ?? null,
        totalBiomass: metrics.totalBiomass,
        stressCount: metrics.stressCount,
        stressTotalDays: metrics.stressTotalDays ?? 0,
        irrigationEvents: metrics.irrigationEvents,
        expectedYield: metrics.sugarYieldMean,
        daysToHarvest: metrics.daysToHarvest,
        growthStage: metrics.growthStage,
        soilPH: metrics.soilPH,
        organicCarbonDensity: metrics.organicCarbonDensity,
        actualYield: metrics.actualYield,
        cnRatio: null,
        sugarYieldMean: metrics.sugarYieldMean,
        sugarYieldMax: metrics.brixMax,
        sugarYieldMin: metrics.brixMin,
        fieldScore: metrics.fieldScore ?? null,
        cci: metrics.cci ?? null,
      });
    } catch (err: any) {
      console.error("OwnerFarmDash: failed to load plot data", err);
    } finally {
      setLoadingData(false);
    }
  };

  // Use working /users/owner-hierarchy/ (same as sugarcane).
  // Do NOT call /users/owner-hierarchy/grapes/ — not deployed on Railway (404).
  const fetchOwnerFieldOfficers = async (): Promise<void> => {
    setLoadingHierarchy(true);
    setLoadingFieldOfficers(true);
    setHierarchyError(null);

    const resetSelection = () => {
      setSelectedManagerId("");
      setSelectedFieldOfficerId("");
      setFarmersForSelectedOfficer([]);
      setSelectedFarmerId("");
      setPlots([]);
      setSelectedPlotId("");
      setHierarchyFarmers([]);
    };

    const applyHierarchyResult = (
      managersData: any[],
      officersData: any[],
      source: string,
    ) => {
      setManagers(managersData);
      setTeamFieldOfficersRaw(officersData);
      setHierarchyFarmers([]);

      if (managersData.length > 0) {
        setFieldOfficers([]);
        resetSelection();
        setHierarchyError(null);
        console.info(
          `OwnerFarmDash: loaded ${managersData.length} managers / ${officersData.length} FOs via ${source}`,
        );
        return;
      }

      if (officersData.length > 0) {
        setFieldOfficers(officersData);
        setSelectedManagerId("");
        const first = officersData[0];
        const firstId = String(first.id ?? first.user_id ?? "");
        setSelectedFieldOfficerId(firstId);
        const immediateFarmers = extractNestedFarmers(first);
        setFarmersForSelectedOfficer(immediateFarmers);
        if (immediateFarmers.length > 0) {
          const fid =
            immediateFarmers[0]?.id ??
            immediateFarmers[0]?.farmer_id ??
            immediateFarmers[0]?.farmerId;
          setSelectedFarmerId(fid != null ? String(fid) : "");
        } else {
          setSelectedFarmerId("");
          setPlots([]);
          setSelectedPlotId("");
        }
        setHierarchyError(null);
        console.info(
          `OwnerFarmDash: loaded ${officersData.length} FOs via ${source} (no managers)`,
        );
        return;
      }

      resetSelection();
      const industry = getStoredUserIndustry();
      const cropHint = industry.crop_type ? ` (${industry.crop_type})` : "";
      setHierarchyError(
        `No managers or field officers found for your industry${cropHint}. Check owner → manager → FO links on the backend.`,
      );
    };

    try {
      const industry = getStoredUserIndustry();
      const { fieldOfficers: officersData, managers: managersData, source } =
        await loadOwnerFieldOfficers({ industryId: industry.id });
      applyHierarchyResult(managersData, officersData, source);
    } catch (error: any) {
      console.error("OwnerFarmDash: hierarchy fetch failed:", error);
      setManagers([]);
      setFieldOfficers([]);
      setTeamFieldOfficersRaw([]);
      resetSelection();
      const status = error?.response?.status;
      const code = String(error?.code || "");
      if (status === 401 || status === 403) {
        setHierarchyError(
          "Not authorized to load managers / field officers. Please log out and log in again as Owner.",
        );
      } else if (
        code === "ECONNABORTED" ||
        String(error?.message || "").toLowerCase().includes("timeout")
      ) {
        setHierarchyError(
          "Hierarchy request timed out after 60s. Backend is slow or stuck — try Retry.",
        );
      } else if (!error?.response) {
        setHierarchyError(
          "Network error while loading hierarchy. Check connection and Retry.",
        );
      } else {
        setHierarchyError(
          `Failed to load hierarchy (${status || "error"}). Try Retry.`,
        );
      }
    } finally {
      setLoadingHierarchy(false);
      setLoadingFieldOfficers(false);
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
    } catch (error) { }
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
      // Filter to last 1 day for daily period
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
      const today = new Date(now);

      let filteredData = data.filter((item) => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0); // Set to midnight for accurate comparison
        return itemDate.getTime() === today.getTime();
      });

      if (filteredData.length === 0) {
        // If no data for today, get the most recent day
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        if (sorted.length > 0) {
          const mostRecentDate = new Date(sorted[0].date);
          mostRecentDate.setHours(0, 0, 0, 0);
          filteredData = data.filter((item) => {
            const itemDate = new Date(item.date);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate.getTime() === mostRecentDate.getTime();
          });
        }
      }

      // If only one data point, duplicate it to create a line representation
      if (filteredData.length === 1) {
        const singlePoint = filteredData[0];
        // Create a second point with the same values to render as a horizontal line
        const secondPoint = {
          ...singlePoint,
          date: singlePoint.date, // Same date to create a horizontal line
        };
        return [singlePoint, secondPoint];
      }

      return filteredData;
    }

    // Weekly = show last 7 days trend (no week-bucketing; avoids collapsing into 1 point)
    if (period === "weekly") {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6); // include today = 7 days total

      const weeklyData = data
        .filter((item) => {
          const itemDate = new Date(item.date);
          itemDate.setHours(0, 0, 0, 0);
          return itemDate >= sevenDaysAgo && itemDate <= now;
        })
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      // If only one data point, duplicate it to create a line representation
      if (weeklyData.length === 1) {
        return [weeklyData[0], { ...weeklyData[0] }];
      }

      // If nothing in last 7 days, fall back to most recent 7 points
      if (weeklyData.length === 0) {
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const recent = sorted.slice(0, 7).reverse();
        if (recent.length === 1) return [recent[0], { ...recent[0] }];
        return recent;
      }

      return weeklyData;
    }

    let filteredData = data;

    const groupedData: { [key: string]: LineChartData[] } = {};
    filteredData.forEach((item) => {
      const date = new Date(item.date);
      let key: string;
      switch (period) {
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
    const result = Object.entries(groupedData)
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

    return result;
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

  const fetchNDREStressEvents = async (): Promise<void> => {
    if (!selectedPlotId) {
      console.warn("⚠️ OwnerFarmDash: No plot selected for NDRE stress events");
      return;
    }
    try {
      const { data } = await axios.get(
        `${BASE_URL}/plots/${encodeURIComponent(selectedPlotId)}/stress?index_type=NDRE&threshold=0.15`,
        { timeout: 30000 }
      );
      const events = data?.events ?? [];
      setNdreStressEvents(events);
      setStressEvents(events);
      setMetrics((prev) => ({
        ...prev,
        stressCount: data?.total_events ?? events.length ?? 0,
      }));
      setShowNDREEvents(true);
    } catch (err) {
      console.error("Error fetching NDRE stress events:", err);
    }
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

  const [vigourPixelPct, setVigourPixelPct] = useState<VigourPixelPct | null>(
    null
  );
  const [vigourChartLoading, setVigourChartLoading] = useState(false);

  useEffect(() => {
    if (!selectedPlotId) {
      setVigourPixelPct(null);
      setVigourChartLoading(false);
      return;
    }

    let cancelled = false;
    const cached = getCache(`canopyVigour_${selectedPlotId}`);
    if (cached) {
      const parsed = parseCanopyVigourPixelSummary(cached);
      if (parsed) {
        setVigourPixelPct(parsed);
        setVigourChartLoading(false);
        return;
      }
    }

    setVigourPixelPct(null);
    setVigourChartLoading(true);
    (async () => {
      try {
        const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
        const url = `${base}/grapes/canopy-vigour1?plot_name=${encodeURIComponent(
          selectedPlotId
        )}`;
        const res = await fetch(url, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { Accept: "application/json" },
          body: grapesPlotFormBody(selectedPlotId),
        });
        if (cancelled) return;
        if (!res.ok) {
          setVigourPixelPct(null);
          return;
        }
        const data = await res.json();
        setCache(`canopyVigour_${selectedPlotId}`, data);
        const parsed = parseCanopyVigourPixelSummary(data);
        setVigourPixelPct(parsed);
      } catch {
        if (!cancelled) setVigourPixelPct(null);
      } finally {
        if (!cancelled) setVigourChartLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlotId]);

  const recoveryQualityBarRows = useMemo(
    () => (vigourPixelPct ? vigourToBarRows(vigourPixelPct) : []),
    [vigourPixelPct]
  );
  const dominantRecoveryQuality = useMemo(
    () => (vigourPixelPct ? dominantVigourCategory(vigourPixelPct) : null),
    [vigourPixelPct]
  );

  const selectedOfficerLabel = useMemo(() => {
    const officer = fieldOfficers.find(
      (fo) =>
        String(fo?.id) === String(selectedFieldOfficerId) ||
        String(fo?.user_id ?? "") === String(selectedFieldOfficerId),
    );
    return (
      `${officer?.first_name || ""} ${officer?.last_name || ""}`.trim() ||
      officer?.username ||
      "—"
    );
  }, [fieldOfficers, selectedFieldOfficerId]);

  const selectedFarmerLabel = useMemo(() => {
    const farmer = farmersForSelectedOfficer.find(
      (f) =>
        String(f.id || f.farmer_id || f.farmerId) === String(selectedFarmerId),
    );
    return (
      `${farmer?.first_name || ""} ${farmer?.last_name || ""}`.trim() ||
      farmer?.name ||
      "—"
    );
  }, [farmersForSelectedOfficer, selectedFarmerId]);

  // Time period toggle component
  const TimePeriodToggle: React.FC = () => (
    <div className="flex flex-wrap gap-1 mb-3">
      {(["daily", "weekly", "monthly", "yearly"] as TimePeriod[]).map(
        (period) => (
          <button
            key={period}
            onClick={() => setTimePeriod(period)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${timePeriod === period
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
          className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-200 ${visibleLines[key as keyof VisibleLines]
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
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180)
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

  // Keep dashboard visible while hierarchy loads

  return (
    <div className="min-h-screen dashboard-bg">
      {/* Enhanced Header */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
        {loadingHierarchy && fieldOfficers.length === 0 && (
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading field officers and farms… (up to 60 seconds)
          </div>
        )}
        {!loadingHierarchy && hierarchyError && (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-3">
            <p className="font-medium">{hierarchyError}</p>
            <button
              type="button"
              onClick={() => void fetchOwnerFieldOfficers()}
              className="shrink-0 px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {!loadingHierarchy && !hierarchyError && fieldOfficers.length === 0 && (
          <div className="mb-4 text-sm bg-gray-50 border border-gray-200 text-gray-700 rounded-lg px-3 py-2">
            No field officers found for your grapes industry. Confirm your owner
            account has grapes field officers linked, then refresh.
          </div>
        )}
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
                    endpoint: `${getBackendApiBaseUrl()}/farms/recent-farmers/`,
                    method: "GET",
                    bearerToken: localStorage.getItem("access_token") || localStorage.getItem("token")
                      ? "✅ Present"
                      : "❌ Missing",
                    tokenPreview:
                      (localStorage.getItem("access_token") || localStorage.getItem("token"))?.substring(0, 30) + "...",
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
              {/* Filters: Manager → FO → Farmer (same cascade as sugarcane) */}
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
                            value={String(manager.id)}
                          >
                            {manager.first_name} {manager.last_name} (
                            {manager.field_officers_count ??
                              manager.field_officers?.length ??
                              "—"}{" "}
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
                    disabled={
                      (managers.length > 0 && !selectedManagerId) ||
                      loadingHierarchy ||
                      loadingFieldOfficers ||
                      fieldOfficers.length === 0
                    }
                  >
                    {managers.length > 0 && !selectedManagerId ? (
                      <option>Select a manager first</option>
                    ) : loadingHierarchy || loadingFieldOfficers ? (
                      <option>Loading officers...</option>
                    ) : fieldOfficers.length === 0 ? (
                      <option>No officers found</option>
                    ) : (
                      <>
                        <option value="">Select an officer</option>
                        {fieldOfficers.map((officer) => (
                          <option
                            key={`officer-${officer.id ?? officer.user_id}`}
                            value={String(officer.id ?? officer.user_id ?? "")}
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
                      loadingFarmers ||
                      farmersForSelectedOfficer.length === 0
                    }
                  >
                    {!selectedFieldOfficerId ? (
                      <option>Select an officer first</option>
                    ) : loadingFarmers ? (
                      <option>Loading farmers...</option>
                    ) : farmersForSelectedOfficer.length === 0 ? (
                      <option>No farmers found</option>
                    ) : (
                      <>
                        <option value="">Select a farmer</option>
                        {farmersForSelectedOfficer.map((farmer) => {
                          const farmerId = String(
                            farmer.id ?? farmer.farmer_id ?? farmer.farmerId,
                          );
                          const farmerName =
                            `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim() ||
                            farmer.username ||
                            farmer.name ||
                            `Farmer ${farmerId}`;
                          const plotsCount =
                            farmer.plots?.length ||
                            farmer.plot_list?.length ||
                            0;

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
        {/* Top Priority Metrics - same 4 cards as sugarcane */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-5 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/location.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 pt-2 relative z-10">
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.area?.toFixed(2) || "-"
                  )}
                </div>
                <div className="text-base font-semibold" style={{ color: '#6bb043' }}>acre</div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>Field Area</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/Crop Status.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 relative z-10">
              <div className="text-right">
                <div className="text-lg font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.growthStage || "-"
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>
              Crop Status
            </p>
          </div>

          <div
            className="rounded-xl p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', backgroundColor: '#f3f5e9' }}
          >
            <Calendar
              className="absolute left-7 top-7 w-12 h-12 opacity-100 z-0 pointer-events-none select-none"
              strokeWidth={2}
              style={{ color: '#5a7c3a' }}
              aria-hidden
            />
            <div className="flex flex-col flex-1 min-h-0 relative z-10 pl-16" aria-busy={milestoneState.loading}>
              {([
                { label: "Ripening Start", iso: milestoneState.ripeningStartDate },
                { label: "Harvest Ready", iso: milestoneState.harvestReadyStartDate },
              ] as const).map((row) => {
                const showDash = milestoneState.loading || milestoneState.error;
                const dateText = showDash ? "—" : formatMilestoneDate(row.iso);
                const subtleValue = showDash || dateText === "Not available";
                return (
                  <div key={row.label} className="flex flex-col items-end gap-0.5 py-1">
                    <div
                      className="text-sm font-bold tabular-nums"
                      style={{
                        color: subtleValue ? '#94a3b8' : '#212121',
                        fontFamily: 'Inter, Poppins, sans-serif',
                      }}
                      title={subtleValue ? undefined : dateText}
                    >
                      {dateText}
                    </div>
                    <div className="text-base font-semibold" style={{ color: '#6bb043' }}>
                      {row.label}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm font-medium mt-auto pt-0 -mt-2 relative z-10" style={{ color: '#616161' }}>
              Ripening/Harvest
            </p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <Beaker className="w-8 h-8 text-blue-600" />
              <div className="text-right">
                <div className="text-2xl font-bold flex items-center gap-1 justify-end" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : metrics.brix !== null ? (
                    metrics.brix.toFixed(2)
                  ) : (
                    "-"
                  )}
                  <span className="text-sm font-semibold" style={{ color: '#6bb043' }}>
                    °Brix (Avg)
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-auto pt-2 relative z-10">
              <p className="text-sm font-medium" style={{ color: '#616161' }}>Sugar Content</p>
              <div className="flex gap-4 text-xs">
                <div className="text-center">
                  <div className="font-semibold text-red-600 text-sm">
                    {loadingData ? "—" : metrics.brixMax != null ? metrics.brixMax.toFixed(2) : "-"}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Max</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-600 text-sm">
                    {loadingData ? "—" : metrics.brixMin != null ? metrics.brixMin.toFixed(2) : "-"}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Min</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics — Recovery Rate row: Field Score + CCI (same as Manager) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <Target className="w-7 h-7 text-purple-600" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                  {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : metrics.recovery?.toFixed(1) || "-"}
                </div>
                <div className="text-sm font-semibold text-purple-600">%</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-2" style={{ color: '#616161' }}>Recovery Rate</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <Gauge className="w-7 h-7 text-green-600" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                  {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : metrics.fieldScore != null ? metrics.fieldScore.toFixed(1) : "-"}
                </div>
                <div className="text-sm font-semibold text-green-600">%</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-2" style={{ color: '#616161' }}>Field Score</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-7 h-7 text-indigo-600" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                  {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : metrics.expectedYield?.toFixed(2) || "-"}
                </div>
                <div className="text-sm font-semibold text-indigo-600">T/acre</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-2" style={{ color: '#616161' }}>Expected Yield</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <Sprout className="w-7 h-7 text-green-600" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                  {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : metrics.cci != null ? metrics.cci.toFixed(3) : "-"}
                </div>
                <div className="text-sm font-semibold text-green-600">CCI</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-2" style={{ color: '#616161' }}>Crop Condition Index</p>
          </div>

          <button
            type="button"
            onClick={() => void fetchNDREStressEvents()}
            onDoubleClick={() => setShowNDREEvents((v) => !v)}
            className="text-left w-full"
            title="Click to show Crop Stress Index (CSI) events on the chart"
          >
            <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 border border-red-100" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-7 h-7 text-red-500" />
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                    {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : (metrics.stressTotalDays ?? metrics.stressCount ?? 0)}
                  </div>
                  <div className="text-sm font-semibold text-red-500">Total days</div>
                </div>
              </div>
              <p className="text-xs font-medium mt-2" style={{ color: '#616161' }}>
                Stress Events {showNDREEvents ? "(CSI on)" : ""}
              </p>
            </div>
          </button>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-7 h-7 text-pink-500" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121' }}>
                  {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : metrics.biomass?.toFixed(2) || "-"}
                </div>
                <div className="text-sm font-semibold text-pink-500">T/acre</div>
              </div>
            </div>
            <div className="flex items-end justify-between mt-2 gap-2">
              <p className="text-xs font-medium" style={{ color: '#616161' }}>Avg Biomass</p>
              <div className="flex gap-3 text-xs">
                <div className="text-center">
                  <div className="font-semibold text-red-600 text-sm">
                    {loadingData ? "—" : metrics.biomassMax != null ? metrics.biomassMax.toFixed(2) : "-"}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Max</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-600 text-sm">
                    {loadingData ? "—" : metrics.biomassMin != null ? metrics.biomassMin.toFixed(2) : "-"}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Min</div>
                </div>
              </div>
            </div>
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
                        {loadingHierarchy
                          ? "Loading..."
                          : loadingData
                            ? "Loading..."
                            : selectedPlotId
                              ? metrics.growthStage ?? "—"
                              : "Select a plot"}
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
                        <p>
                          <strong>Farmer:</strong> {selectedFarmerLabel}
                        </p>
                        <p>
                          <strong>Representative:</strong> {selectedOfficerLabel}
                        </p>
                        <p>
                          <strong>Status:</strong>{" "}
                          {loadingData
                            ? "Loading..."
                            : selectedPlotId
                              ? metrics.growthStage ?? "—"
                              : "Select a plot"}
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
                  Grapes Yield Projection
                </h3>
              </div>
              <div className="flex flex-col items-center">
                <PieChartWithNeedle
                  value={metrics.expectedYield || 0}
                  max={metrics.sugarYieldMax || 400}
                  title="Grapes Yield Forecast"
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

            {/* canopy vigour — same as Field Officer */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 flex flex-col overflow-visible">
              <div className="flex items-center gap-2 mb-3 sm:mb-4 shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                <h3 className="text-sm sm:text-base font-semibold text-gray-800">
                  canopy vigour
                </h3>
              </div>

              <div className="mt-1 flex w-full min-w-0 flex-col gap-4">
                <div className="flex w-full min-w-0 gap-2">
                  <div
                    className="flex shrink-0 flex-col justify-between pt-0.5 text-[9px] font-medium leading-none text-gray-700 sm:text-[10px] text-right"
                    style={{
                      height: RECOVERY_QUALITY_CHART_PLOT_H,
                      width: "1.75rem",
                    }}
                    aria-hidden
                  >
                    <span>100%</span>
                    <span>70%</span>
                    <span>30%</span>
                    <span>0%</span>
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col">
                    <div
                      className="relative w-full overflow-visible pl-0.5"
                      style={{
                        paddingTop: "1.25rem",
                        minHeight: RECOVERY_QUALITY_CHART_PLOT_H + 20,
                      }}
                    >
                      {vigourChartLoading && vigourPixelPct === null && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-gray-200 bg-white/80 backdrop-blur-[1px]">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        </div>
                      )}
                      <div
                        className="relative box-border w-full overflow-visible border-b-2 border-l-2 border-gray-600"
                        style={{
                          height: RECOVERY_QUALITY_CHART_PLOT_H,
                          marginTop: 0,
                          opacity:
                            vigourChartLoading && vigourPixelPct === null
                              ? 0.45
                              : 1,
                        }}
                      >
                        <div
                          className="pointer-events-none absolute inset-0 border-r border-dashed border-gray-300"
                          aria-hidden
                        >
                          <div className="absolute left-0 right-0 top-0 border-t border-dashed border-gray-300" />
                          <div
                            className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                            style={{ bottom: "70%" }}
                          />
                          <div
                            className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                            style={{ bottom: "30%" }}
                          />
                        </div>

                        <div
                          className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-1.5 px-1"
                          style={{ height: RECOVERY_QUALITY_CHART_PLOT_H }}
                        >
                          {recoveryQualityBarRows.map((b) => {
                            const rawH =
                              (b.heightPct / 100) *
                              RECOVERY_QUALITY_CHART_PLOT_H;
                            const barHeightPx =
                              b.heightPct > 0 && rawH < 2 ? 2 : rawH;
                            return (
                              <div
                                key={b.label}
                                className="flex min-h-0 min-w-0 flex-1 flex-col justify-end"
                              >
                                <div
                                  className="flex w-full items-start justify-center rounded-t-[3px] pt-1 shadow-sm"
                                  style={{
                                    height: barHeightPx,
                                    minHeight: 0,
                                    backgroundColor: b.color,
                                  }}
                                >
                                  <span className="text-center text-[9px] font-bold leading-tight text-white sm:text-[10px]">
                                    {b.pctLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid w-full grid-cols-4 gap-1 px-1">
                      <div className="flex flex-col items-center justify-end gap-1">
                        <Leaf
                          className="h-4 w-4 text-[#e74c3c] sm:h-5 sm:w-5"
                          strokeWidth={2}
                        />
                        <span className="w-full text-center text-[9px] font-semibold leading-tight text-[#e74c3c] sm:text-[10px]">
                          Poor
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-end gap-1">
                        <CloudSun
                          className="h-4 w-4 text-[#f39c12] sm:h-5 sm:w-5"
                          strokeWidth={2}
                        />
                        <span className="w-full text-center text-[9px] font-semibold leading-tight text-[#f39c12] sm:text-[10px]">
                          Mod.
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-end gap-1">
                        <div className="flex items-center justify-center gap-0.5">
                          <Leaf
                            className="h-3 w-3 text-[#4a80e8]"
                            strokeWidth={2}
                          />
                          <Leaf
                            className="h-3 w-3 text-[#57b86a]"
                            strokeWidth={2}
                          />
                        </div>
                        <span className="w-full text-center text-[9px] font-semibold leading-tight text-[#4a80e8] sm:text-[10px]">
                          Good
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-end gap-1">
                        <Star
                          className="h-4 w-4 fill-yellow-400 text-yellow-500 sm:h-5 sm:w-5"
                          strokeWidth={2}
                        />
                        <span className="w-full text-center text-[9px] font-semibold leading-tight text-[#57b86a] sm:text-[10px]">
                          Exc.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-center text-xs text-gray-600">
                  Your Farm Quality:{" "}
                  {dominantRecoveryQuality ? (
                    <span
                      className="font-bold"
                      style={{ color: dominantRecoveryQuality.color }}
                    >
                      {dominantRecoveryQuality.name} (
                      {dominantRecoveryQuality.pct.toFixed(
                        dominantRecoveryQuality.pct >= 10 ? 1 : 2
                      )}
                      %)
                    </span>
                  ) : (
                    <span className="font-bold text-gray-500">
                      {vigourChartLoading ? "Loading…" : "—"}
                    </span>
                  )}
                </p>
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
                            x="79%"
                            y="25%"
                            textAnchor="middle"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="35%"
                            y="35%"
                            textAnchor="middle"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x="95%"
                            y="25%"
                            textAnchor="end"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="95%"
                            y="75%"
                            textAnchor="end"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
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
