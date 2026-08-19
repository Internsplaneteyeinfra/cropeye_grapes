import React, { useEffect, useState } from "react";
import {
  Menu,
  X,
  Cloud,
  Thermometer,
  Wind,
  Droplet,
  MapPin,
  Navigation,
} from "lucide-react";
import "./Header.css";
import {
  fetchCurrentWeather,
  formatTemperature,
  formatWindSpeed,
  formatHumidity,
  formatPrecipitation,
  getWeatherIcon,
  getWeatherCondition,
  type WeatherData as WeatherServiceData,
} from "../services/weatherService";
import { useAppContext } from "../context/AppContext";
import { getUserRole, getUserData } from "../utils/auth";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import GoogleTranslateWidget from "./GoogleTranslateWidget";

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  toggleSidebar,
  isSidebarOpen,
}) => {
  const [weather, setWeather] = useState<WeatherServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "granted" | "denied" | "prompt" | "loading"
  >("prompt");
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const { getCached, setCached } = useAppContext();

  // Conditionally use farmer profile hook only for farmers
  const userRole = getUserRole();
  const farmerProfile = useFarmerProfile();
  const { profile: farmerProfileData, loading: farmerProfileLoading } =
    farmerProfile;

  // Get user's current location using geolocation API
  const getUserCurrentLocation = (): Promise<{
    latitude: number;
    longitude: number;
  }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        }
      );
    });
  };

  // Request location permission and get coordinates
  const requestLocationPermission = async () => {
    try {
      setLocationPermission("loading");
      const location = await getUserCurrentLocation();
      setUserLocation(location);
      setLocationPermission("granted");
      setShowLocationPrompt(false);
    } catch (error) {
      console.error("📍 Location access denied or failed:", error);
      setLocationPermission("denied");
      setShowLocationPrompt(false);
    }
  };

  // Get location based on user role
  const getLocationForUser = async (): Promise<{
    latitude: number;
    longitude: number;
    source: string;
  }> => {
    // For farmers, prioritize farm location over current location
    if (userRole === "farmer") {

      // First try farm location
      if (
        farmerProfileData &&
        farmerProfileData.plots &&
        farmerProfileData.plots.length > 0
      ) {
        const firstPlot = farmerProfileData.plots[0];
        const coordinates = firstPlot.coordinates?.location?.coordinates;

        if (coordinates && coordinates.length === 2) {
          const [longitude, latitude] = coordinates;
          return { latitude, longitude, source: "farm" };
        }
      }

      // If no farm location, try current location
      if (userLocation) {
        return { ...userLocation, source: "current" };
      }

      if (locationPermission === "loading") {
        throw new Error("Waiting for location");
      }

      // If no location available, show prompt
      if (locationPermission === "prompt") {
        setShowLocationPrompt(true);
        throw new Error("Location permission required");
      }

      // Fallback to default location
      return { latitude: 18.5204, longitude: 73.8567, source: "default" };
    }

    // For non-farmers (manager, field officer, owner), use current location
    if (userLocation) {
      return { ...userLocation, source: "current" };
    }

    if (locationPermission === "loading") {
      throw new Error("Waiting for location");
    }

    // If no location available, show prompt
    if (locationPermission === "prompt") {
      setShowLocationPrompt(true);
      throw new Error("Location permission required");
    }

    // Denied or unknown: fallback to default location (Pune, India)
    return { latitude: 18.5204, longitude: 73.8567, source: "default" };
  };

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = () => {
      const currentUserData = getUserData();
      setUserData(currentUserData);
    };

    loadUserData();
  }, []);


  useEffect(() => {
    // Prevent fetching if component is not ready
    if (userRole === "farmer" && farmerProfileLoading) {
      console.log("🌤️ Header: Waiting for farmer profile to load before fetching weather");
      return;
    }

    // Flag to prevent multiple simultaneous requests
    let isMounted = true;
    let requestAborted = false;

    const fetchWeather = async () => {
      // Prevent multiple simultaneous requests
      if (requestAborted || !isMounted) {
        console.log("🌤️ Header: Skipping weather fetch - request already in progress or component unmounted");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Get location based on user role
        const locationData = await getLocationForUser();
        const { latitude, longitude, source } = locationData;

        // Validate coordinates before making request
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
          console.warn("🌤️ Header: Invalid coordinates, skipping weather fetch", { latitude, longitude });
          setError("Weather service temporarily unavailable.");
          setLoading(false);
          return;
        }

        // Check cache first (5 minute cache)
        const cacheKey = `weather_${latitude}_${longitude}`;
        const cached = getCached(cacheKey);
        const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

        if (cached && cacheAge < CACHE_DURATION) {
          console.log("🌤️ Header: Using cached weather data", {
            age: Math.round(cacheAge / 1000),
            location: cached.data.location,
          });
          if (isMounted) {
          setWeather(cached.data);
          setError(null);
          setLoading(false);
          }
          return;
        }

        console.log("🌤️ Header: Fetching weather data", {
          lat: latitude,
          lon: longitude,
          source,
          cacheAge: cached ? Math.round(cacheAge / 1000) : 'none',
        });

        // Fetch weather data with fallback enabled to prevent crashes
        const weatherData = await fetchCurrentWeather(latitude, longitude, true);

        if (!isMounted) {
          console.log("🌤️ Header: Component unmounted, ignoring weather data");
          return;
        }

        setWeather(weatherData);
        setError(null);
        setLoading(false);

        // Cache the data
        const payload = { data: weatherData, timestamp: Date.now() };
        setCached(cacheKey, payload);
      } catch (err) {
        console.error("🌤️ Header: Weather fetch error", {
          error: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : 'Unknown',
        });

        if (!isMounted) {
          return;
        }

        // Set a user-friendly error message that doesn't crash the dashboard
        if (err instanceof Error) {
          if (err.message === "Waiting for location") {
            setError(null);
            setLoading(true);
            return;
          }
          if (err.message === "Location permission required") {
            setError("Location access required for weather data");
          } else {
            // Use fallback message to prevent UI crashes
            setError("Weather service temporarily unavailable.");
          }
        } else {
          setError("Weather service temporarily unavailable.");
        }

        setLoading(false);
      }
    };

    // Initial fetch
    fetchWeather();

    // Set up periodic refresh every 10 minutes (only if component is still mounted)
    const interval = setInterval(() => {
      if (isMounted && !requestAborted) {
        fetchWeather();
      }
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      requestAborted = true;
      clearInterval(interval);
    };
  }, [
    userRole,
    farmerProfileLoading,
    userLocation,
    locationPermission,
  ]);

  const WeatherMarqueeContent = () => {
    // Determine location source text based on user role and data
    const getLocationText = () => {
      if (
        userRole === "farmer" &&
        farmerProfileData &&
        farmerProfileData.plots &&
        farmerProfileData.plots.length > 0
      ) {
        return "Farm Location";
      }
      return "Current Location";
    };

    return (
      <div className="weather-marquee-item">
        {weather && (
          <>
            {/* Location Info */}
            <div className="weather-item weather-location ">
              <MapPin className="weather-icon" size={18} />
              <span className="weather-text">{getLocationText()}</span>
            </div>

            {/* Weather Icon and Condition */}
            <div className="weather-item weather-condition bg-yellow-200 text-blue-600">
              <span className="weather-icon-text text-black-600">
                {getWeatherIcon(
                  weather.temperature_c,
                  weather.humidity,
                  weather.precip_mm
                )}
              </span>
              <span className="weather-text">
                {getWeatherCondition(
                  weather.temperature_c,
                  weather.humidity,
                  weather.precip_mm
                )}
              </span>
            </div>

            {/* Temperature */}
            <div className="weather-item weather-temp ">
              <Thermometer className="weather-icon" size={18} />
              <span className="weather-text">
                {formatTemperature(weather.temperature_c)}
              </span>
            </div>

            {/* Humidity */}
            <div className="weather-item weather-humidity">
              <Cloud className="weather-icon" size={18} />
              <span className="weather-text">
                {formatHumidity(weather.humidity)}
              </span>
            </div>

            {/* Wind Speed */}
            <div className="weather-item weather-wind">
              <Wind className="weather-icon" size={18} />
              <span className="weather-text">
                {formatWindSpeed(weather.wind_kph)}
              </span>
            </div>

            {/* Precipitation */}
            {weather.precip_mm > 0 && (
              <div className="weather-item weather-precipitation">
                <Droplet className="weather-icon" size={18} />
                <span className="weather-text">
                  {formatPrecipitation(weather.precip_mm)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Location Permission Prompt Component
  const LocationPermissionPrompt = () => (
    <div className="location-prompt-overlay">
      <div className="location-prompt-modal">
        <div className="location-prompt-header">
          <Navigation className="location-prompt-icon" size={24} />
          <h3>Location Access Required</h3>
        </div>
        <div className="location-prompt-content">
          <p>
            To show weather data for your current location, we need access to
            your device's location.
          </p>
          <p>
            This helps us provide accurate weather information for your area.
          </p>
        </div>
        <div className="location-prompt-actions">
          <button
            onClick={requestLocationPermission}
            disabled={locationPermission === "loading"}
            className="location-prompt-allow-btn"
          >
            {locationPermission === "loading"
              ? "Getting Location..."
              : "Allow Location"}
          </button>
          <button
            onClick={() => {
              setShowLocationPrompt(false);
              setLocationPermission("denied");
            }}
            className="location-prompt-deny-btn"
          >
            Use Default Location
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="header-container">
        {/* Main Header Section */}
        <div className="header-main">
          {/* Left side - Menu Button */}
          <button onClick={toggleSidebar} className="menu-button">
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Center - Weather Marquee */}
          <div className="marquee-section">
            <div className="marquee-container">
              {loading ? (
                <div className="loading-text">
                  {userRole === "farmer" && farmerProfileLoading
                    ? "Loading farmer profile..."
                    : "Loading weather data..."}
                </div>
              ) : error ? (
                <div className="error-text">
                  {error}
                  {error === "Location access required for weather data" && (
                    <button
                      onClick={() => setShowLocationPrompt(true)}
                      className="location-request-btn"
                    >
                      <MapPin size={16} />
                      Enable Location
                    </button>
                  )}
                </div>
              ) : (
                <div className="marquee-content">
                  <WeatherMarqueeContent />
                  {/* Duplicate content for seamless loop */}
                  <WeatherMarqueeContent />
                  {/* Extra duplicates to ensure no blank space on wide screens */}
                  <WeatherMarqueeContent />
                  <WeatherMarqueeContent />
                </div>
              )}
            </div>
          </div>

          {/* Right side - Fixed Logo */}
          <div className="logo-container">
            <GoogleTranslateWidget />
            <img src="/icons/Cropeye-new.png" alt="CropEye Logo" className="logo-image" />
          </div>
        </div>
      </header>

      {/* Location Permission Prompt */}
      {showLocationPrompt && <LocationPermissionPrompt />}
    </>
  );
};

export default Header;
