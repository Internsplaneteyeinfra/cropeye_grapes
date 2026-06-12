/**
 * Data Preloader Service
 * Pre-loads ALL agricultural data endpoints after farmer login
 * to improve user experience and prevent repeated API calls
 */

import { getCache, setCache } from '../components/utils/cache';
import { getFarmerMyProfile } from '../api';
import { fetchCurrentWeather } from './weatherService';
import { buildForecastChartDays, fetchWeatherForecast } from './weatherForecastService';
import { getGrapesMainBaseUrl } from '../utils/serviceUrls';
import { normalizeNpkFromApi } from '../utils/npkNormalize';

// Import context - will be passed as parameter to avoid circular dependencies
interface AppContextType {
  setApiData: (endpoint: string, plotName: string, data: any) => void;
  setPreloading: (loading: boolean) => void;
  setPreloadComplete: (complete: boolean) => void;
}

interface PlotData {
  fastapi_plot_id?: string;
  gat_number?: string;
  plot_number?: string;
  coordinates?: {
    location?: {
      latitude?: number;
      longitude?: number;
    };
  };
  farms?: Array<{
    plantation_date?: string;
    crop_type?: {
      crop_type?: string;
    };
  }>;
}

const PROFILE_CACHE_KEY = 'farmer_my_profile_v1';

/**
 * Get current date in YYYY-MM-DD format
 */
const getCurrentEndDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Cache data using the same cache utility as Map.tsx
 */
const cacheData = (key: string, data: any): void => {
  try {
    setCache(key, data);
  } catch (error) {
    console.warn(`Failed to cache data for ${key}:`, error);
  }
};

/**
 * Get plot name from plot object
 */
const getPlotName = (plot: PlotData): string => {
  return plot.fastapi_plot_id || `${plot.gat_number}_${plot.plot_number}` || '';
};

const getPlotCoordinates = (plot: PlotData): { lat: number; lon: number } | null => {
  const lat = plot.coordinates?.location?.latitude;
  const lon = plot.coordinates?.location?.longitude;

  if (typeof lat === 'number' && typeof lon === 'number') {
    return { lat, lon };
  }

  return null;
};

const getFarmerProfileData = async (): Promise<any | null> => {
  const cached = getCache(PROFILE_CACHE_KEY, 10 * 60 * 1000);
  if (cached) {
    return cached;
  }

  try {
    const response = await getFarmerMyProfile();
    const profileData = response?.data || null;
    if (profileData) {
      cacheData(PROFILE_CACHE_KEY, profileData);
    }
    return profileData;
  } catch (error) {
    console.warn('Failed to preload farmer profile:', error);
    return null;
  }
};

/**
 * Fetch Growth data for a plot
 */
const fetchGrowthData = async (
  plotName: string,
  endDate: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `growth_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return; // Already cached

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/analyze_Growth?plot_name=${encodeURIComponent(plotName)}&end_date=${endDate}&days_back=7`;
    
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
      // Store in global context
      if (context) {
        context.setApiData('growth', plotName, data);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Growth data for ${plotName}:`, error);
  }
};

/**
 * Fetch Water Uptake data for a plot
 */
const fetchWaterUptakeData = async (
  plotName: string,
  endDate: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `wateruptake_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return; // Already cached

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/wateruptake?plot_name=${encodeURIComponent(plotName)}&end_date=${endDate}&days_back=7`;
    
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
      if (context) {
        context.setApiData('waterUptake', plotName, data);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Water Uptake data for ${plotName}:`, error);
  }
};

/**
 * Fetch Soil Moisture data for a plot
 */
const fetchSoilMoistureData = async (
  plotName: string,
  endDate: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `soilmoisture_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return; // Already cached

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/SoilMoisture?plot_name=${encodeURIComponent(plotName)}&end_date=${endDate}&days_back=7`;
    
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
      if (context) {
        context.setApiData('soilMoisture', plotName, data);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Soil Moisture data for ${plotName}:`, error);
  }
};

/**
 * Fetch Pest data for a plot (for Map.tsx and Pest & Disease page)
 */
const fetchPestData = async (
  plotName: string,
  endDate: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `pest_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return; // Already cached

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/pest-detection?plot_name=${encodeURIComponent(plotName)}`;
    
    // Create AbortController with 5 minute timeout to prevent session timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        cache: 'default',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        // Cache for Map.tsx
        cacheData(cacheKey, data);
        if (context) {
          context.setApiData('pest', plotName, data);
        }
        
        // Also cache pest detection data for Pest & Disease page
        const pestDetectionCacheKey = `pestDetectionData_${plotName}`;
        const pixelSummary = data.pixel_summary || {};
        const pestDetectionData = {
          fungi_affected_pixel_percentage: pixelSummary.fungi_affected_pixel_percentage || 0,
          chewing_affected_pixel_percentage: pixelSummary.chewing_affected_pixel_percentage || 0,
          sucking_affected_pixel_percentage: pixelSummary.sucking_affected_pixel_percentage || 0,
          SoilBorn_affected_pixel_percentage: pixelSummary.SoilBorn_affected_pixel_percentage || 0,
        };
        cacheData(pestDetectionCacheKey, pestDetectionData);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors gracefully
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.warn(`⚠️ Pest data preload timed out after 5 minutes for ${plotName}`);
      } else {
        console.warn(`Failed to preload Pest data for ${plotName}:`, error);
      }
    }
  } catch (error: any) {
    console.warn(`Failed to preload Pest data for ${plotName}:`, error);
  }
};

/**
 * Fetch Brix data for a plot
 */
const fetchBrixData = async (
  plotName: string,
  endDate: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `brix_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return; // Already cached

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/grapes/brix-grid-values?plot_name=${encodeURIComponent(plotName)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
      if (context) {
        context.setApiData('brix', plotName, data);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Brix data for ${plotName}:`, error);
  }
};

const fetchBrixTimeSeriesData = async (
  plotName: string,
  context?: AppContextType
): Promise<void> => {
  try {
    const cacheKey = `brixTimeSeries_${plotName}`;
    if (getCache(cacheKey)) return;

    const baseUrl = 'https://cropeye-grapes-events-production.up.railway.app';
    const url = `${baseUrl}/grapes/brix-time-series?plot_name=${encodeURIComponent(plotName)}`;
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
      if (context) {
        context.setApiData('brixTimeSeries', plotName, data);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload brix time series for ${plotName}:`, error);
  }
};

/**
 * Fetch FarmerDashboard data (indices, stress, irrigation, agroStats)
 */
const fetchFarmerDashboardData = async (
  plotName: string,
  context?: AppContextType
): Promise<void> => {
  const { getEventsBaseUrl } = await import("../utils/serviceUrls");
  const BASE_URL = getEventsBaseUrl();
  
  try {
    // Fetch indices
    const indicesCacheKey = `indices_${plotName}`;
    if (!getCache(indicesCacheKey)) {
      try {
        const response = await fetch(`${BASE_URL}/plots/${plotName}/indices`, {
          method: 'GET',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: { 'Accept': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          const processed = data.map((item: any) => ({
            date: new Date(item.date).toISOString().split("T")[0],
            growth: item.NDVI,
            stress: item.NDMI,
            water: item.NDWI,
            moisture: item.NDRE,
          }));
          cacheData(indicesCacheKey, processed);
          if (context) {
            context.setApiData('indices', plotName, processed);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload indices for ${plotName}:`, err);
      }
    }

    // Fetch stress data
    const stressCacheKey = `stress_${plotName}_NDMI_0.15`;
    if (!getCache(stressCacheKey)) {
      try {
        const response = await fetch(`${BASE_URL}/plots/${plotName}/stress?index_type=NDRE&threshold=0.15`, {
          method: 'GET',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: { 'Accept': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          cacheData(stressCacheKey, data);
          if (context) {
            context.setApiData('stress', plotName, data);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload stress data for ${plotName}:`, err);
      }
    }

    // Fetch irrigation data
    const irrigationCacheKey = `irrigation_${plotName}`;
    if (!getCache(irrigationCacheKey)) {
      try {
        const response = await fetch(`${BASE_URL}/plots/${plotName}/irrigation`, {
          method: 'GET',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: { 'Accept': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          cacheData(irrigationCacheKey, data);
          if (context) {
            context.setApiData('irrigation', plotName, data);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload irrigation data for ${plotName}:`, err);
      }
    }

    // Grapes Events API: GET /plots/agroStats is not available — preload POST bundle (yield + ripening + brix).
    const endDate = getCurrentEndDate();
    const grapesBundleCacheKey = `farmerDashGrapes_v1_${plotName}_${endDate}`;
    if (!getCache(grapesBundleCacheKey)) {
      try {
        const { fetchGrapesEventsBundle } = await import('../utils/grapesEventsBundle');
        const bundle = await fetchGrapesEventsBundle(BASE_URL, plotName);
        cacheData(grapesBundleCacheKey, bundle);
        if (context) {
          context.setApiData('agroStats', plotName, bundle);
        }
        console.log(`✅ Preloaded grapes bundle for ${plotName}`);
      } catch (err) {
        console.warn(`Failed to preload grapes bundle for ${plotName}:`, err);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload FarmerDashboard data for ${plotName}:`, error);
  }
};

/**
 * Fetch Fertilizer/Soil Analysis data (required-n, analyze-npk)
 */
const fetchFertilizerData = async (
  plotName: string,
  plantationDate: string,
  crop: string,
  context?: AppContextType
): Promise<void> => {
  const BASE_URL = getGrapesMainBaseUrl();
  const currentDate = getCurrentEndDate();
  
  try {
    // Fetch required-n
    const npkCacheKey = `npkData_${plotName}`;
    if (!getCache(npkCacheKey)) {
      try {
        const response = await fetch(`${BASE_URL}/required-n/${encodeURIComponent(plotName)}?end_date=${currentDate}`, {
          method: 'POST',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plot_id: plotName,
            end_date: currentDate,
            crop_type: crop.toLowerCase()
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const normalized = normalizeNpkFromApi(data);
          cacheData(npkCacheKey, normalized);
          if (context) {
            context.setApiData('npk', plotName, normalized);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload required-n for ${plotName}:`, err);
      }
    }

    // Fetch analyze-npk
    const soilAnalysisCacheKey = `soilData_${plotName}`;
    if (!getCache(soilAnalysisCacheKey)) {
      try {
        const response = await fetch(`${BASE_URL}/analyze-npk/${encodeURIComponent(plotName)}?plantation_date=${plantationDate}&date=${currentDate}&fe_days_back=30`, {
          method: 'POST',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          cacheData(soilAnalysisCacheKey, data);
          if (context) {
            context.setApiData('soilAnalysis', plotName, data);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload analyze-npk for ${plotName}:`, err);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Fertilizer data for ${plotName}:`, error);
  }
};

/**
 * Fetch Irrigation data (ET, soil moisture)
 */
const fetchIrrigationData = async (
  plotName: string,
  context?: AppContextType
): Promise<void> => {
  try {
    // Fetch ET data
    const etCacheKey = `etData_${plotName}`;
    if (!getCache(etCacheKey)) {
      try {
        const response = await fetch(`https://cropeye-grapes-sef-production.up.railway.app/plots/${encodeURIComponent(plotName)}/compute-et/`, {
          method: 'POST',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          const data = await response.json();
          const etData = { etValue: data.ET_mean_mm_per_day || 2.5, trendData: [], hourlyData: data.hourly_records_et || [] };
          cacheData(etCacheKey, etData);
          if (context) {
            context.setApiData('et', plotName, etData);
          }
        }
      } catch (err) {
        console.warn(`Failed to preload ET data for ${plotName}:`, err);
      }
    }

    // Fetch soil moisture stack
    const soilMoistureCacheKey = `soilMoistureTrend_${plotName}`;
    if (!getCache(soilMoistureCacheKey)) {
      try {
        const response = await fetch(`https://cropeye-grapes-sef-production.up.railway.app/soil-moisture/${encodeURIComponent(plotName)}`, {
          method: 'POST',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          cacheData(`soilMoistureStack_${plotName}`, data);
          if (data.soil_moisture_stack && Array.isArray(data.soil_moisture_stack)) {
            const weekData = data.soil_moisture_stack.map((item: any) => ({
              date: item.day,
              value: parseFloat(item.soil_moisture.toFixed(2)),
            }));
            cacheData(soilMoistureCacheKey, weekData);
            if (context) {
              context.setApiData('soilMoistureTrend', plotName, weekData);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to preload soil moisture data for ${plotName}:`, err);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload Irrigation data for ${plotName}:`, error);
  }
};

const fetchWaterUptakeEfficiencyData = async (plotName: string): Promise<void> => {
  try {
    const endDate = getCurrentEndDate();
    const cacheKey = `waterUptakeEfficiency_${plotName}_${endDate}`;
    if (getCache(cacheKey)) return;

    const url = `https://cropeye-grapes-sef-production.up.railway.app/wateruptake?plot_name=${encodeURIComponent(plotName)}&end_date=${endDate}&days_back=7`;
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const pixelSummary = data?.pixel_summary || {};
      const adequate = pixelSummary?.adequat_pixel_percentage ?? 0;
      const excellent = pixelSummary?.excellent_pixel_percentage ?? 0;
      cacheData(cacheKey, {
        efficiency: Math.round(adequate + excellent),
      });
    }
  } catch (error) {
    console.warn(`Failed to preload water uptake efficiency for ${plotName}:`, error);
  }
};

const fetchGrapesScheduleData = async (plotName: string): Promise<void> => {
  try {
    const cacheKey = `grapesSchedule_${plotName}`;
    if (getCache(cacheKey)) return;

    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const response = await fetch(`${baseUrl}/grapes-schedule/${encodeURIComponent(plotName)}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      cacheData(cacheKey, data);
    }
  } catch (error) {
    console.warn(`Failed to preload grapes schedule for ${plotName}:`, error);
  }
};

const fetchRiskAssessmentData = async (plotName: string): Promise<void> => {
  try {
    const assessmentKey = `riskAssessment_${plotName}`;
    const pestDetectionKey = `pestDetectionData_${plotName}`;

    if (getCache(assessmentKey) && getCache(pestDetectionKey)) return;

    const url = `https://cropeye-grapes-admin-production.up.railway.app/risk-assessment?plot_name=${encodeURIComponent(plotName)}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'default',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return;

    const body = await response.json();
    if (!body?.risk) return;

    cacheData(assessmentKey, {
      stage: 'API',
      current_conditions: {
        month: '—',
        temperature: '—',
        humidity: '—',
      },
      pests: {
        High: [...(body.risk?.pests?.High || [])],
        Moderate: [...(body.risk?.pests?.Moderate || [])],
        Low: [...(body.risk?.pests?.Low || [])],
      },
      diseases: {
        High: [...(body.risk?.diseases?.High || [])],
        Moderate: [...(body.risk?.diseases?.Moderate || [])],
        Low: [...(body.risk?.diseases?.Low || [])],
      },
      weeds: {
        High: [...(body.risk?.weeds?.High || [])],
        Moderate: [...(body.risk?.weeds?.Moderate || [])],
        Low: [...(body.risk?.weeds?.Low || [])],
      },
    });

    cacheData(pestDetectionKey, {
      fungi_affected_pixel_percentage: Number(body.pixel_data?.fungi) || 0,
      chewing_affected_pixel_percentage: Number(body.pixel_data?.chewing) || 0,
      sucking_affected_pixel_percentage: Number(body.pixel_data?.sucking) || 0,
      SoilBorn_affected_pixel_percentage: Number(body.pixel_data?.soilborne) || 0,
    });
  } catch (error) {
    console.warn(`Failed to preload risk assessment for ${plotName}:`, error);
  }
};

const fetchWeatherDataForPlot = async (plot: PlotData): Promise<void> => {
  const coordinates = getPlotCoordinates(plot);
  if (!coordinates) return;

  const { lat, lon } = coordinates;
  const currentWeatherCacheKey = `weather_${lat}_${lon}`;
  if (!getCache(currentWeatherCacheKey)) {
    try {
      const weatherData = await fetchCurrentWeather(lat, lon, true);
      cacheData(currentWeatherCacheKey, {
        data: weatherData,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn(`Failed to preload current weather for ${getPlotName(plot)}:`, error);
    }
  }

  const forecastCacheKey = `weatherChartData_${lat}_${lon}`;
  if (!getCache(forecastCacheKey)) {
    try {
      const forecastData = await fetchWeatherForecast(lat, lon, true);
      const rawList = Array.isArray(forecastData)
        ? forecastData
        : Array.isArray(forecastData?.data)
          ? forecastData.data
          : [];
      cacheData(forecastCacheKey, buildForecastChartDays(rawList));
    } catch (error) {
      console.warn(`Failed to preload weather forecast for ${getPlotName(plot)}:`, error);
    }
  }
};

/**
 * Pre-load all data for a single plot
 */
const preloadPlotData = async (
  plot: PlotData,
  plantationDate?: string,
  crop: string = 'sugarcane',
  context?: AppContextType
): Promise<void> => {
  const plotName = getPlotName(plot);
  if (!plotName) {
    console.warn('Cannot preload data: plot name is missing');
    return;
  }

  const endDate = getCurrentEndDate();
  console.log(`🔄 Preloading ALL endpoints for plot: ${plotName} (endDate: ${endDate})`);

  // Fetch ALL data types in parallel
  const results = await Promise.allSettled([
    // Map data
    fetchGrowthData(plotName, endDate, context),
    fetchWaterUptakeData(plotName, endDate, context),
    fetchSoilMoistureData(plotName, endDate, context),
    fetchPestData(plotName, endDate, context),
    fetchBrixData(plotName, endDate, context),
    fetchBrixTimeSeriesData(plotName, context),
    // FarmerDashboard data
    fetchFarmerDashboardData(plotName, context),
    // Fertilizer/Soil Analysis data
    fetchFertilizerData(plotName, plantationDate || '2025-01-01', crop, context),
    // Irrigation data
    fetchIrrigationData(plotName, context),
    fetchWaterUptakeEfficiencyData(plotName),
    fetchGrapesScheduleData(plotName),
    fetchRiskAssessmentData(plotName),
    fetchWeatherDataForPlot(plot),
  ]);

  // Log results
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failCount = results.filter(r => r.status === 'rejected').length;
  console.log(`✅ Completed preloading for plot: ${plotName} - ${successCount} succeeded, ${failCount} failed`);
};

/**
 * Pre-load all data for all plots of a farmer
 */
export const preloadAllFarmerData = async (
  plots: PlotData[],
  context?: AppContextType
): Promise<void> => {
  if (!plots || plots.length === 0) {
    console.warn('No plots available for preloading');
    return;
  }

  // Set preloading state
  if (context) {
    context.setPreloading(true);
    context.setPreloadComplete(false);
  }

  console.log(`🚀 Starting COMPLETE preload for ${plots.length} plot(s) - ALL endpoints...`);

  await getFarmerProfileData();

  // Get plantation dates and crops for each plot
  const plotPromises = plots.map(async (plot) => {
    let plantationDate = '2025-01-01'; // Default fallback
    let crop = 'sugarcane'; // Default fallback
    if (plot.farms && Array.isArray(plot.farms) && plot.farms.length > 0) {
      const firstFarm = plot.farms[0];
      if (firstFarm.plantation_date) {
        plantationDate = firstFarm.plantation_date.split("T")[0];
      }
      if (firstFarm.crop_type?.crop_type) {
        crop = firstFarm.crop_type.crop_type;
      }
    }
    return preloadPlotData(plot, plantationDate, crop, context);
  });

  await Promise.allSettled(plotPromises);

  // Mark preloading as complete
  if (context) {
    context.setPreloading(false);
    context.setPreloadComplete(true);
  }

  console.log(`✅ Completed COMPLETE preloading for all plots - ALL endpoints cached!`);
};

/**
 * Hook to preload data after farmer login
 */
export const useDataPreloader = () => {
  const preloadData = async (plots: PlotData[]) => {
    await preloadAllFarmerData(plots);
  };

  return { preloadData };
};
