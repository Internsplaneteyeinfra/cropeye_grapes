// Weather Service for fetching current weather data
// API: https://weather-cropeye.up.railway.app/current-weather

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

// Fetch current weather data for given coordinates
export const fetchCurrentWeather = async (lat: number, lon: number): Promise<WeatherData> => {
  try {
    const apiUrl = ` https://weather-cropeye.up.railway.app/current-weather?lat=${lat}&lon=${lon}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Weather API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const weatherData: WeatherData = await response.json();

    return weatherData;
  } catch (error: any) {

    if (error.name === 'AbortError') {
      throw new Error('Weather request timed out. Please try again.');
    }

    if (error.message.includes('Failed to fetch')) {
      throw new Error('Unable to connect to weather service. Please check your internet connection.');
    }

    throw new Error(`Failed to fetch weather data: ${error.message}`);
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
