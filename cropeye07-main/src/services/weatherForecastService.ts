// Weather Forecast Service for fetching 7-day weather forecast data
// API: https://weather-cropeye.up.railway.app/forecast

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

// Fetch 7-day weather forecast data for given coordinates
export const fetchWeatherForecast = async (lat: number, lon: number): Promise<WeatherForecastData> => {
  try {
    const apiUrl = ` https://weather-cropeye.up.railway.app/forecast?lat=${lat}&lon=${lon}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🌤️ Weather Forecast API error response:', errorText);
      throw new Error(`Weather Forecast API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const forecastData: WeatherForecastData = await response.json();

    return forecastData;
  } catch (error: any) {
    console.error('🌤️ Failed to fetch weather forecast:', error);

    if (error.name === 'AbortError') {
      throw new Error('Weather forecast request timed out. Please try again.');
    }

    if (error.message.includes('Failed to fetch')) {
      throw new Error('Unable to connect to weather forecast service. Please check your internet connection.');
    }

    throw new Error(`Failed to fetch weather forecast: ${error.message}`);
  }
};

// Format temperature for display
export const formatTemperature = (temp: string): string => {
  // Remove "DegreeCel" suffix and extract number
  const tempValue = temp.replace(' DegreeCel', '');
  return `${parseFloat(tempValue).toFixed(1)}°C`;
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
  const precipValue = parseFloat(precipitation.replace(' mm', ''));
  const tempValue = parseFloat(tempMax.replace(' DegreeCel', ''));

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
  const precipValue = parseFloat(precipitation.replace(' mm', ''));
  const tempValue = parseFloat(tempMax.replace(' DegreeCel', ''));

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
