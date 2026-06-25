import { getForecastWeatherBaseUrl, getWeatherBaseUrl } from "../utils/serviceUrls";

// Live Railway weather APIs (override via VITE_WEATHER_* in env if needed).
export const WEATHER_API_BASE = getWeatherBaseUrl();

/** Current forecast + rain alerts */
export const FORECAST_WEATHER_API_BASE = getForecastWeatherBaseUrl();

export type ForecastPeriodPrediction = {
  rain_alert?: string;
  rain_probability?: string;
};

export type ForecastCurrentWeather = {
  location?: string;
  region?: string;
  country?: string;
  localtime?: string;
  latitude?: number;
  longitude?: number;
  temperature_c?: number;
  humidity?: number;
  wind_kph?: number;
  precip_mm?: number;
  cloud?: number;
  pressure_mb?: number;
  dewpoint_c?: number;
  condition_text?: string | null;
  rain_score?: number;
  rain_alert?: string;
  rain_probability?: string;
  next_24h_prediction?: {
    morning?: ForecastPeriodPrediction;
    afternoon?: ForecastPeriodPrediction;
    night?: ForecastPeriodPrediction;
  };
  next_48h_prediction?: {
    morning?: ForecastPeriodPrediction;
    afternoon?: ForecastPeriodPrediction;
    night?: ForecastPeriodPrediction;
  };
};

export interface WeatherData {
  location: string;
  region: string;
  country: string;
  localtime: string;
  latitude: number;
  longitude: number;
  temperature_c: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
}

export interface WeatherError {
  error: string;
  message: string;
}

// Default fallback weather data to prevent UI crashes
export const DEFAULT_WEATHER_DATA: WeatherData = {
  location: "Unknown",
  region: "Unknown",
  country: "Unknown",
  localtime: new Date().toISOString(),
  latitude: 0,
  longitude: 0,
  temperature_c: 25,
  humidity: 60,
  wind_kph: 10,
  precip_mm: 0,
};

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
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If response is ok, return it
      if (response.ok) {
        return response;
      }
      
      // For 502/503/504, retry
      if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.log(`Weather API retrying (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
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
        console.log(`Weather API network error, retrying (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If no retries left, throw
      throw error;
    }
  }
  
  throw lastError;
};

/**
 * Current conditions + rain alerts and 24h/48h predictions from the forecast API.
 */
export const fetchForecastCurrentWeather = async (
  lat: number,
  lon: number
): Promise<ForecastCurrentWeather> => {
  if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
    throw new Error("Invalid coordinates for forecast weather");
  }
  const apiUrl = `${FORECAST_WEATHER_API_BASE.replace(/\/+$/, "")}/current-weather?lat=${lat}&lon=${lon}`;
  const response = await fetchWithRetry(apiUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`);
  }
  return (await response.json()) as ForecastCurrentWeather;
};

/**
 * Fetch current weather data for given coordinates
 * @param lat - Latitude
 * @param lon - Longitude
 * @param useFallback - If true, returns default data on error instead of throwing
 * @returns WeatherData or throws error if useFallback is false
 */
export const fetchCurrentWeather = async (
  lat: number,
  lon: number,
  useFallback: boolean = false
): Promise<WeatherData> => {
  // Validate coordinates
  if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
    const errorMsg = 'Invalid coordinates provided for weather request';
    console.error(`🌤️ Weather API Error: ${errorMsg}`, { lat, lon });
    if (useFallback) {
      console.warn('🌤️ Using fallback weather data due to invalid coordinates');
      return { ...DEFAULT_WEATHER_DATA, latitude: lat || 0, longitude: lon || 0 };
    }
    throw new Error(errorMsg);
  }

  const apiUrl = `${WEATHER_API_BASE.replace(/\/+$/, "")}/current-weather?lat=${lat}&lon=${lon}`;
  
  console.log(`🌤️ Weather API Request:`, {
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

    console.log(`🌤️ Weather API Response Status:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error(`🌤️ Weather API Error Response:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      
      const errorMsg = `Weather API error: ${response.status} ${response.statusText}`;
      
      if (useFallback) {
        console.warn('🌤️ Using fallback weather data due to API error');
        return { ...DEFAULT_WEATHER_DATA, latitude: lat, longitude: lon };
      }
      
      throw new Error(errorMsg);
    }

    const weatherData: WeatherData = await response.json();
    
    console.log(`🌤️ Weather API Success:`, {
      location: weatherData.location,
      temperature: weatherData.temperature_c,
      humidity: weatherData.humidity,
    });
    
    return weatherData;
  } catch (error: any) {
    console.error(`🌤️ Weather API Exception:`, {
      error: error.message,
      name: error.name,
      stack: error.stack,
      url: apiUrl,
    });
    
    if (useFallback) {
      console.warn('🌤️ Using fallback weather data due to exception');
      return { ...DEFAULT_WEATHER_DATA, latitude: lat, longitude: lon };
    }
    
    if (error.name === 'AbortError') {
      throw new Error('Weather request timed out. Please try again.');
    }
    
    if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
      throw new Error('Unable to connect to weather service. Please check your internet connection.');
    }
    
    if (error.message?.includes('CORS') || error.message?.includes('cors')) {
      throw new Error('Weather service CORS error. Please check your internet connection.');
    }
    
    throw new Error(`Failed to fetch weather data: ${error.message || 'Unknown error'}`);
  }
};

// Get weather icon based on temperature and conditions
export const getWeatherIcon = (temperature: number, humidity: number, precip: number): string => {
  if (precip > 0) {
    return '🌧️'; // Rain
  } else if (humidity > 80) {
    return '🌫️'; // Fog/Humid
  } else if (temperature > 30) {
    return '☀️'; // Hot/Sunny
  } else if (temperature > 20) {
    return '🌤️'; // Partly cloudy
  } else if (temperature > 10) {
    return '⛅'; // Cloudy
  } else {
    return '❄️'; // Cold
  }
};

// Format temperature for display
export const formatTemperature = (temp: number): string => {
  return `${temp.toFixed(1)}°C`;
};

// Format wind speed for display
export const formatWindSpeed = (windKph: number): string => {
  return `${windKph.toFixed(1)} km/h`;
};

// Format humidity for display
export const formatHumidity = (humidity: number): string => {
  return `${Math.round(humidity)}%`;
};

// Format precipitation for display
export const formatPrecipitation = (precip: number): string => {
  return `${precip.toFixed(1)} mm`;
};

// Get weather condition description
export const getWeatherCondition = (temperature: number, humidity: number, precip: number): string => {
  if (precip > 0) {
    return 'Rainy';
  } else if (humidity > 80) {
    return 'Humid';
  } else if (temperature > 30) {
    return 'Hot';
  } else if (temperature > 20) {
    return 'Pleasant';
  } else if (temperature > 10) {
    return 'Cool';
  } else {
    return 'Cold';
  }
};
