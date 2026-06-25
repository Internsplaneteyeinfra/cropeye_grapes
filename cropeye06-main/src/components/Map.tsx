import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Polygon, useMap, Circle, Rectangle, Marker } from "react-leaflet";
import { divIcon } from "leaflet";
import { LatLngTuple, LatLngBounds, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import { FaExpand } from 'react-icons/fa';
import { ArrowLeft } from 'lucide-react';
import SoilAnalysis from "./SoilAnalysis";
import { FieldHealthAnalysis } from "./FieldHealthAnalysis";
import CropHealthAnalysis from "./CropHealthAnalysis";
import IrrigationSchedule from "./IrrigationSchedule";
import SoilMoistureCard from "./Irrigation/cards/SoilMoistureCard";
import WeatherForecast from "./WeatherForecast";
import FertilizerTable from "./FertilizerTable";
import { useAppContext } from "../context/AppContext";
import { getCache, setCache } from "./utils/cache";
import { getEventsBaseUrl } from "../utils/serviceUrls";

// Add custom styles for the enhanced tooltip
const tooltipStyles = `
  .hover-tooltip {
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    z-index: 1000;
    pointer-events: none;
    max-width: 200px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .enhanced-tooltip {
    position: fixed;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none;
    max-width: 220px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .brix-tooltip {
    position: fixed;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    white-space: nowrap;
    min-width: 80px;
  }

  .enhanced-tooltip-line {
    margin: 3px 0;
    padding: 2px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 16px;
  }

  .enhanced-tooltip-line:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }

.layer-name {
  font-weight: bold;
  color: #4CAF50;
  margin-right: 6px;
  min-width: 60px;
  font-size: 10px;
}

.layer-description {
  color: #e0e0e0;
  flex: 1;
  text-align: right;
  font-size: 10px;
  }
  
  @media (max-width: 768px) {
    .hover-tooltip {
      padding: 6px 8px;
      font-size: 10px;
      max-width: 150px;
    }
    
    .enhanced-tooltip {
      padding: 6px 8px;
      font-size: 10px;
      max-width: 160px;
    }
    
    .layer-name {
      min-width: 40px;
      font-size: 9px;
    }
    
    .layer-description {
      font-size: 9px;
    }
  }
  
  @media (max-width: 320px) {
    .hover-tooltip {
      padding: 4px 6px;
      font-size: 9px;
      max-width: 120px;
    }
    
    .enhanced-tooltip {
      padding: 2px 15px;
      font-size: 9px;
      max-width: 100px;
    }
    
    .layer-name {
      min-width: 30px;
      font-size: 8px;
    }
    
    .layer-description {
      font-size: 8px;
    }
  }
`;

// Inject styles if not already injected
if (typeof document !== 'undefined' && !document.querySelector('#map-tooltip-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'map-tooltip-styles';
  styleSheet.innerText = tooltipStyles;
  document.head.appendChild(styleSheet);
}

// Unified legend circle color (orange)
const LEGEND_CIRCLE_COLOR = '#F57C00';

const LAYER_LABELS: Record<string, string> = {
  Growth: "Growth",
  "Water Uptake": "Water Uptake",
  "Soil Moisture": "Soil Moisture",
  PEST: "Pest",
  Brix: "Brix",
};

// Brix Value Marker Component - adjusts font size based on zoom level
const BrixValueMarker: React.FC<{ position: [number, number]; value: string }> = ({ position, value }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => {
      setZoom(map.getZoom());
    };
    
    map.on('zoom', updateZoom);
    updateZoom(); // Initial zoom level
    
    return () => {
      map.off('zoom', updateZoom);
    };
  }, [map]);

  // Calculate font size based on zoom level
  // Base font size increases with zoom: 10px at zoom 10, up to 16px at zoom 22 (smaller than before)
  const baseFontSize = 10;
  const zoomFactor = (zoom - 10) / (22 - 10); // Normalize zoom between 0 and 1
  const fontSize = Math.round(baseFontSize + (zoomFactor * 6)); // Scale from 10px to 16px
  const iconSize = [Math.max(40, fontSize * 2.5), Math.max(25, fontSize * 1.5)];

  return (
    <Marker
      position={position}
      icon={divIcon({
        className: 'brix-value-marker',
        html: `<div style="
          color: white;
          font-weight: normal;
          font-size: ${fontSize}px;
          text-align: center;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
          pointer-events: none;
          white-space: nowrap;
          line-height: 1.2;
        ">${value}</div>`,
        iconSize: iconSize as [number, number],
        iconAnchor: [iconSize[0] / 2, iconSize[1] / 2] as [number, number],
      })}
    />
  );
};

// Center the selected plot in the map viewport
const FitPlotToCenter: React.FC<{ coordinates: number[][] }> = ({ coordinates }) => {
  const map = useMap();

  useEffect(() => {
    if (!coordinates.length) return;

    const latlngs = coordinates
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map(([lng, lat]) => [lat, lng] as LatLngTuple)
      .filter((tuple: LatLngTuple) => !isNaN(tuple[0]) && !isNaN(tuple[1]));

    if (!latlngs.length) return;

    const applyFit = () => {
      map.invalidateSize();
      if (latlngs.length === 1) {
        map.setView(latlngs[0], 18, { animate: true });
        return;
      }
      const bounds = new LatLngBounds(latlngs);
      map.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 18,
        animate: true,
        duration: 1,
      });
    };

    applyFit();
    const t = window.setTimeout(applyFit, 150);
    return () => window.clearTimeout(t);
  }, [coordinates, map]);

  return null;
};

// Function to check if a point is inside polygon
const isPointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
};

interface MapProps {
  onHealthDataChange?: (data: any) => void;
  onSoilDataChange?: (data: any) => void;
  onFieldAnalysisChange?: (data: any) => void;
  onMoistGroundChange?: (percent: number) => void;
  onPestDataChange?: (data: any) => void;
}

const CustomTileLayer: React.FC<{
  url: string;
  opacity?: number;
  tileKey?: string;
}> = ({ url, opacity = 0.7, tileKey }) => {
  // console.log('CustomTileLayer URL:', url);

  if (!url) {
    // console.log('No URL provided to CustomTileLayer');
    return null;
  }

  return (
    <TileLayer
      key={tileKey}
      url={url}
      opacity={opacity}
      maxZoom={22}
      minZoom={10}
      tileSize={256}
      eventHandlers={{
        tileerror: (e: any) => console.error('Tile loading error:', e),
      }}
    />
  );
};

const Map: React.FC<MapProps> = ({
  // onHealthDataChange,
  // onSoilDataChange,
  onFieldAnalysisChange,
  // onMoistGroundChange,
  onPestDataChange,
}) => {
  const { profile, loading: profileLoading } = useFarmerProfile();
  const { appState, selectedPlotName: contextSelectedPlotName, setSelectedPlotName: setContextSelectedPlotName, getApiData, hasApiData, setApiData } = useAppContext();
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Get pH value from soil data if available
  const phValue = appState?.soilData?.ph || appState?.soilData?.phh2o || null;
  const phStatistics = appState?.soilData?.phh2o_0_5cm_mean ? {
    phh2o_0_5cm_mean_mean: appState.soilData.phh2o_0_5cm_mean
  } : undefined;
  
  // Declare state variables first
  const [plotData, setPlotData] = useState<any>(null);
  const [plotBoundary, setPlotBoundary] = useState<any>(null); // Separate state for plot boundary that persists
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter] = useState<LatLngTuple>([17.842832246588202, 74.91558702408217]);
  const [selectedPlotName, setSelectedPlotName] = useState("");
  const [activeLayer, setActiveLayer] = useState<"Growth" | "Water Uptake" | "Soil Moisture" | "PEST" | "Brix">("Growth");
  
  // Use context selectedPlotName if available, otherwise use local state
  const activePlotName = contextSelectedPlotName || selectedPlotName;
  // IMPORTANT: In this component, most fetches are keyed off local `selectedPlotName`.
  // Use the same precedence here so harvested detection matches the plot being displayed.
  const plotNameForStatus = selectedPlotName || contextSelectedPlotName || "";

  // New state for different layer data
  const [growthData, setGrowthData] = useState<any>(null);
  const [waterUptakeData, setWaterUptakeData] = useState<any>(null);
  const [soilMoistureData, setSoilMoistureData] = useState<any>(null);
  const [pestData, setPestData] = useState<any>(null);
  const [brixData, setBrixData] = useState<any>(null);
  const [canopyVigourData, setCanopyVigourData] = useState<any>(null);
  const [brixQualityData, setBrixQualityData] = useState<any>(null);
  const [cropStatus, setCropStatus] = useState<string | null>(null);
  const [fieldAnalysisData, setFieldAnalysisData] = useState<{
    plotName: string;
    overallHealth: number;
    healthStatus: string;
    statistics: {
      mean: number;
    };
  } | null>(null);

  // const [hoveredPlotInfo, setHoveredPlotInfo] = useState<any>(null);
  // const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track which data has been loaded to prevent re-fetching on navigation
  const dataLoadedRef = useRef<{ [key: string]: boolean }>({});
  const [selectedLegendClass, setSelectedLegendClass] = useState<string | null>(null);
  const [layerChangeKey, setLayerChangeKey] = useState(0);
  const [pixelTooltip, setPixelTooltip] = useState<{layers: Array<{layer: string, label: string, description: string, percentage: number}>, x: number, y: number} | null>(null);
  
  // Date navigation state (similar to Streamlit logic)
  const [currentEndDate, setCurrentEndDate] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [showDatePopup, setShowDatePopup] = useState(false);
  const [popupSide, setPopupSide] = useState<'left' | 'right' | null>(null);
  const DAYS_STEP = 15;

  const isHarvested = useMemo(() => {
    const s = (cropStatus || "").toString().toLowerCase();
    // Treat "harvested" and "partially harvested" as harvested for UI brix display.
    return s.includes("harvested");
  }, [cropStatus]);

  // Use FarmerDashboard stage as the primary source of truth when available.
  // This ensures Brix overlay flips to 0.0 immediately after the farmer UI marks a plot as harvested.
  const farmerDashboardStage = useMemo(() => {
    if (!plotNameForStatus) return null;
    const dash = getApiData("farmerDashboard", plotNameForStatus);
    return dash?.growthStage ?? dash?.cropStatus ?? null;
  }, [plotNameForStatus, getApiData]);

  const fetchHarvestStatus = useCallback(
    async (plotName: string): Promise<string | null> => {
      const cacheKey = `harvest_${plotName}_${currentEndDate}`;
      const cached = getCache(cacheKey, 30 * 60 * 1000); // 30 min
      if (cached) {
        const props = cached?.features?.[0]?.properties || cached?.harvest_summary || cached;
        const s = props?.harvest_status ?? props?.status ?? null;
        return s != null ? String(s) : null;
      }
      try {
        const url = `${getEventsBaseUrl()}/grapes-harvest?plot_name=${encodeURIComponent(
          plotName
        )}&end_date=${currentEndDate}`;
        const resp = await fetchWithRetry(url, {
          method: "POST",
          mode: "cors",
          cache: "default",
          credentials: "omit",
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        setCache(cacheKey, data);
        const props = data?.features?.[0]?.properties || data?.harvest_summary || data;
        const s = props?.harvest_status ?? props?.status ?? null;
        return s != null ? String(s) : null;
      } catch {
        return null;
      }
    },
    [currentEndDate]
  );

  // Keep crop status in sync (used to force Brix=0 after harvested).
  useEffect(() => {
    if (!plotNameForStatus) {
      setCropStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1) Prefer FarmerDashboard-provided status (single source of truth for farmer UI).
        if (farmerDashboardStage) {
          setCropStatus(String(farmerDashboardStage));
          return;
        }

        // Prefer explicit harvest status endpoint; fallback to agroStats if unavailable.
        const harvest = await fetchHarvestStatus(plotNameForStatus);
        if (cancelled) return;
        if (harvest) {
          setCropStatus(harvest);
          return;
        }
        const agro = await fetchAgroStatsData(plotNameForStatus);
        if (cancelled) return;
        const status =
          agro?.harvest_status ??
          agro?.Sugarcane_Status ??
          agro?.growth_stage ??
          agro?.crop_status ??
          null;
        setCropStatus(status != null ? String(status) : null);
      } catch {
        // Non-fatal: if status can't be fetched, just don't override brix.
        if (!cancelled) setCropStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plotNameForStatus, currentEndDate, fetchHarvestStatus, getApiData, farmerDashboardStage]);

  useEffect(() => {
    setLayerChangeKey(prev => prev + 1);
    // Reset to current date when switching layers (for Growth, Water Uptake, Soil Moisture, PEST, and Brix)
    if (activeLayer === "Growth" || activeLayer === "Water Uptake" || activeLayer === "Soil Moisture" || activeLayer === "PEST" || activeLayer === "Brix") {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      setCurrentEndDate(todayStr);
      
      // Check if data exists in cache before showing loading spinner
      let hasCachedData = false;
      if (selectedPlotName) {
        if (activeLayer === "Growth") {
          hasCachedData = !!(growthData || hasApiData('growth', selectedPlotName) || getCache(`growth_${selectedPlotName}_${todayStr}`));
        } else if (activeLayer === "Water Uptake") {
          hasCachedData = !!(waterUptakeData || hasApiData('waterUptake', selectedPlotName) || getCache(`wateruptake_${selectedPlotName}_${todayStr}`));
        } else if (activeLayer === "Soil Moisture") {
          hasCachedData = !!(soilMoistureData || hasApiData('soilMoisture', selectedPlotName) || getCache(`soilmoisture_${selectedPlotName}_${todayStr}`));
        } else if (activeLayer === "PEST") {
          hasCachedData = !!(pestData || hasApiData('pest', selectedPlotName) || getCache(`pest_${selectedPlotName}_${todayStr}`));
        } else if (activeLayer === "Brix") {
          hasCachedData = !!(brixData || canopyVigourData || brixQualityData || 
                          hasApiData('brix', selectedPlotName) || hasApiData('canopyVigour', selectedPlotName) || hasApiData('brixQuality', selectedPlotName) ||
                          getCache(`brix_${selectedPlotName}_${todayStr}`) || getCache(`canopy_vigour_${selectedPlotName}_${todayStr}`) || getCache(`brixQuality_${selectedPlotName}`));
        }
      }
      
      // Only show loading spinner if data doesn't exist in cache
      if (!hasCachedData && selectedPlotName) {
        setLoading(true);
      } else {
        setLoading(false); // Stop spinner if cached data exists
      }
      setError(null);
    }
    
    // Ensure plotBoundary is preserved when switching layers
    // Try to extract from current layer data if plotBoundary is missing
    if (!plotBoundary && selectedPlotName) {
      if (activeLayer === "Growth" && growthData?.features?.[0]) {
        setPlotBoundary(growthData.features[0]);
      } else if (activeLayer === "Water Uptake" && waterUptakeData?.features?.[0]) {
        setPlotBoundary(waterUptakeData.features[0]);
      } else if (activeLayer === "Soil Moisture" && soilMoistureData?.features?.[0]) {
        setPlotBoundary(soilMoistureData.features[0]);
      } else if (activeLayer === "PEST" && pestData?.features?.[0]) {
        setPlotBoundary(pestData.features[0]);
      } else if (activeLayer === "Brix") {
        // Prefer canopy vigour for plot boundary, fallback to brix data
        if (canopyVigourData?.features?.[0]) {
          setPlotBoundary(canopyVigourData.features[0]);
        } else if (brixData?.features?.[0]) {
          setPlotBoundary(brixData.features[0]);
        }
      } else if (plotData?.features?.[0]) {
        // Fallback to plotData if available
        setPlotBoundary(plotData.features[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer, selectedPlotName]);

  // Fetch data when currentEndDate changes for Growth, Water Uptake, Soil Moisture, PEST, and Brix layers
  useEffect(() => {
    if (selectedPlotName && (activeLayer === "Growth" || activeLayer === "Water Uptake" || activeLayer === "Soil Moisture" || activeLayer === "PEST" || activeLayer === "Brix")) {
      // Create a unique key for this plot/layer/date combination
      const dataKey = `${selectedPlotName}_${activeLayer}_${currentEndDate}`;
      
      // Check if data already exists in component state
      let hasStateData = false;
      if (activeLayer === "Growth" && growthData) {
        hasStateData = true;
      } else if (activeLayer === "Water Uptake" && waterUptakeData) {
        hasStateData = true;
      } else if (activeLayer === "Soil Moisture" && soilMoistureData) {
        hasStateData = true;
      } else if (activeLayer === "PEST" && pestData) {
        hasStateData = true;
      } else if (activeLayer === "Brix" && (brixData || canopyVigourData || brixQualityData)) {
        hasStateData = true;
      }
      
      if (hasStateData) {
        console.log(`✅ Data already exists in component state for ${dataKey} - skipping fetch`);
        return;
      }
      
      // Check if data has already been loaded
      if (dataLoadedRef.current[dataKey]) {
        console.log(`✅ Data already loaded for ${dataKey} - skipping fetch`);
        setLoading(false); // Ensure spinner is off
        return;
      }

      // Check if data exists in cache before fetching
      let shouldFetch = true;
      let cachedDataFound = false;

      if (activeLayer === "Growth") {
        if (hasApiData('growth', selectedPlotName) || getCache(`growth_${selectedPlotName}_${currentEndDate}`)) {
          shouldFetch = false;
          cachedDataFound = true;
        }
      } else if (activeLayer === "Water Uptake") {
        if (hasApiData('waterUptake', selectedPlotName) || getCache(`wateruptake_${selectedPlotName}_${currentEndDate}`)) {
          shouldFetch = false;
          cachedDataFound = true;
        }
      } else if (activeLayer === "Soil Moisture") {
        if (hasApiData('soilMoisture', selectedPlotName) || getCache(`soilmoisture_${selectedPlotName}_${currentEndDate}`)) {
          shouldFetch = false;
          cachedDataFound = true;
        }
      } else if (activeLayer === "PEST") {
        if (hasApiData('pest', selectedPlotName) || getCache(`pest_${selectedPlotName}_${currentEndDate}`)) {
          shouldFetch = false;
          cachedDataFound = true;
        }
      } else if (activeLayer === "Brix") {
        const hasCanopy = hasApiData('canopyVigour', selectedPlotName) || getCache(`canopy_vigour_${selectedPlotName}_${currentEndDate}`);
        const hasBrix = hasApiData('brix', selectedPlotName) || getCache(`brix_${selectedPlotName}_${currentEndDate}`);
        const hasBrixQuality = hasApiData('brixQuality', selectedPlotName) || getCache(`brixQuality_${selectedPlotName}`);
        if (hasCanopy && hasBrix && hasBrixQuality) {
          shouldFetch = false;
          cachedDataFound = true;
        }
      }

      // If cached data exists, load it into state without fetching
      if (cachedDataFound && !shouldFetch) {
        console.log(`✅ Using cached data for ${dataKey} - loading into state`);
        setLoading(false); // Stop spinner immediately
        
        // Load cached data into state
        if (activeLayer === "Growth") {
          const cached = getApiData('growth', selectedPlotName) || getCache(`growth_${selectedPlotName}_${currentEndDate}`);
          if (cached) {
            setGrowthData(cached);
            if (!plotBoundary && cached?.features?.[0]?.geometry) {
              setPlotBoundary(cached.features[0]);
            }
          }
        } else if (activeLayer === "Water Uptake") {
          const cached = getApiData('waterUptake', selectedPlotName) || getCache(`wateruptake_${selectedPlotName}_${currentEndDate}`);
          if (cached) setWaterUptakeData(cached);
        } else if (activeLayer === "Soil Moisture") {
          const cached = getApiData('soilMoisture', selectedPlotName) || getCache(`soilmoisture_${selectedPlotName}_${currentEndDate}`);
          if (cached) {
            setSoilMoistureData(cached);
            if (!plotBoundary && cached?.features?.[0]?.geometry) {
              setPlotBoundary(cached.features[0]);
            }
          }
        } else if (activeLayer === "PEST") {
          const cached = getApiData('pest', selectedPlotName) || getCache(`pest_${selectedPlotName}_${currentEndDate}`);
          if (cached) {
            setPestData(cached);
            if (!plotBoundary && cached?.features?.[0]?.geometry) {
              setPlotBoundary(cached.features[0]);
            }
          }
        } else if (activeLayer === "Brix") {
          const cachedCanopy = getApiData('canopyVigour', selectedPlotName) || getCache(`canopy_vigour_${selectedPlotName}_${currentEndDate}`);
          const cachedBrix = getApiData('brix', selectedPlotName) || getCache(`brix_${selectedPlotName}_${currentEndDate}`);
          const cachedBrixQuality = getApiData('brixQuality', selectedPlotName) || getCache(`brixQuality_${selectedPlotName}`);
          if (cachedCanopy) {
            setCanopyVigourData(cachedCanopy);
            if (!plotBoundary && cachedCanopy?.features?.[0]?.geometry) {
              setPlotBoundary(cachedCanopy.features[0]);
            }
          }
          if (cachedBrix) {
            setBrixData(cachedBrix);
            if (!plotBoundary && cachedBrix?.features?.[0]?.geometry) {
              setPlotBoundary(cachedBrix.features[0]);
            }
          }
          if (cachedBrixQuality) setBrixQualityData(cachedBrixQuality);
        }
        
        dataLoadedRef.current[dataKey] = true;
        return; // Exit early, don't fetch
      }

      // Only fetch if data doesn't exist in cache
      if (activeLayer === "Growth") {
        fetchGrowthData(selectedPlotName).then(() => {
          dataLoadedRef.current[dataKey] = true;
        });
      } else if (activeLayer === "Water Uptake") {
        fetchWaterUptakeData(selectedPlotName).then(() => {
          dataLoadedRef.current[dataKey] = true;
        });
      } else if (activeLayer === "Soil Moisture") {
        fetchSoilMoistureData(selectedPlotName).then(() => {
          dataLoadedRef.current[dataKey] = true;
        });
      } else if (activeLayer === "PEST") {
        fetchPestData(selectedPlotName).then(() => {
          dataLoadedRef.current[dataKey] = true;
        });
      } else if (activeLayer === "Brix") {
        // Fetch both Canopy Vigour (NDVI) and Brix Grid Values
        Promise.all([
          fetchCanopyVigour(selectedPlotName),
          fetchBrixData(selectedPlotName),
          fetchBrixQualityData(selectedPlotName)
        ]).then(() => {
          dataLoadedRef.current[dataKey] = true;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEndDate, activeLayer, selectedPlotName]);

  const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to convert profile coordinates to GeoJSON format
  const createPlotBoundaryFromProfile = (plot: any) => {
    if (!plot?.coordinates?.boundary?.coordinates || plot.coordinates.boundary.coordinates.length === 0) {
      return null;
    }

    // Profile has coordinates as [lng, lat], convert to GeoJSON Polygon format
    const boundaryCoords = plot.coordinates.boundary.coordinates;
    
    // Ensure it's in the correct format: [[[lng, lat], [lng, lat], ...]]
    let polygonCoords = boundaryCoords;
    if (Array.isArray(boundaryCoords[0]) && !Array.isArray(boundaryCoords[0][0])) {
      // If it's [[lng, lat], [lng, lat], ...], wrap it in another array
      polygonCoords = [boundaryCoords];
    }

    return {
      type: "Feature",
      properties: {
        plot_name: plot.fastapi_plot_id || plot.id,
        ...plot
      },
      geometry: {
        type: "Polygon",
        coordinates: polygonCoords
      }
    };
  };

  // Auto-select first plot from farmer profile and load coordinates immediately
  useEffect(() => {
    console.log('🗺️ Map: Loading profile, profileLoading:', profileLoading, 'hasProfile:', !!profile);
    
    if (profileLoading || !profile) {
      console.log('🗺️ Map: Waiting for profile to load...');
      return;
    }

    const plotNames = profile.plots?.map(plot => plot.fastapi_plot_id) || [];
    const defaultPlot = plotNames.length > 0 ? plotNames[0] : null;
    
    console.log('🗺️ Map: Available plots:', plotNames);
    console.log('🗺️ Map: Setting default plot:', defaultPlot);
    
    if (defaultPlot) {
      setSelectedPlotName(defaultPlot);
      setContextSelectedPlotName(defaultPlot);
      localStorage.setItem('selectedPlot', defaultPlot);
      
      // Find the plot in profile to get coordinates immediately
      const selectedPlot = profile.plots?.find(p => p.fastapi_plot_id === defaultPlot);
      
      if (selectedPlot) {
        console.log('🗺️ Map: Found plot in profile, extracting coordinates...');
        const boundaryFromProfile = createPlotBoundaryFromProfile(selectedPlot);
        
        if (boundaryFromProfile) {
          console.log('✅ Map: Setting plot boundary from profile (instant display)');
          setPlotBoundary(boundaryFromProfile);
          
          // Calculate map center from boundary coordinates (optional, map will auto-center on boundary)
          const boundaryCoords = selectedPlot.coordinates?.boundary?.coordinates;
          if (boundaryCoords && Array.isArray(boundaryCoords) && boundaryCoords.length > 0) {
            try {
              // Handle nested array structure: [[[lng, lat], ...]] or [[lng, lat], ...]
              let flatCoords: number[][] = [];
              if (Array.isArray(boundaryCoords) && boundaryCoords.length > 0) {
                if (Array.isArray(boundaryCoords[0])) {
                  if (Array.isArray(boundaryCoords[0][0])) {
                    // Nested: [[[lng, lat], ...]]
                    flatCoords = boundaryCoords[0] as unknown as number[][];
                  } else {
                    // Flat: [[lng, lat], ...]
                    flatCoords = boundaryCoords as unknown as number[][];
                  }
                }
              }
              
              if (flatCoords.length > 0) {
                let sumLat = 0, sumLng = 0;
                let validCoords = 0;
                for (const coord of flatCoords) {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    const lng = coord[0];
                    const lat = coord[1];
                    if (typeof lng === 'number' && typeof lat === 'number') {
                      sumLat += lat;
                      sumLng += lng;
                      validCoords++;
                    }
                  }
                }
                
                if (validCoords > 0) {
                  const centerLat = sumLat / validCoords;
                  const centerLng = sumLng / validCoords;
                  console.log('🗺️ Map: Calculated center:', [centerLat, centerLng]);
                }
              }
            } catch (err) {
              console.warn('⚠️ Map: Error calculating center from boundary:', err);
            }
          }
        } else {
          console.warn('⚠️ Map: No boundary coordinates in profile, will fetch from API');
        }
      }
      
      // Fetch layer data (these can be slower, plot boundary is already shown)
      console.log('🗺️ Map: Fetching layer data for plot:', defaultPlot);
      fetchPestData(defaultPlot);
      fetchPlotData(defaultPlot); // Still fetch for layer data, but boundary is already shown
      fetchFieldAnalysis(defaultPlot);
    }
  }, [profile, profileLoading]);

  // Removed fetchAllLayerData - date-dependent layers are now fetched by useEffect

  // Adjust date by ±15 days
  const isAtOrAfterCurrentDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date >= today;
  };

  const adjustDate = (days: number) => {
    const current = new Date(currentEndDate);
    current.setDate(current.getDate() + days);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const newDate = `${year}-${month}-${day}`;
    setCurrentEndDate(newDate);
    // Keep popup visible and update the value on each click
    setShowDatePopup(true);
  };

  const onLeftArrowClick = () => {
    setPopupSide('left');
    adjustDate(-DAYS_STEP);
  };

  const onRightArrowClick = () => {
    // Only allow forward navigation if we're not at or past the current date
    const today = getCurrentDate();
    const currentDate = new Date(currentEndDate);
    const todayDate = new Date(today);
    
    // Set both to midnight for accurate comparison
    currentDate.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);
    
    // If current date is before today, allow forward navigation
    if (currentDate < todayDate) {
      const nextDate = new Date(currentEndDate);
      nextDate.setDate(nextDate.getDate() + DAYS_STEP);
      
      // Don't go beyond today
      if (nextDate <= todayDate) {
        setPopupSide('right');
        adjustDate(DAYS_STEP);
      } else {
        // If next date would be beyond today, go to today instead
        setPopupSide('right');
        setCurrentEndDate(today);
        setShowDatePopup(true);
      }
    } else {
      // Already at or past current date, do nothing
      return;
    }
  };

  // Helper function for retry logic with exponential backoff
  const fetchWithRetry = async (
    url: string,
    options: RequestInit = {},
    maxRetries: number = 3,
    retryDelay: number = 1000,
    timeout: number | null = null // null = unlimited timeout (wait indefinitely until data comes)
  ): Promise<Response> => {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let controller: AbortController | null = null;
        let timeoutId: NodeJS.Timeout | null = null;
        
        // Only set timeout if specified
        if (timeout !== null && timeout > 0) {
          controller = new AbortController();
          timeoutId = setTimeout(() => controller!.abort(), timeout);
        }
        
        const response = await fetch(url, {
          ...options,
          signal: controller?.signal,
        });
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // If response is ok, return it
        if (response.ok) {
          return response;
        }
        
        // For 502/503/504, retry
        if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt);
          console.log(`Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors, throw
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error: any) {
        lastError = error;
        
        // If it's a network error and we have retries left, retry
        if (
          (error.name === 'TypeError' || 
           error.message?.includes('Failed to fetch') ||
           error.name === 'AbortError') &&
          attempt < maxRetries
        ) {
          const delay = retryDelay * Math.pow(2, attempt);
          console.log(`Network error, retrying (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If no retries left, throw
        throw error;
      }
    }
    
    throw lastError;
  };

  // Helper function to fetch agroStats data for a specific plot
  const fetchAgroStatsData = async (plotName: string): Promise<any> => {
    const cacheKey = `agroStats_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached agroStats data for ${plotName}`);
      return cachedData;
    }

    const url = `${getEventsBaseUrl()}/plots/agroStats?end_date=${currentEndDate}`;

    console.log(`📊 Fetching agroStats data from: ${url}`);

    try {
      const resp = await fetchWithRetry(url, {
        method: "GET",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json"
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        console.error("AgroStats API error response:", errorText);
        
        if (resp.status === 502 || errorText.includes('<html>') || errorText.includes('Bad Gateway')) {
          throw new Error('Backend service is temporarily unavailable. Please try again in a few moments.');
        }
        
        throw new Error(`AgroStats API failed: ${resp.status} ${resp.statusText}`);
      }

      const allPlotsData = await resp.json();
      console.log(`✅ AgroStats data fetched successfully:`, {
        plotCount: Object.keys(allPlotsData || {}).length,
        plotName: plotName,
        hasPlotData: !!allPlotsData[plotName]
      });

      // Extract data for the specific plot
      // Try different plot name formats (with/without quotes, with/without underscores)
      const plotData = allPlotsData[plotName] || 
                       allPlotsData[`"${plotName}"`] ||
                       allPlotsData[plotName.replace(/_/g, '"_"')] ||
                       allPlotsData[`"${plotName.replace(/_/g, '"_"')}"`] ||
                       null;

      if (!plotData) {
        console.warn(`⚠️ Plot ${plotName} not found in agroStats response. Available plots:`, Object.keys(allPlotsData));
        throw new Error(`Plot ${plotName} not found in agroStats data`);
      }

      // Cache the full response and plot-specific data
      setCache(cacheKey, plotData);
      setCache(`agroStats_all_${currentEndDate}`, allPlotsData);

      return plotData;
    } catch (err: any) {
      console.error("Error fetching agroStats data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        url: url,
        plotName: plotName,
        endDate: currentEndDate
      });
      throw err;
    }
  };

  // Helper function to transform agroStats data to GeoJSON format
  const transformAgroStatsToGeoJSON = (plotData: any, plotName: string, dataType: string): any => {
    // Check if data already has GeoJSON structure
    if (plotData?.features && Array.isArray(plotData.features)) {
      return plotData;
    }

    // Try to find geometry in the plot data
    let geometry = null;
    let properties: any = { plot_name: plotName };

    // Look for geometry in various possible locations
    if (plotData?.geometry) {
      geometry = plotData.geometry;
    } else if (plotData?.boundary) {
      geometry = plotData.boundary;
    } else if (plotData?.location) {
      // Create a point geometry if only location is available
      if (plotData.location.coordinates) {
        geometry = {
          type: "Point",
          coordinates: plotData.location.coordinates
        };
      }
    } else if (plotData?.coordinates?.boundary) {
      geometry = plotData.coordinates.boundary;
    } else if (plotData?.coordinates?.location) {
      geometry = {
        type: "Point",
        coordinates: plotData.coordinates.location.coordinates || plotData.coordinates.location
      };
    }

    // Extract data based on dataType - check multiple possible locations
    let extractedData = null;
    
    if (dataType === 'growth') {
      extractedData = plotData?.growth || plotData?.growth_data || plotData?.ndvi || plotData;
    } else if (dataType === 'water_uptake') {
      extractedData = plotData?.water_uptake || plotData?.water_uptake_data || plotData?.ndwi || plotData;
    } else if (dataType === 'soil_moisture') {
      extractedData = plotData?.soil_moisture || plotData?.soil_moisture_data || plotData?.moisture || plotData;
    } else if (dataType === 'pest') {
      extractedData = plotData?.pest || plotData?.pest_data || plotData?.pest_detection || plotData;
    } else {
      extractedData = plotData;
    }

    // Merge extracted data into properties
    if (extractedData && typeof extractedData === 'object') {
      properties = { ...properties, ...extractedData };
    }

    // Create GeoJSON feature
    const feature = {
      type: "Feature",
      geometry: geometry || {
        type: "Polygon",
        coordinates: [[]]
      },
      properties: properties
    };

    return {
      type: "FeatureCollection",
      features: [feature]
    };
  };

  const fetchGrowthData = async (plotName: string) => {
    if (!plotName) return;

    // Check context first (preloaded data)
    const preloadedData = getApiData('growth', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Growth data from context for ${plotName}`);
      setGrowthData(preloadedData);
      if (!plotBoundary && preloadedData?.features?.[0]?.geometry) {
        setPlotBoundary(preloadedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `growth_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Growth data for ${plotName}`);
      setGrowthData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    setLoading(true);
    setError(null);
    
    try {
      // Use direct API URL - CORS is handled on the backend
      // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/analyze_plot_combined_analyze_Growth_post
      const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
      const url = `${baseUrl}/analyze_Growth?plot_name=${encodeURIComponent(plotName)}&end_date=${currentEndDate}&days_back=7`;
      
      console.log(`🌱 Fetching Growth data from: ${url}`);
      
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      }, 3, 1000, null); // Unlimited timeout - wait until data comes

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`Growth API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
      }

      const data = await resp.json();
      
      console.log(`✅ Growth data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        plotName: plotName,
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('growth', plotName, data); // Store in global context
      
      setGrowthData(data);
      
      // Preserve plot boundary from growth data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }
    } catch (err: any) {
      console.error("Error fetching growth data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setGrowthData(null);
      
      // Provide more specific error messages
      let errorMessage = "Failed to fetch growth data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaterUptakeData = async (plotName: string) => {
    if (!plotName) return;

    // Check context first (preloaded data)
    const preloadedData = getApiData('waterUptake', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Water Uptake data from context for ${plotName}`);
      setWaterUptakeData(preloadedData);
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `wateruptake_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Water Uptake data for ${plotName}`);
      setWaterUptakeData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use direct API URL - CORS is handled on the backend
      // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/analyze_water_uptake_wateruptake_post
      const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
      const url = `${baseUrl}/wateruptake?plot_name=${encodeURIComponent(plotName)}&end_date=${currentEndDate}&days_back=7`;
      
      console.log(`💧 Fetching Water Uptake data from: ${url}`);
      
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      }, 3, 1000, null); // Unlimited timeout - wait until data comes

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`Water Uptake API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
      }

      const data = await resp.json();
      
      console.log(`✅ Water Uptake data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        plotName: plotName,
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('waterUptake', plotName, data); // Store in global context
      
      setWaterUptakeData(data);
      
      // Preserve plot boundary from water uptake data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }
    } catch (err: any) {
      console.error("Error fetching water uptake data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setWaterUptakeData(null);
      
      // Provide more specific error messages
      let errorMessage = "Failed to fetch water uptake data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchSoilMoistureData = async (plotName: string) => {
    if (!plotName) return;

    // Check context first (preloaded data)
    const preloadedData = getApiData('soilMoisture', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Soil Moisture data from context for ${plotName}`);
      setSoilMoistureData(preloadedData);
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `soilmoisture_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Soil Moisture data for ${plotName}`);
      setSoilMoistureData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    setLoading(true);
    setError(null);

    try {
      // Use direct API URL - CORS is handled on the backend
      // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/analyze_plot_combined_SoilMoisture_post
      const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
      const url = `${baseUrl}/SoilMoisture?plot_name=${encodeURIComponent(plotName)}&end_date=${currentEndDate}&days_back=7`;
      
      console.log(`🌍 Fetching Soil Moisture data from: ${url}`);
      
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      }, 3, 1000, null); // Unlimited timeout - wait until data comes

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`Soil Moisture API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
      }

      const data = await resp.json();
      
      console.log(`✅ Soil Moisture data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        plotName: plotName,
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('soilMoisture', plotName, data); // Store in global context
      
      setSoilMoistureData(data);
      
      // Preserve plot boundary from soil moisture data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }
    } catch (err: any) {
      console.error("Error fetching soil moisture data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setSoilMoistureData(null);
      
      // Provide more specific error messages
      let errorMessage = "Failed to fetch soil moisture data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlotData = async (plotName: string) => {
    setLoading(true);
    setError(null);

    const currentDate = getCurrentDate();
    // Use direct API URL as per API documentation: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/analyze_Growth_analyze_Growth_post
    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    // Endpoint: /analyze_Growth (from API documentation)
    const url = `${baseUrl}/analyze_Growth?plot_name=${encodeURIComponent(plotName)}&end_date=${currentDate}&days_back=7`;

    console.log(`🗺️ Fetching plot data from: ${url}`);

    try {
      // Use retry logic for better reliability
      // POST request with query parameters as per API documentation
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        console.error("Plot API error response:", errorText);
        
        // Handle 502 Bad Gateway - filter out HTML error page
        if (resp.status === 502 || errorText.includes('<html>') || errorText.includes('Bad Gateway')) {
          throw new Error('Backend service is temporarily unavailable. Please try again in a few moments.');
        }
        
        throw new Error(`Plot API failed: ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      setPlotData(data);
      
      // Preserve plot boundary separately so it persists across layer changes
      // Only update if we don't already have a boundary from profile
      if (data?.features?.[0]?.geometry && !plotBoundary) {
        console.log('🗺️ Map: Setting plot boundary from API response');
        setPlotBoundary(data.features[0]);
      } else if (plotBoundary) {
        console.log('🗺️ Map: Keeping existing plot boundary from profile');
      }
    } catch (err: any) {
      console.error("Error fetching plot data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        url: url,
        plotName: plotName,
        endDate: currentDate
      });
      
      // Provide more specific error messages
      let errorMessage = "Failed to fetch plot data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        // Check for CORS error specifically
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      // Don't clear plotData or plotBoundary on error - keep existing plot visible
      // Only clear if this is a new plot selection
      if (!plotBoundary || plotBoundary.properties?.plot_name !== plotName) {
        setPlotData(null);
        setPlotBoundary(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFieldAnalysis = async (plotName: string) => {
    if (!plotName) return;

    try {
      const currentDate = getCurrentDate();
      // Use direct API URL - CORS is handled on the backend
      const baseUrl = 'https://cropeye-grapes-sef-production.up.railway.app';
      const url = `${baseUrl}/analyze?plot_name=${plotName}&end_date=${currentDate}&days_back=7`;
      
      console.log(`🔍 Fetching field analysis from: ${url}`);
      
      // Use retry logic for better reliability
      const resp = await fetchWithRetry(url, {
        method: "GET",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`Field analysis API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
      }

      const data = await resp.json();
      // console.log("Field analysis API response:", data);

      let fieldData: any = null;

      if (Array.isArray(data)) {
        const plotData = data.filter((item: any) => {
          const itemPlotName = item.plot_name || item.plot || item.name || '';
          return itemPlotName === plotName;
        });

        if (plotData.length > 0) {
          plotData.sort((a: any, b: any) => {
            const dateA = a.date || a.analysis_date || '';
            const dateB = b.date || b.analysis_date || '';
            return dateB.localeCompare(dateA);
          });

          fieldData = plotData[0];
        }
      } else if (typeof data === "object" && data !== null) {
        fieldData = data;
      }

      if (fieldData) {
        const overallHealth = fieldData?.overall_health ?? fieldData?.health_score ?? 0;
        const healthStatus = fieldData?.health_status ?? fieldData?.status ?? "Unknown";
        const meanValue = fieldData?.statistics?.mean ?? fieldData?.mean ?? 0;

        const analysisData = {
          plotName: fieldData.plot_name ?? plotName,
          overallHealth,
          healthStatus,
          statistics: {
            mean: meanValue,
          },
        };

        setFieldAnalysisData(analysisData);
        if (onFieldAnalysisChange) {
          onFieldAnalysisChange(analysisData);
        }
      }
    } catch (err) {
      // console.error("Error in fetchFieldAnalysis:", err);
    }
  };

  const fetchPestData = async (plotName: string) => {
    if (!plotName) {
      setPestData(null);
      return;
    }

    // Check context first (preloaded data)
    const preloadedData = getApiData('pest', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Pest Detection data from context for ${plotName}`);
      setPestData(preloadedData);
      if (!plotBoundary && preloadedData?.features?.[0]?.geometry) {
        setPlotBoundary(preloadedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `pest_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Pest Detection data for ${plotName}`);
      setPestData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    setLoading(true);
    setError(null);

    try {
      // Use direct API URL - CORS is handled on the backend
      // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/pest_detection_by_crop_pest_detection_post
      const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
      const url = `${baseUrl}/pest-detection?plot_name=${encodeURIComponent(plotName)}`;
      
      console.log(`🐛 Fetching Pest Detection data from: ${url}`);
      
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      }, 3, 1000, null); // Unlimited timeout - wait until data comes

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`Pest Detection API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
      }

      const data = await resp.json();
      
      console.log(`✅ Pest Detection data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        plotName: plotName,
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('pest', plotName, data); // Store in global context
      
      setPestData(data);
      
      // Preserve plot boundary from pest data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }

      // Extract pixel_summary from response data
      const pixelSummary = data?.pixel_summary || data?.pest?.pixel_summary;
      if (pixelSummary && onPestDataChange) {
        const chewingPestPercentage = pixelSummary.chewing_affected_pixel_percentage || 0;
        const suckingPercentage = pixelSummary.sucking_affected_pixel_percentage || 0;
        const fungiPercentage = pixelSummary.fungi_affected_pixel_percentage || 0;
        const soilBornePercentage = pixelSummary.SoilBorn_affected_pixel_percentage || 0;

        const totalAffectedPercentage = chewingPestPercentage + suckingPercentage + fungiPercentage + soilBornePercentage;
        
        onPestDataChange({
          plotName,
          pestPercentage: totalAffectedPercentage,
          healthyPercentage: 100 - totalAffectedPercentage,
          totalPixels: pixelSummary.total_pixel_count || 0,
          pestAffectedPixels: (pixelSummary.chewing_affected_pixel_count || 0) + 
                             (pixelSummary.sucking_affected_pixel_count || 0) + 
                             (pixelSummary.fungi_affected_pixel_count || 0) +  
                             (pixelSummary.SoilBorn_pixel_count || 0),
          chewingPestPercentage,
          chewingPestPixels: pixelSummary.chewing_affected_pixel_count || 0,
          suckingPercentage,
          suckingPixels: pixelSummary.sucking_affected_pixel_count || 0,
        });
      }
    } catch (err: any) {
      console.error("Error fetching pest data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setPestData(null);
      
      // Provide more specific error messages
      let errorMessage = "Failed to fetch pest data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchCanopyVigour = async (plotName: string) => {
    if (!plotName) {
      setCanopyVigourData(null);
      return;
    }

    // Check context first (preloaded data)
    const preloadedData = getApiData('canopyVigour', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Canopy Vigour data from context for ${plotName}`);
      setCanopyVigourData(preloadedData);
      if (!plotBoundary && preloadedData?.features?.[0]?.geometry) {
        setPlotBoundary(preloadedData.features[0]);
      }
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `canopy_vigour_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Canopy Vigour data for ${plotName}`);
      setCanopyVigourData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    setLoading(true);
    setError(null);

    // Use direct API URL - CORS is handled on the backend
    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    // Endpoint: /grapes/canopy-vigour1 (for Brix layer background)
    const url = `${baseUrl}/grapes/canopy-vigour1?plot_name=${plotName}`;

    console.log(`🌿 Fetching Canopy Vigour data from: ${url}`);

    try {
      // Use retry logic for better reliability
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json"
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        console.error("Canopy Vigour API error response:", errorText);
        
        if (resp.status === 502 || errorText.includes('<html>') || errorText.includes('Bad Gateway')) {
          throw new Error('Backend service is temporarily unavailable. Please try again in a few moments.');
        }
        
        throw new Error(`Canopy Vigour API failed: ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      console.log(`✅ Canopy Vigour data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        hasTileUrl: !!data?.features?.[0]?.properties?.tile_url,
        plotName: plotName,
        dataKeys: Object.keys(data || {})
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('canopyVigour', plotName, data); // Store in global context
      
      setCanopyVigourData(data);
      
      // Preserve plot boundary from canopy vigour data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }
    } catch (err: any) {
      console.error("Error fetching canopy vigour data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setCanopyVigourData(null);
      
      let errorMessage = "Failed to fetch canopy vigour data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      // Don't set loading to false here - let fetchBrixData handle it
      // since both are called together for Brix layer
    }
  };

  const fetchBrixData = async (plotName: string) => {
    if (!plotName) {
      setBrixData(null);
      return;
    }

    // Check context first (preloaded data)
    const preloadedData = getApiData('brix', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Brix data from context for ${plotName}`);
      setBrixData(preloadedData);
      if (!plotBoundary && preloadedData?.features?.[0]?.geometry) {
        setPlotBoundary(preloadedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `brix_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Brix data for ${plotName}`);
      setBrixData(cachedData);
      if (!plotBoundary && cachedData?.features?.[0]?.geometry) {
        setPlotBoundary(cachedData.features[0]);
      }
      setLoading(false);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    setLoading(true);
    setError(null);

    // Use direct API URL - CORS is handled on the backend
    // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/grapes_brix_grid_values_grapes_brix_grid_values_post
    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    // Correct endpoint: /grapes/brix-grid-values (POST method)
    const url = `${baseUrl}/grapes/brix-grid-values?plot_name=${encodeURIComponent(plotName)}`;

    console.log(`🍇 Fetching Brix data from: ${url}`);

    try {
      // Use retry logic for better reliability
      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json"
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        console.error("Brix API error response:", errorText);
        
        if (resp.status === 502 || errorText.includes('<html>') || errorText.includes('Bad Gateway')) {
          throw new Error('Backend service is temporarily unavailable. Please try again in a few moments.');
        }
        
        throw new Error(`Brix API failed: ${resp.status} ${resp.statusText}`);
      }
      
      const data = await resp.json();
      console.log(`✅ Brix data fetched successfully:`, {
        hasFeatures: !!data?.features,
        featureCount: data?.features?.length || 0,
        hasGridValues: !!data?.grid_values,
        gridValuesCount: data?.grid_values?.length || 0,
        plotName: plotName,
        dataKeys: Object.keys(data || {})
      });
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('brix', plotName, data); // Store in global context
      
      setBrixData(data);
      
      // Preserve plot boundary from brix data if not already set
      if (!plotBoundary && data?.features?.[0]?.geometry) {
        setPlotBoundary(data.features[0]);
      }
    } catch (err: any) {
      console.error("Error fetching brix data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName,
        endDate: currentEndDate
      });
      setBrixData(null);
      
      let errorMessage = "Failed to fetch brix data";
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError" || err?.name === "AbortError") {
        if (err?.message?.includes("CORS") || err?.message?.includes("cors")) {
          errorMessage = "CORS error: Backend server is not allowing requests from this origin. Please check CORS configuration on the server.";
        } else if (err?.name === "AbortError") {
          errorMessage = "Request timed out. The server is taking too long to respond. Please check your internet connection and try again.";
        } else {
          errorMessage = "Cannot connect to server. Please check if the backend service is running and accessible.";
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Brix quality graph data for displaying values in grid boxes
  const fetchBrixQualityData = async (plotName: string) => {
    if (!plotName) {
      setBrixQualityData(null);
      return;
    }

    // If Brix grid values are already available (same backend response),
    // reuse them instead of making another request.
    if (brixData?.grid_values && Array.isArray(brixData.grid_values)) {
      console.log(`✅ Reusing Brix grid values for Brix Quality (${plotName})`);
      setBrixQualityData(brixData);
      setApiData('brixQuality', plotName, brixData);
      return Promise.resolve();
    }

    // Check context first (preloaded data)
    const preloadedData = getApiData('brixQuality', plotName);
    if (preloadedData) {
      console.log(`✅ Using preloaded Brix Quality data from context for ${plotName}`);
      setBrixQualityData(preloadedData);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    // Check cache second
    const cacheKey = `brixQuality_${plotName}_${currentEndDate}`;
    const cachedData = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    
    if (cachedData) {
      console.log(`✅ Using cached Brix Quality data for ${plotName}`);
      setBrixQualityData(cachedData);
      return Promise.resolve(); // Return resolved promise to mark as loaded
    }

    try {
      // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/grapes_brix_grid_values_grapes_brix_grid_values_post
      const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
      const url = `${baseUrl}/grapes/brix-grid-values?plot_name=${encodeURIComponent(plotName)}`;

      console.log(`🍇 Fetching Brix Quality data from: ${url}`);

      const resp = await fetchWithRetry(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json"
        },
      }, 3, 1000, null); // No timeout

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        console.error("Brix Quality API error response:", errorText);
        throw new Error(`Brix Quality API failed: ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      console.log(`✅ Brix Quality data fetched successfully:`, data);
      
      // Cache the data in both localStorage and context
      setCache(cacheKey, data);
      setApiData('brixQuality', plotName, data); // Store in global context
      setBrixQualityData(data);
    } catch (err: any) {
      console.error("Error fetching brix quality data:", {
        error: err,
        message: err?.message,
        name: err?.name,
        plotName: plotName
      });
      setBrixQualityData(null);
    }
  };

  // Helper function to get Brix color based on value (kept for potential future use)
  // const getBrixColor = (brix: number): string => {
  //   if (brix < 19) return "#ef4444"; // Red
  //   if (brix >= 19 && brix < 20) return "#f97316"; // Orange
  //   if (brix >= 20 && brix < 21) return "#eab308"; // Yellow
  //   if (brix >= 21 && brix <= 22) return "#84cc16"; // Light Green
  //   return "#22c55e"; // Dark Green (> 22)
  // };

  // Render Brix grid cells with white grid overlay and Brix values as text
  const renderBrixGrid = () => {
    if (activeLayer !== "Brix" || !brixData?.grid_values || !Array.isArray(brixData.grid_values)) {
      return null;
    }

    // Get plot polygon for clipping
    const plotFeature = plotBoundary || plotData?.features?.[0];
    if (!plotFeature?.geometry?.coordinates?.[0]) {
      return null; // Don't render if no plot boundary
    }

    // Extract polygon coordinates - convert from GeoJSON format [lng, lat] to [lat, lng] for point-in-polygon check
    const polygonCoords = plotFeature.geometry.coordinates[0].map((coord: number[]) => {
      // GeoJSON format is [lng, lat], convert to [lat, lng] for our function
      return [coord[1], coord[0]] as [number, number];
    });

    // Create a map of brix values by coordinates from brixQualityData if available
    const brixValueMap: { [key: string]: number } = {};
    if (brixQualityData && Array.isArray(brixQualityData)) {
      brixQualityData.forEach((item: any) => {
        if (item.latitude !== undefined && item.longitude !== undefined && item.brix !== undefined) {
          const key = `${item.latitude.toFixed(6)}_${item.longitude.toFixed(6)}`;
          brixValueMap[key] = item.brix;
        }
      });
    }

    const gridValues = brixData.grid_values;
    
    // Calculate actual grid spacing from the dataset
    let latStep = 0.0000898; // Default spacing
    let lngStep = 0.0000898; // Default spacing
    
    if (gridValues.length > 1) {
      // Calculate average spacing between adjacent points
      const sortedByLat = [...gridValues].sort((a, b) => a.latitude - b.latitude);
      const sortedByLng = [...gridValues].sort((a, b) => a.longitude - b.longitude);
      
      let latSpacing = 0;
      let lngSpacing = 0;
      let latCount = 0;
      let lngCount = 0;
      
      // Calculate spacing for latitude (vertical spacing)
      for (let i = 1; i < sortedByLat.length; i++) {
        const diff = Math.abs(sortedByLat[i].latitude - sortedByLat[i-1].latitude);
        if (diff > 0.00001) { // Ignore very small differences (likely same row)
          latSpacing += diff;
          latCount++;
        }
      }
      
      // Calculate spacing for longitude (horizontal spacing)
      for (let i = 1; i < sortedByLng.length; i++) {
        const diff = Math.abs(sortedByLng[i].longitude - sortedByLng[i-1].longitude);
        if (diff > 0.00001) { // Ignore very small differences (likely same column)
          lngSpacing += diff;
          lngCount++;
        }
      }
      
      if (latCount > 0) {
        latStep = latSpacing / latCount;
      }
      if (lngCount > 0) {
        lngStep = lngSpacing / lngCount;
      }
      
      // Use the maximum spacing to ensure square grid cells
      const gridStep = Math.max(latStep, lngStep);
      latStep = gridStep;
      lngStep = gridStep;
    }

    // Calculate half sizes for centering
    const halfLat = latStep / 2;
    const halfLng = lngStep / 2;

    return gridValues
      .filter((gridPoint: any) => {
        // Only render points that are inside the plot polygon
        const { latitude, longitude } = gridPoint;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return false;
        }
        // Check if point is inside polygon
        return isPointInPolygon([latitude, longitude], polygonCoords);
      })
      .map((gridPoint: any, index: number) => {
        const { latitude, longitude, brix } = gridPoint;

        // Create a perfect square grid cell centered at the Brix coordinate
        // The coordinate is the exact center of the grid box
        const bounds: [[number, number], [number, number]] = [
          [latitude - halfLat, longitude - halfLng], // Bottom-left corner
          [latitude + halfLat, longitude + halfLng]   // Top-right corner
        ];

        // Try to get Brix value from brixQualityData first, fallback to gridPoint.brix
        const key = `${latitude.toFixed(6)}_${longitude.toFixed(6)}`;
        const brixValue = key in brixValueMap ? brixValueMap[key] : (typeof brix === 'number' ? brix : null);
        const finalBrixValue = isHarvested ? 0 : brixValue;
        const isMissingBrix = finalBrixValue === null || finalBrixValue === 0;

        // Only render grid cells with missing/zero brix (00)
        if (!isMissingBrix) return null;

        return (
          <React.Fragment key={`brix-grid-${index}-${latitude}-${longitude}`}>
            <Rectangle
              bounds={bounds}
              pathOptions={{
                fillColor: "#ef4444",
                fillOpacity: 0.5,
                color: "rgba(255, 255, 255, 0.8)",
                weight: 1,
                opacity: 0.8,
              }}
              eventHandlers={{
                mouseover: (e: any) => {
                  const container = e.target.getContainer();
                  if (container) {
                    container.style.cursor = 'pointer';
                  }
                  setPixelTooltip({
                    layers: [{
                      layer: "Brix",
                      label: "Brix: 00",
                      description: "",
                      percentage: 0
                    }],
                    x: e.originalEvent.clientX,
                    y: e.originalEvent.clientY
                  });
                },
                mouseout: () => {
                  setPixelTooltip(null);
                },
                mousemove: (e: any) => {
                  setPixelTooltip({
                    layers: [{
                      layer: "Brix",
                      label: "Brix: 00",
                      description: "",
                      percentage: 0
                    }],
                    x: e.originalEvent.clientX,
                    y: e.originalEvent.clientY - 10
                  });
                }
              }}
            />
            <BrixValueMarker
              position={[latitude, longitude]}
              value="00"
            />
          </React.Fragment>
        );
      });
  };

  // Flexible extractor for tile URL from various possible shapes (extracted to be reusable)
  const extractTileUrl = useCallback((data: any): string | null => {
    if (!data || typeof data !== 'object') return null;

    // Common paths
    const candidates = [
      data?.features?.[0]?.properties?.tile_url,
      data?.features?.[0]?.properties?.tileURL,
      data?.features?.[0]?.properties?.tileServerUrl,
      data?.features?.[0]?.properties?.tiles,
      data?.properties?.tile_url,
      data?.tile_url,
      data?.tileURL,
      data?.tileServerUrl,
    ].filter(Boolean);

    // If tiles is an array, pick first
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        const url = typeof c[0] === 'string' ? c[0] : null;
        if (url && url.includes('{z}') && url.includes('{x}') && url.includes('{y}')) {
          return url;
        }
      }
      if (typeof c === 'string' && c.includes('{z}') && c.includes('{x}') && c.includes('{y}')) {
        return c;
      }
    }
    return null;
  }, []);

  const getActiveLayerUrl = () => {

    let rawUrl: string | null = null;
    if (activeLayer === "PEST") rawUrl = extractTileUrl(pestData);
    else if (activeLayer === "Growth") rawUrl = extractTileUrl(growthData);
    else if (activeLayer === "Water Uptake") rawUrl = extractTileUrl(waterUptakeData);
    else if (activeLayer === "Soil Moisture") rawUrl = extractTileUrl(soilMoistureData);
    else if (activeLayer === "Brix") {
      // For Brix layer, return null - canopy vigour is rendered separately as background
      // The Brix grid and numbers will be rendered on top of the canopy layer
      rawUrl = null;
    }

    if (!rawUrl) {
      // console.warn(`[Map] No tile_url found for layer ${activeLayer}`);
      return null;
    }

    // Validate tile template contains placeholders
    const hasTemplate = rawUrl.includes('{z}') && rawUrl.includes('{x}') && rawUrl.includes('{y}');
    if (!hasTemplate) {
      // console.warn(`[Map] tile_url missing template placeholders for layer ${activeLayer}:`, rawUrl);
      return null;
    }

    return rawUrl;
  };

  // Memoize active URL to track changes
  // Include canopyVigourData in dependencies for Brix layer
  const activeUrl = useMemo(() => getActiveLayerUrl(), [activeLayer, pestData, growthData, waterUptakeData, soilMoistureData, brixData, canopyVigourData]);

  // Use plotBoundary if available (persists across layer changes), otherwise fall back to plotData
  const currentPlotFeature = plotBoundary || plotData?.features?.[0];

  const plotAreaLabel = useMemo(() => {
    const acres = currentPlotFeature?.properties?.area_acres;
    if (typeof acres === "number" && !isNaN(acres)) {
      return acres.toFixed(2);
    }
    return "0.00";
  }, [currentPlotFeature]);

  const legendData = useMemo(() => {
    if (activeLayer === "Brix") {
      const pixelSummary = brixData?.pixel_summary;
      if (!pixelSummary) return [];

      // Add Brix legend items based on your API response structure
      // Adjust these based on actual API response
      return [
        { label: "Low", color: "#FFE5E5", percentage: Math.round(pixelSummary.low_pixel_percentage || 0), description: "Low brix content" },
        { label: "Medium", color: "#FFCC99", percentage: Math.round(pixelSummary.medium_pixel_percentage || 0), description: "Medium brix content" },
        { label: "High", color: "#FF9900", percentage: Math.round(pixelSummary.high_pixel_percentage || 0), description: "High brix content" },
        { label: "Very High", color: "#FF6600", percentage: Math.round(pixelSummary.very_high_pixel_percentage || 0), description: "Very high brix content" }
      ];
    }

    if (activeLayer === "PEST") {
      const chewingPestPercentage = pestData?.pixel_summary?.chewing_affected_pixel_percentage || 0;
      const suckingPercentage = pestData?.pixel_summary?.sucking_affected_pixel_percentage || 0;
      const fungiPercentage = pestData?.pixel_summary?.fungi_affected_pixel_percentage || 0;
      const soilBornePercentage = pestData?.pixel_summary?.SoilBorn_affected_pixel_percentage || 0;
      
      return [
        { label: "Chewing pest", color: "#DC2626", percentage: Math.round(chewingPestPercentage), description: "Areas affected by chewing pests" },
        { label: "Sucking pest", color: "#B91C1C", percentage: Math.round(suckingPercentage), description: "Areas affected by sucking disease" },
        { label: "fungus", color: "#991B1B", percentage: Math.round(fungiPercentage), description: "fungi infections affecting plants" },
        { label: "Soil Borne pathozane ", color: "#7F1D1D", percentage: Math.round(soilBornePercentage), description: "Soil borne infections affecting plants" },
        
      ];
    }

    if (activeLayer === "Water Uptake") {
      const pixelSummary = waterUptakeData?.pixel_summary;
      if (!pixelSummary) return [];

      return [
        { label: "Deficient", color: "#E6F3FF", percentage: Math.round(pixelSummary.deficient_pixel_percentage || 0), description: "weak root" },
        { label: "Less", color: "#87CEEB", percentage: Math.round(pixelSummary.less_pixel_percentage || 0), description: "weak roots" },
        { label: "Adequate", color: "#4682B4", percentage: Math.round(pixelSummary.adequat_pixel_percentage || 0), description: "healthy roots" },
        { label: "Excellent", color: "#1E90FF", percentage: Math.round(pixelSummary.excellent_pixel_percentage || 0), description: "healthy roots" },
        { label: "Excess", color: "#000080", percentage: Math.round(pixelSummary.excess_pixel_percentage || 0), description: "root logging" }
      ];
    }

    if (activeLayer === "Soil Moisture") {
      const pixelSummary = soilMoistureData?.pixel_summary;
      if (!pixelSummary) return [];

      return [
        { label: "Less", color: "#9fd4d2", percentage: Math.round(pixelSummary.less_pixel_percentage || 0), description: "less soil moisture" },
        { label: "Adequate", color: "#8fc7c5", percentage: Math.round(pixelSummary.adequate_pixel_percentage || 0), description: "Irrigation need" },
        { label: "Excellent", color: "#8fe3e0", percentage: Math.round(pixelSummary.excellent_pixel_percentage || 0), description: "no irrigation require" },
        { label: "Excess", color: "#74dbd8", percentage: Math.round(pixelSummary.excess_pixel_percentage || 0), description: "water logging" },
        { label: "Shallow", color: "#50f2ec", percentage: Math.round(pixelSummary.shallow_water_pixel_percentage || 0), description: "water source" }
      ];
    }

    if (activeLayer === "Growth") {
      const pixelSummary = growthData?.pixel_summary;
      if (!pixelSummary) return [];

      return [
        { label: "Weak", color: "#90EE90", percentage: Math.round(pixelSummary.weak_pixel_percentage || 0), description: "damaged or weak crop" },
        { label: "Stress", color: "#32CD32", percentage: Math.round(pixelSummary.stress_pixel_percentage || 0), description: "crop under stress" },
        { label: "Moderate", color: "#228B22", percentage: Math.round(pixelSummary.moderate_pixel_percentage || 0), description: "Crop under normal growth" },
        { label: "Healthy", color: "#006400", percentage: Math.round(pixelSummary.healthy_pixel_percentage || 0), description: "proper growth" }
      ];
    }

    return [];
  }, [activeLayer, pestData, waterUptakeData, soilMoistureData, growthData, brixData]);

  const getFilteredPixels = useMemo(() => {
    // console.log('getFilteredPixels called with:', { selectedLegendClass, activeLayer });
    
    if (!selectedLegendClass) {
      // console.log('No selectedLegendClass, returning empty array');
      return [];
    }

    if (activeLayer === "PEST") {
      if (!pestData || !currentPlotFeature) {
        // console.log('Missing pestData or currentPlotFeature');
        return [];
      }

      // console.log('Processing PEST layer for selectedLegendClass:', selectedLegendClass);
      
      if (!["Chewing", "Sucking", "fungi", "Soil Borne"].includes(selectedLegendClass)) {
        // console.log('SelectedLegendClass not in allowed pest categories:', selectedLegendClass);
        return [];
      }
      
      let coordinates = [];
      let pestType = "";
      
      if (selectedLegendClass === "Chewing") {
        coordinates = pestData.pixel_summary?.chewing_affected_pixel_coordinates || [];
        pestType = "Chewing";
      } else if (selectedLegendClass === "Sucking") {
        coordinates = pestData.pixel_summary?.sucking_affected_pixel_coordinates || [];
        pestType = "Sucking";
      } else if (selectedLegendClass === "fungi") {
        coordinates = pestData.pixel_summary?.fungi_affected_pixel_coordinates || [];
        pestType = "fungi";
      } else if (selectedLegendClass === "Soil Borne") {
        coordinates = pestData.pixel_summary?.SoilBorne_affected_pixel_coordinates || [];
        pestType = "Soil Borne";
      }
      
      if (!coordinates || !Array.isArray(coordinates)) {
        // console.log('No valid coordinates found for', pestType);
        return [];
      }
      
      // console.log(`Found ${coordinates.length} coordinates for ${pestType}`);

      const actualPixels = coordinates.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        
        return {
          geometry: {
            coordinates: [coord[0], coord[1]]
          },
          properties: {
            pixel_id: `${pestType.toLowerCase().replace(/\s+/g, '-')}-${index}`,
            pest_type: pestType,
            pest_category: pestType
          }
        };
      }).filter(Boolean);
      
      // console.log(`Generated ${actualPixels.length} pixel objects for ${pestType}`);
      return actualPixels;
    }
    
    if (activeLayer === "Water Uptake") {
      if (!waterUptakeData || !currentPlotFeature) {
        // console.log('Missing waterUptakeData or currentPlotFeature');
        return [];
      }

      //    console.log('Processing Water Uptake layer for selectedLegendClass:', selectedLegendClass);

      const pixelSummary = waterUptakeData.pixel_summary;
      if (!pixelSummary) return [];

      let coordinates = [];
      let categoryType = "";

      if (selectedLegendClass === "Deficient") {
        coordinates = pixelSummary.deficient_pixel_coordinates || [];
        categoryType = "Deficient";
      } else if (selectedLegendClass === "Less") {
        coordinates = pixelSummary.less_pixel_coordinates || [];
        categoryType = "Less";
      } else if (selectedLegendClass === "Adequate") {
        coordinates = pixelSummary.adequat_pixel_coordinates || [];
        categoryType = "Adequate";
      } else if (selectedLegendClass === "Excellent") {
        coordinates = pixelSummary.excellent_pixel_coordinates || [];
        categoryType = "Excellent";
      } else if (selectedLegendClass === "Excess") {
        coordinates = pixelSummary.excess_pixel_coordinates || [];
        categoryType = "Excess";
      }

      if (!coordinates || !Array.isArray(coordinates)) {
        // console.log('No valid coordinates found for', categoryType);
      return [];
    }
    
      // console.log(`Found ${coordinates.length} coordinates for ${categoryType}`);

      const actualPixels = coordinates.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;

        return {
          geometry: {
            coordinates: [coord[0], coord[1]]
          },
          properties: {
            pixel_id: `${categoryType.toLowerCase().replace(/\s+/g, '-')}-${index}`,
            category_type: categoryType,
            water_uptake_category: categoryType
          }
        };
      }).filter(Boolean);

      // console.log(`Generated ${actualPixels.length} pixel objects for ${categoryType}`);
      return actualPixels;
    }

    if (activeLayer === "Soil Moisture") {
      if (!soilMoistureData || !currentPlotFeature) {
        // console.log('Missing soilMoistureData or currentPlotFeature');
        return [];
      }

      // console.log('Processing Soil Moisture layer for selectedLegendClass:', selectedLegendClass);

      const pixelSummary = soilMoistureData.pixel_summary;
      if (!pixelSummary) return [];

      let coordinates = [];
      let categoryType = "";

      if (selectedLegendClass === "Less") {
        coordinates = pixelSummary.less_pixel_coordinates || [];
        categoryType = "Less";
      } else if (selectedLegendClass === "Adequate") {
        coordinates = pixelSummary.adequate_pixel_coordinates || [];
        categoryType = "Adequate";
      } else if (selectedLegendClass === "Excellent") {
        coordinates = pixelSummary.excellent_pixel_coordinates || [];
        categoryType = "Excellent";
      } else if (selectedLegendClass === "Excess") {
        coordinates = pixelSummary.excess_pixel_coordinates || [];
        categoryType = "Excess";
      } else if (selectedLegendClass === "Shallow") {
        coordinates = pixelSummary.shallow_water_pixel_coordinates || [];
        categoryType = "Shallow";
      }

      if (!coordinates || !Array.isArray(coordinates)) {
        // console.log('No valid coordinates found for', categoryType);
        return [];
      }

      // console.log(`Found ${coordinates.length} coordinates for ${categoryType}`);

      const actualPixels = coordinates.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;

        return {
          geometry: {
            coordinates: [coord[0], coord[1]]
          },
          properties: {
            pixel_id: `${categoryType.toLowerCase().replace(/\s+/g, '-')}-${index}`,
            category_type: categoryType,
            soil_moisture_category: categoryType
          }
        };
      }).filter(Boolean);

      // console.log(`Generated ${actualPixels.length} pixel objects for ${categoryType}`);
      return actualPixels;
    }

    if (activeLayer === "Growth") {
      if (!growthData || !currentPlotFeature) {
        // console.log('Missing growthData or currentPlotFeature');
        return [];
      }

      // console.log('Processing Growth layer for selectedLegendClass:', selectedLegendClass);

      const pixelSummary = growthData.pixel_summary;
      if (!pixelSummary) return [];

      let coordinates = [];
      let categoryType = "";

      if (selectedLegendClass === "Weak") {
        coordinates = pixelSummary.weak_pixel_coordinates || [];
        categoryType = "Weak";
      } else if (selectedLegendClass === "Stress") {
        coordinates = pixelSummary.stress_pixel_coordinates || [];
        categoryType = "Stress";
      } else if (selectedLegendClass === "Moderate") {
        coordinates = pixelSummary.moderate_pixel_coordinates || [];
        categoryType = "Moderate";
      } else if (selectedLegendClass === "Healthy") {
        coordinates = pixelSummary.healthy_pixel_coordinates || [];
        categoryType = "Healthy";
      }

      if (!coordinates || !Array.isArray(coordinates)) {
        // console.log('No valid coordinates found for', categoryType);
        return [];
      }

      // console.log(`Found ${coordinates.length} coordinates for ${categoryType}`);

      const actualPixels = coordinates.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;

    return {
          geometry: {
            coordinates: [coord[0], coord[1]]
          },
          properties: {
            pixel_id: `${categoryType.toLowerCase().replace(/\s+/g, '-')}-${index}`,
            category_type: categoryType,
            growth_category: categoryType
          }
        };
      }).filter(Boolean);

      // console.log(`Generated ${actualPixels.length} pixel objects for ${categoryType}`);
      return actualPixels;
    }

    return [];
  }, [selectedLegendClass, activeLayer, pestData, waterUptakeData, soilMoistureData, growthData, currentPlotFeature]);

  const getMultiLayerDataForPosition = (coords: number[]) => {
    const allLayerData = [];
    const tolerance = 0.00001;
    
    // Helper function to find category for coordinates in a layer
    const findCategoryInLayer = (layerData: any, layerName: string, legendItems: any[]) => {
      if (!layerData?.pixel_summary) return null;
      
      for (const legendItem of legendItems) {
        const coordsKey = getCoordinatesKey(layerName, legendItem.label);
        const coordinates = layerData.pixel_summary[coordsKey] || [];
        
        const found = coordinates.find((coord: number[]) => 
          Math.abs(coord[0] - coords[0]) < tolerance && 
          Math.abs(coord[1] - coords[1]) < tolerance
        );
        
        if (found) {
          return {
            layer: layerName,
            label: legendItem.label,
            description: legendItem.description,
            percentage: legendItem.percentage
          };
        }
      }
      return null;
    };
    
    // Get coordinates key for each layer type
    const getCoordinatesKey = (layerName: string, label: string) => {
      if (layerName === 'Growth') {
        return `${label.toLowerCase()}_pixel_coordinates`;
      } else if (layerName === 'Water Uptake') {
        if (label === 'Adequate') return 'adequat_pixel_coordinates';
        return `${label.toLowerCase()}_pixel_coordinates`;
      } else if (layerName === 'Soil Moisture') {
        if (label === 'Shallow') return 'shallow_water_pixel_coordinates';
        return `${label.toLowerCase()}_pixel_coordinates`;
      } else if (layerName === 'PEST') {
        if (label === 'Chewing') return 'chewing_affected_pixel_coordinates';
        if (label === 'Sucking') return 'sucking_affected_pixel_coordinates';
        if (label === 'fungi') return 'fungi_affected_pixel_coordinates';
        if (label === 'Soil Borne') return 'SoilBorne_affected_pixel_coordinates';
      }
      return '';
    };
    
    // Check Growth layer
    if (growthData) {
      const growthLegend = [
        { label: "Weak", description: "damaged or weak crop", percentage: Math.round(growthData.pixel_summary?.weak_pixel_percentage || 0) },
        { label: "Stress", description: "crop under stress", percentage: Math.round(growthData.pixel_summary?.stress_pixel_percentage || 0) },
        { label: "Moderate", description: "Crop under normal growth", percentage: Math.round(growthData.pixel_summary?.moderate_pixel_percentage || 0) },
        { label: "Healthy", description: "proper growth", percentage: Math.round(growthData.pixel_summary?.healthy_pixel_percentage || 0) }
      ];
      const growthResult = findCategoryInLayer(growthData, 'Growth', growthLegend);
      if (growthResult) allLayerData.push(growthResult);
    }
    
    // Check Water Uptake layer
    if (waterUptakeData) {
      const waterLegend = [
        { label: "Deficient", description: "weak root", percentage: Math.round(waterUptakeData.pixel_summary?.deficient_pixel_percentage || 0) },
        { label: "Less", description: "weak roots", percentage: Math.round(waterUptakeData.pixel_summary?.less_pixel_percentage || 0) },
        { label: "Adequate", description: "healthy roots", percentage: Math.round(waterUptakeData.pixel_summary?.adequat_pixel_percentage || 0) },
        { label: "Excellent", description: "healthy roots", percentage: Math.round(waterUptakeData.pixel_summary?.excellent_pixel_percentage || 0) },
        { label: "Excess", description: "root logging", percentage: Math.round(waterUptakeData.pixel_summary?.excess_pixel_percentage || 0) }
      ];
      const waterResult = findCategoryInLayer(waterUptakeData, 'Water Uptake', waterLegend);
      if (waterResult) allLayerData.push(waterResult);
    }
    
    // Check Soil Moisture layer
    if (soilMoistureData) {
      const soilLegend = [
        { label: "Less", description: "less soil moisture", percentage: Math.round(soilMoistureData.pixel_summary?.less_pixel_percentage || 0) },
        { label: "Adequate", description: "Irrigation need", percentage: Math.round(soilMoistureData.pixel_summary?.adequate_pixel_percentage || 0) },
        { label: "Excellent", description: "no irrigation require", percentage: Math.round(soilMoistureData.pixel_summary?.excellent_pixel_percentage || 0) },
        { label: "Excess", description: "water logging", percentage: Math.round(soilMoistureData.pixel_summary?.excess_pixel_percentage || 0) },
        { label: "Shallow", description: "water source", percentage: Math.round(soilMoistureData.pixel_summary?.shallow_water_pixel_percentage || 0) }
      ];
      const soilResult = findCategoryInLayer(soilMoistureData, 'Soil Moisture', soilLegend);
      if (soilResult) allLayerData.push(soilResult);
    }
    
    // Check PEST layer
    if (pestData) {
      const pestLegend = [
        { label: "Chewing", description: "Areas affected by chewing pests", percentage: Math.round(pestData.pixel_summary?.chewing_affected_pixel_percentage || 0) },
        { label: "Sucking", description: "Areas affected by sucking disease", percentage: Math.round(pestData.pixel_summary?.sucking_affected_pixel_percentage || 0) },
        { label: "fungi", description: "fungi infections affecting plants", percentage: Math.round(pestData.pixel_summary?.fungi_affected_pixel_percentage || 0) },
        { label: "Soil Borne", description: "Soil borne infections affecting plants", percentage: Math.round(pestData.pixel_summary?.SoilBorn_affected_pixel_percentage || 0) }
      ];
      const pestResult = findCategoryInLayer(pestData, 'PEST', pestLegend);
      if (pestResult) allLayerData.push(pestResult);
    }
    
    return allLayerData;
  };

  const handleLegendClick = (label: string, percentage: number) => {
    if (percentage === 0) return;

    if (percentage >= 99) {
      setSelectedLegendClass(null);
      return;
    }

    setSelectedLegendClass((prev) => (prev === label ? null : label));
  };

  const renderPlotBorder = () => {
    // Always prioritize plotBoundary (persists across layer changes)
    let featureToUse = plotBoundary || currentPlotFeature;
    
    // If still no feature, try to get from active layer data as fallback (read-only)
    if (!featureToUse) {
      if (activeLayer === "Growth" && growthData?.features?.[0]) {
        featureToUse = growthData.features[0];
      } else if (activeLayer === "Water Uptake" && waterUptakeData?.features?.[0]) {
        featureToUse = waterUptakeData.features[0];
      } else if (activeLayer === "Soil Moisture" && soilMoistureData?.features?.[0]) {
        featureToUse = soilMoistureData.features[0];
      } else if (activeLayer === "PEST" && pestData?.features?.[0]) {
        featureToUse = pestData.features[0];
      } else if (activeLayer === "Brix" && brixData?.features?.[0]) {
        featureToUse = brixData.features[0];
      }
    }
    
    const geom = featureToUse?.geometry;
    if (!geom || geom.type !== "Polygon" || !geom.coordinates?.[0]) {
      // If no geometry available, return null but don't clear anything
      return null;
    }

    const coords = geom.coordinates[0]
      .map((c: any) => [c[1], c[0]] as LatLngTuple)
      .filter((tuple: LatLngTuple) => !isNaN(tuple[0]) && !isNaN(tuple[1]));

    if (coords.length === 0) return null;

    return (
      <Polygon
        key={`plot-border-${selectedPlotName}-${plotBoundary ? 'persistent' : 'temp'}`}
        positions={coords}
        pathOptions={{
          fillOpacity: 0,
          color: "#FFD700",
          weight: 3,
          interactive: false,
        }}
      />
    );
  };

  const renderFilteredPixels = () => {
    if (!selectedLegendClass || getFilteredPixels.length === 0) return null;

    return getFilteredPixels.map((pixel: any, index: number) => {
      const coords = pixel?.geometry?.coordinates;

      if (!coords || !Array.isArray(coords) || coords.length < 2) {
        return null;
      }
      
      const circleRadius = 0.000025;

      return (
        <Circle
          key={`filtered-pixel-${pixel?.properties?.pixel_id || index}`}
          center={[coords[1], coords[0]]}
          radius={circleRadius}
          pathOptions={{
            fillColor: "#FFFFFF",
            fillOpacity: 1.8,
            color: "#FFFFFF",
            weight: 6,
            opacity: 1.8,
          }}
          eventHandlers={{
            mouseover: (e: any) => {
              const allLayerData = getMultiLayerDataForPosition(coords);
              if (allLayerData.length > 0) {
                setPixelTooltip({
                  layers: allLayerData,
                  x: e.originalEvent.clientX,
                  y: e.originalEvent.clientY
                });
              }
            },
            mouseout: () => {
              setPixelTooltip(null);
            },
            mousemove: (e: any) => {
              if (pixelTooltip) {
                setPixelTooltip(prev => prev ? {
                  ...prev,
                  x: e.originalEvent.clientX,
                  y: e.originalEvent.clientY - 10
                } : null);
              }
            }
          }}
        />
      );
    });
  };

  return (
    <div className="map-wrapper" style={{ minHeight: '100dvh', width: '100%', display: 'flex', justifyContent: 'center', overflowX: 'hidden' }}>
      <div className="map-content-container" style={{ width: '100%', maxWidth: '1920px', margin: '0 auto', padding: '0 1rem', boxSizing: 'border-box' }}>
      <div className="layer-controls">
        <div className="layer-buttons">
          {(["Growth", "Water Uptake", "Soil Moisture", "PEST", "Brix"] as const).map((layer) => (
            <button
              key={layer}
              onClick={() => setActiveLayer(layer)}
              className={activeLayer === layer ? "active" : ""}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>

        {profile && !profileLoading && (
          <div className="plot-selector">
            <label>Select Plot:</label>
            <select
              value={selectedPlotName}
              onChange={(e) => {
                const newPlot = e.target.value;
                setSelectedPlotName(newPlot);
                setContextSelectedPlotName(newPlot); // Update context as well
                localStorage.setItem('selectedPlot', newPlot);
                
                // Find the plot in profile to get coordinates immediately
                const selectedPlot = profile.plots?.find(p => p.fastapi_plot_id === newPlot);
                
                if (selectedPlot) {
                  console.log('🗺️ Map: Plot selected, loading coordinates from profile...');
                  const boundaryFromProfile = createPlotBoundaryFromProfile(selectedPlot);
                  
                  if (boundaryFromProfile) {
                    console.log('✅ Map: Setting plot boundary from profile (instant display)');
                    setPlotBoundary(boundaryFromProfile);
                  } else {
                    console.warn('⚠️ Map: No boundary coordinates in profile, will fetch from API');
                setPlotBoundary(null);
                  }
                } else {
                  setPlotBoundary(null);
                }
                
                setFieldAnalysisData(null);
                // Fetch layer data (these can be slower, plot boundary is already shown)
                fetchPestData(newPlot);
                fetchPlotData(newPlot); // Still fetch for layer data, but boundary is already shown
                fetchFieldAnalysis(newPlot);
              }}
              disabled={loading}
            >
              {profile.plots?.map(plot => {
                let displayName = '';
                
                if (plot.gat_number && plot.plot_number && 
                    plot.gat_number.trim() !== "" && plot.plot_number.trim() !== "" &&
                    !plot.gat_number.startsWith('GAT_') && !plot.plot_number.startsWith('PLOT_')) {
                  displayName = `${plot.gat_number}_${plot.plot_number}`;
                } else if (plot.gat_number && plot.gat_number.trim() !== "" && !plot.gat_number.startsWith('GAT_')) {
                  displayName = plot.gat_number;
                } else if (plot.plot_number && plot.plot_number.trim() !== "" && !plot.plot_number.startsWith('PLOT_')) {
                  displayName = plot.plot_number;
                } else {
                  const village = plot.address?.village;
                  const taluka = plot.address?.taluka;
                  
                  if (village) {
                    displayName = `Plot in ${village}`;
                    if (taluka) displayName += `, ${taluka}`;
                  } else {
                    displayName = 'Plot (No GAT/Plot Number)';
                  }
                }
                
                return (
                  <option key={plot.fastapi_plot_id} value={plot.fastapi_plot_id}>
                    {displayName}
                  </option>
                );
              }) || []}
            </select>
          </div>
        )}

        {profileLoading && <div className="loading-indicator">Loading farmer profile...</div>}
        {!profileLoading && !selectedPlotName && <div className="error-message">No plot data available for this farmer</div>}
        {loading && <div className="loading-indicator">Loading plot data...</div>}
        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Map and Soil Analysis Layout */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ marginTop: '1rem', width: '100%' }}>
        {/* Map Section - Increased width by 20px */}
        <div className="map-section-expanded" style={{ paddingLeft: '0', overflow: 'hidden', maxWidth: '100%', minWidth: 0 }}>
          {/* Enhanced Multi-Layer Tooltip */}
          {pixelTooltip && pixelTooltip.layers.length > 0 && (
            <div 
              className={activeLayer === "Brix" ? "brix-tooltip" : "enhanced-tooltip"}
              style={{
                left: `${pixelTooltip.x + 10}px`,
                top: `${pixelTooltip.y - 10}px`,
              }}
            >
              {activeLayer === "Brix" ? (
                // Simple Brix tooltip format
                <div>{pixelTooltip.layers[0]?.label || "Brix: N/A"}</div>
              ) : (
                // Multi-layer tooltip format for other layers
                pixelTooltip.layers.map((layerData, index) => (
                  <div key={index} className="enhanced-tooltip-line">
                    <span className="layer-name">{layerData.layer}:</span>
                    <span className="layer-description">
                      {layerData.label} - {layerData.description} - {layerData.percentage}%
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="map-container" ref={mapWrapperRef} style={{ position: 'relative' }}>
        {/* Loading Overlay - Shows when fetching layer data */}
        {loading && (
          <div className="map-loading-overlay">
            <div className="map-loading-spinner"></div>
          </div>
        )}

        {/* Back Button */}
        <button
          className="back-btn"
          title="Go Back"
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            }
            window.history.back();
          }}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Fullscreen Button */}
        <button
          className="fullscreen-btn"
          title="Enter Fullscreen"
          onClick={() => {
            if (!document.fullscreenElement) mapWrapperRef.current?.requestFullscreen();
            else document.exitFullscreen();
          }}
        >
          <FaExpand />
        </button>

        {(plotBoundary || currentPlotFeature) && (
          <div className="plot-info">
            <div className="plot-area">
              <span className="plot-area-value">{plotAreaLabel} acre</span>
            </div>
          </div>
        )}

        {/* Date Navigation Arrows - Show for Growth, Water Uptake, Soil Moisture, PEST, and Brix */}
        {(activeLayer === "Growth" || activeLayer === "Water Uptake" || activeLayer === "Soil Moisture" || activeLayer === "PEST" || activeLayer === "Brix") && (
          <>
            <button
              className="timeseries-nav-arrow-left"
              onClick={onLeftArrowClick}
              aria-label="Previous date (-15 days)"
              title="Previous (-15 days)"
            >
              <span className="timeseries-arrow-icon timeseries-arrow-left-icon"></span>
            </button>
            <button
              className="timeseries-nav-arrow-right"
              onClick={onRightArrowClick}
              aria-label="Next date (+15 days)"
              title="Next (+15 days)"
              disabled={isAtOrAfterCurrentDate(currentEndDate)}
              style={{
                opacity: isAtOrAfterCurrentDate(currentEndDate) ? 0.5 : 1,
                cursor: isAtOrAfterCurrentDate(currentEndDate) ? 'not-allowed' : 'pointer'
              }}
            >
              <span className="timeseries-arrow-icon timeseries-arrow-right-icon"></span>
            </button>
            
            {/* Date Popup */}
            {showDatePopup && (
              <div className={`timeseries-date-popup ${popupSide === 'left' ? 'timeseries-date-popup-left' : ''} ${popupSide === 'right' ? 'timeseries-date-popup-right' : ''}`}>
                <div className="timeseries-date-popup-content">
                  <div className="timeseries-date-popup-value">{currentEndDate}</div>
                  <div className="timeseries-date-popup-range">
                    {/* Start: {(() => {
                      const endDate = new Date(currentEndDate);
                      const startDate = new Date(endDate);
                      startDate.setDate(startDate.getDate() - DAYS_STEP);
                      return startDate.toISOString().split('T')[0];
                    })()} */}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <MapContainer
          center={mapCenter}
          zoom={18}
          style={{ height: "100%", width: "100%", maxWidth: "100%", overflow: "hidden" }}
          zoomControl={true}
          maxZoom={22}
          minZoom={10}
        >
          <TileLayer
            url="http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            attribution="© Google"
            maxZoom={22}
          />

          {(plotBoundary || currentPlotFeature)?.geometry?.coordinates?.[0] &&
            Array.isArray((plotBoundary || currentPlotFeature).geometry.coordinates[0]) && (
            <FitPlotToCenter
              key={selectedPlotName || "plot"}
              coordinates={(plotBoundary || currentPlotFeature).geometry.coordinates[0]}
            />
          )}

          {/* Render canopy vigour layer as background for Brix layer */}
          {activeLayer === "Brix" && canopyVigourData && (() => {
            const canopyUrl = extractTileUrl(canopyVigourData);
            return canopyUrl ? (
              <CustomTileLayer
                key={`canopy-vigour-background-${layerChangeKey}`}
                url={canopyUrl}
                opacity={0.7}
                tileKey={`canopy-vigour-background-${layerChangeKey}`}
              />
            ) : null;
          })()}

          {/* Render active layer tile (for other layers only - Brix uses canopy layer above) */}
          {activeUrl && activeLayer !== "Brix" && (
            <CustomTileLayer
              key={`${activeLayer}-layer-${layerChangeKey}`}
              url={activeUrl}
              opacity={0.7}
              tileKey={`${activeLayer}-layer-${layerChangeKey}`}
            />
          )}

          {selectedLegendClass && renderFilteredPixels()}
          {renderPlotBorder()}
          {/* Render Brix grid on top of canopy vigour layer */}
          {activeLayer === "Brix" && renderBrixGrid()}
        </MapContainer>

        {legendData.length > 0 && (
          <div className="map-legend-bottom">
            <div className="legend-items-bottom">
              {legendData.map((item: any, index: number) => (
                <div
                  key={index}
                  className={`legend-item-bottom ${
                    selectedLegendClass === item.label ? "active" : ""
                  } ${item.percentage === 0 ? "zero-percent" : ""} ${
                    item.percentage >= 99 ? "full-coverage" : ""
                  }`}
                  onClick={() => handleLegendClick(item.label, item.percentage)}
                  style={{
                    pointerEvents: item.percentage === 0 ? 'none' : 'auto',
                    cursor: item.percentage >= 99 ? 'not-allowed' : 'pointer'
                  }}
                  title={item.percentage >= 99 ? 'High coverage (99%+) - no individual pixels to show' : ''}
                >
                  <div
                    className="legend-circle-bottom cursor-pointer transition-all duration-150"
                    style={{
                      background: LEGEND_CIRCLE_COLOR,
                      boxShadow: `0 5px 8px ${LEGEND_CIRCLE_COLOR}40`
                    }}
                  >
                    <div className="legend-percentage-bottom font-bold text-xlg text-white-900">
                      {item.percentage}
                    </div>
                  </div>
                  <div className="legend-label-bottom text-white-500">{item.label}</div>
                </div>
              ))}
            </div>

          </div>
        )}
        </div>
        </div>

        {/* Soil Analysis Section */}
        <div className="soil-section-adjusted" style={{ minWidth: 0, width: '100%', flexShrink: 1 }}>
          <div className="bg-white rounded-lg shadow-lg p-0 h-full overflow-hidden">
            <div className="p-4">
              <SoilAnalysis
                plotName={activePlotName}
                phValue={phValue}
                phStatistics={phStatistics}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Field Health Analysis, Crop Health Analysis, and Irrigation Schedule Section - Below the map */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 w-full min-w-0 items-stretch" style={{ marginLeft: '0', paddingLeft: '0' }}>
        <div className="min-w-0 h-full flex flex-col">
          <FieldHealthAnalysis fieldAnalysisData={fieldAnalysisData} />
        </div>
        <div className="min-w-0 h-full flex flex-col">
          <CropHealthAnalysis />
        </div>
        <div className="min-w-0 h-full flex flex-col">
          <IrrigationSchedule />
        </div>
      </div>

      {/* Fertilizer + Soil Moisture — align with 3-card row above (fertilizer = cols 1–2, soil = col 3) */}
      <div className="mt-4 dashboard-cards-row grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
        <div className="irrigation-card dashboard-card-fertilizer flex flex-col min-w-0 lg:col-span-2">
          <FertilizerTable embedded />
        </div>
        <SoilMoistureCard optimalRange={[40, 60]} className="dashboard-card-soil lg:col-span-1" />
      </div>

      {/* Weather Forecast Section - Below Fertilizer and Soil Moisture */}
      <div className="mt-6 sm:mt-8 w-full" style={{ marginLeft: '0', paddingLeft: '0' }}>
        <WeatherForecast />
      </div>
              </div>
    </div>
  );
};

export default Map;
