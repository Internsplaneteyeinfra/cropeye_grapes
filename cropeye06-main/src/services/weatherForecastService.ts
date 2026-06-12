// 7-day weather forecast — GET /forecast?lat=&lon=
// Production: https://weather-cropeye.up.railway.app/forecast
// Dev/prod SPA: /api/weather/forecast (Vite/nginx proxy → weather-cropeye)
import { WEATHER_API_BASE, fetchCurrentWeather } from './weatherService';

export interface WeatherForecastData {
  source: string;
  data: WeatherForecastDay[];
}

export interface WeatherForecastDay {
  date: string;
  temperature_max: string;
  temperature_min: string;
  precipitation: string;
  wind_speed_max: string;
  humidity_max: string;
}

// Helper function for retry logic with exponential backoff
const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 2,
  retryDelay: number = 1000
): Promise<Response> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.log(`🌤️ Weather Forecast API retrying (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      lastError = error;
      
      if (
        (error.name === 'TypeError' || 
         error.message?.includes('Failed to fetch') ||
         error.name === 'AbortError') &&
        attempt < maxRetries
      ) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.log(`🌤️ Weather Forecast API network error, retrying (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

/**
 * Fetch 7-day weather forecast data for given coordinates
 * @param lat - Latitude
 * @param lon - Longitude
 * @param useFallback - If true, returns empty data on error instead of throwing
 * @returns WeatherForecastData or throws error if useFallback is false
 */
export const fetchWeatherForecast = async (
  lat: number,
  lon: number,
  useFallback: boolean = false
): Promise<WeatherForecastData> => {
  // Validate coordinates
  if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
    const errorMsg = 'Invalid coordinates provided for weather forecast request';
    console.error(`🌤️ Weather Forecast API Error: ${errorMsg}`, { lat, lon });
    if (useFallback) {
      console.warn('🌤️ Using fallback forecast data due to invalid coordinates');
      return { source: 'fallback', data: [] };
    }
    throw new Error(errorMsg);
  }

  const apiUrl = `${WEATHER_API_BASE}/forecast?lat=${lat}&lon=${lon}`;
    
  console.log(`🌤️ Weather Forecast API Request:`, {
    url: apiUrl,
    lat,
    lon,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    console.log(`🌤️ Weather Forecast API Response Status:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error(`🌤️ Weather Forecast API Error Response:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      
      const errorMsg = `Weather Forecast API error: ${response.status} ${response.statusText}`;
      
      if (useFallback) {
        console.warn('🌤️ Using fallback forecast data due to API error');
        return { source: 'fallback', data: [] };
      }
      
      throw new Error(errorMsg);
    }

    const forecastData: WeatherForecastData = await response.json();
    
    console.log(`🌤️ Weather Forecast API Success:`, {
      source: forecastData.source,
      daysCount: forecastData.data?.length || 0,
    });
    
    return forecastData;
  } catch (error: any) {
    console.error(`🌤️ Weather Forecast API Exception:`, {
      error: error.message,
      name: error.name,
      stack: error.stack,
      url: apiUrl,
    });
    
    if (useFallback) {
      console.warn('🌤️ Using fallback forecast data due to exception');
      return { source: 'fallback', data: [] };
    }
    
    if (error.name === 'AbortError') {
      throw new Error('Weather forecast request timed out. Please try again.');
    }
    
    if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
      throw new Error('Unable to connect to weather forecast service. Please check your internet connection.');
    }
    
    if (error.message?.includes('CORS') || error.message?.includes('cors')) {
      throw new Error('Weather forecast service CORS error. Please check your internet connection.');
    }
    
    throw new Error(`Failed to fetch weather forecast: ${error.message || 'Unknown error'}`);
  }
};

// Format temperature for display (e.g. "34.8 °C" or legacy "34.8 DegreeCel")
export const formatTemperature = (temp: string): string => {
  return `${extractNumericValue(temp).toFixed(1)}°C`;
};

// Format wind speed for display
export const formatWindSpeed = (wind: string): string => {
  // Remove "km/h" suffix and extract number
  const windValue = wind.replace(' km/h', '');
  return `${Math.round(parseFloat(windValue))} km/h`;
};

// Format humidity for display
export const formatHumidity = (humidity: string): string => {
  // Remove "%" suffix and extract number
  const humidityValue = humidity.replace(' %', '');
  return `${Math.round(parseFloat(humidityValue))}%`;
};

// Format precipitation for display
export const formatPrecipitation = (precip: string): string => {
  // Remove "mm" suffix and extract number
  const precipValue = precip.replace(' mm', '');
  return `${parseFloat(precipValue).toFixed(1)} mm`;
};

// Get weather icon based on precipitation and temperature
export const getWeatherIcon = (precipitation: string, tempMax: string): string => {
  const precipValue = extractNumericValue(precipitation);
  const tempValue = extractNumericValue(tempMax);
  
  if (precipValue > 5) {
    return '🌧️'; // Heavy rain
  } else if (precipValue > 1) {
    return '🌦️'; // Light rain
  } else if (tempValue > 30) {
    return '☀️'; // Hot/Sunny
  } else if (tempValue > 25) {
    return '🌤️'; // Partly cloudy
  } else {
    return '⛅'; // Cloudy
  }
};

// Get weather condition description
export const getWeatherCondition = (precipitation: string, tempMax: string): string => {
  const precipValue = extractNumericValue(precipitation);
  const tempValue = extractNumericValue(tempMax);
  
  if (precipValue > 5) {
    return 'Heavy Rain';
  } else if (precipValue > 1) {
    return 'Light Rain';
  } else if (tempValue > 30) {
    return 'Hot';
  } else if (tempValue > 25) {
    return 'Pleasant';
  } else {
    return 'Cool';
  }
};

// Extract numeric value from API response (removes units)
export const extractNumericValue = (value: string): number => {
  if (!value) return 0;
  
  let cleanValue = value;
  // Remove common units and suffixes
  cleanValue = cleanValue.replace(/ DegreeCel/gi, '');
  cleanValue = cleanValue.replace(/ mm/gi, '');
  cleanValue = cleanValue.replace(/ km\/h/gi, '');
  cleanValue = cleanValue.replace(/ %/gi, '');
  cleanValue = cleanValue.replace(/[^\d.+-]/g, "");
  
  return parseFloat(cleanValue) || 0;
};

// Format date for display
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
};

// Get day of week
export const getDayOfWeek = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { weekday: 'long' });
};

// Test function to verify parsing works correctly
export const testParsing = () => {
  // Test function - logging removed
};

export const DEFAULT_FORECAST_LAT = 20.014040817830804;
export const DEFAULT_FORECAST_LON = 73.66620106848734;

/** Local calendar date (yyyy-mm-dd) — avoids UTC shift in IST. */
export const localIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseForecastNum = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return extractNumericValue(v);
  return 0;
};

export interface ForecastChartDay {
  date: string;
  temperature: number;
  humidity: number;
  rainfall: number;
  wind: number;
  fullDate: string;
}

/** Resolve plot lat/lon the same way as WeatherForecast (latitude/longitude first). */
export function getPlotLatLon(plot: any): { lat: number; lon: number } | null {
  const loc = plot?.coordinates?.location;
  if (!loc) return null;

  if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
    return { lat: Number(loc.latitude), lon: Number(loc.longitude) };
  }

  const coords = loc.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [a, b] = coords;
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) return { lat: a, lon: b };
    return { lon: a, lat: b };
  }

  return null;
}

export function resolveForecastLatLon(
  plot: any,
  propLat?: number,
  propLon?: number
): { lat: number; lon: number } {
  if (propLat && propLon && !isNaN(propLat) && !isNaN(propLon)) {
    return { lat: propLat, lon: propLon };
  }
  const fromPlot = plot ? getPlotLatLon(plot) : null;
  if (fromPlot) return fromPlot;
  return { lat: DEFAULT_FORECAST_LAT, lon: DEFAULT_FORECAST_LON };
}

export function weatherChartCacheKey(lat: number, lon: number): string {
  return `weatherChartData_${lat}_${lon}`;
}

export function weatherTodayRainCacheKey(lat: number, lon: number): string {
  return `weatherTodayRain_${lat}_${lon}`;
}

export function forecastChartHasValues(days: ForecastChartDay[]): boolean {
  return days.some(
    (d) => d.temperature > 0 || d.rainfall > 0 || d.humidity > 0 || d.wind > 0
  );
}

export function mapForecastRainfallByDate(rawList: any[]): Map<string, number> {
  const byDate = new Map<string, number>();
  rawList.forEach((d) => {
    const dateStr = d.date || d.Date;
    const iso = dateStr ? String(dateStr).split("T")[0] : "";
    if (iso) byDate.set(iso, extractNumericValue(d.precipitation ?? 0));
  });
  return byDate;
}

const toChartDay = (iso: string, apiData: any): ForecastChartDay => {
  const futureDate = new Date(`${iso}T12:00:00`);
  return {
    date: futureDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    temperature: parseForecastNum(apiData.temperature_max),
    humidity: parseForecastNum(apiData.humidity_max),
    rainfall: parseForecastNum(apiData.precipitation),
    wind: parseForecastNum(apiData.wind_speed_max),
    fullDate: iso,
  };
};

/** Tomorrow through +7 days — maps API rows by date, then pads if needed. */
export function buildForecastChartDays(rawList: any[]): ForecastChartDay[] {
  const todayIso = localIsoDate(new Date());

  const futureFromApi = rawList
    .map((d) => {
      const dateStr = d.date || d.Date;
      const iso = dateStr ? String(dateStr).split("T")[0] : "";
      return iso && iso > todayIso ? { iso, d } : null;
    })
    .filter((x): x is { iso: string; d: any } => !!x)
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .slice(0, 7)
    .map(({ iso, d }) => toChartDay(iso, d));

  if (futureFromApi.length >= 7) {
    return futureFromApi;
  }

  const apiDataByDate = new Map<string, any>();
  rawList.forEach((d) => {
    const dateStr = d.date || d.Date;
    const iso = dateStr ? String(dateStr).split("T")[0] : "";
    if (iso) apiDataByDate.set(iso, d);
  });

  const days: ForecastChartDay[] = [...futureFromApi];
  const today = new Date();

  for (let i = 1; days.length < 7; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i);
    const iso = localIsoDate(futureDate);
    if (days.some((d) => d.fullDate === iso)) continue;
    days.push(toChartDay(iso, apiDataByDate.get(iso) || {}));
  }

  return days.slice(0, 7);
}

export function getTodayRainfallFromForecastRaw(rawList: any[]): number | null {
  const byDate = mapForecastRainfallByDate(rawList);
  const todayIso = localIsoDate(new Date());
  return byDate.has(todayIso) ? byDate.get(todayIso)! : null;
}

/** Irrigation days 1–6 rainfall = chart days 0–5 (tomorrow → +6). */
export function irrigationRainfallFromChartDays(
  chartDays: ForecastChartDay[]
): number[] {
  return chartDays.slice(0, 6).map((d) => d.rainfall);
}

export interface SharedWeatherChartResult {
  chartDays: ForecastChartDay[];
  todayRainfall: number;
}

/**
 * One fetch + cache for both 7-Day Forecast and 7-Day Irrigation Schedule.
 */
export async function getOrFetchWeatherChartDays(
  lat: number,
  lon: number,
  getCached: (key: string) => unknown,
  setCached: (key: string, data: unknown) => void
): Promise<SharedWeatherChartResult> {
  const chartKey = weatherChartCacheKey(lat, lon);
  const todayKey = weatherTodayRainCacheKey(lat, lon);

  const cachedChart = getCached(chartKey);
  const cachedToday = getCached(todayKey);

  if (
    Array.isArray(cachedChart) &&
    cachedChart.length > 0 &&
    forecastChartHasValues(cachedChart as ForecastChartDay[]) &&
    typeof cachedToday === "number"
  ) {
    return { chartDays: cachedChart as ForecastChartDay[], todayRainfall: cachedToday };
  }

  const forecast = await fetchWeatherForecast(lat, lon, false);
  const rawList = Array.isArray(forecast) ? forecast : forecast.data || [];
  const chartDays = buildForecastChartDays(rawList);

  let todayRainfall = getTodayRainfallFromForecastRaw(rawList);
  if (todayRainfall === null) {
    try {
      const current = await fetchCurrentWeather(lat, lon, true);
      todayRainfall = Number(current.precip_mm) || 0;
    } catch {
      todayRainfall = 0;
    }
  }

  setCached(chartKey, chartDays);
  setCached(todayKey, todayRainfall);

  return { chartDays, todayRainfall };
}
