import { jwtDecode } from "jwt-decode";
import {
  getAuthToken,
  getRefreshToken,
  setAuthToken,
  setRefreshToken,
  clearAuthData,
} from "./auth";
import { navigateToLogin } from "./navigation";
import { USE_MOCK_AUTH } from "../config/authConfig";
import axios from "axios";

// Get API base URL — DEV uses Vite proxy /api/backend → Railway
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return "/api/backend";
  }
  const railway = "https://cropeye-backendd.up.railway.app/api";
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const base = raw && raw.length ? raw : railway;
  const withoutTrailing = base.replace(/\/+$/, "");
  const withApi = /\/api$/i.test(withoutTrailing)
    ? withoutTrailing
    : `${withoutTrailing}/api`;
  if (
    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|localhost|127\.0\.0\.1)/i.test(
      withApi,
    )
  ) {
    return railway;
  }
  return withApi;
};
const API_BASE_URL = getApiBaseUrl();

interface DecodedToken {
  exp: number;
  iat?: number;
  user_id?: number;
  id?: number;
  [key: string]: any;
}

/**
 * Decode JWT token and return payload
 */
export const decodeToken = (token: string): DecodedToken | null => {
  try {
    return jwtDecode<DecodedToken>(token);
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
};

/**
 * Check if token is expired or will expire soon
 * @param token - JWT token string
 * @param bufferSeconds - Number of seconds before expiration to consider token as "expiring soon" (default: 300 = 5 minutes)
 * @returns true if token is expired or expiring soon
 */
export const isTokenExpired = (
  token: string | null,
  bufferSeconds: number = 300,
): boolean => {
  if (!token) return true;

  // Demo mock tokens are not backend JWTs — treat as always valid
  if (USE_MOCK_AUTH) {
    if (token === "mock.access.token" || token.endsWith(".mocksig")) {
      return false;
    }
  }

  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  const expirationTime = decoded.exp;
  const timeUntilExpiration = expirationTime - currentTime;

  // Token is expired or will expire within bufferSeconds
  return timeUntilExpiration <= bufferSeconds;
};

/**
 * Get time until token expiration in seconds
 */
export const getTokenExpirationTime = (token: string | null): number | null => {
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;

  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp - currentTime;
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    console.warn("No refresh token available");
    return null;
  }

  try {
    const url = `${API_BASE_URL}/token/refresh/`;

    // Try common payload shapes (backend-dependent)
    let response;
    try {
      response = await axios.post(
        url,
        { refresh_token: refreshToken },
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (e: any) {
      // fallback for Django SimpleJWT style
      response = await axios.post(
        url,
        { refresh: refreshToken },
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const data = response.data || {};
    const access = data.access_token || data.access;
    const newRefreshToken = data.refresh_token || data.refresh;

    if (access) {
      setAuthToken(access);
      if (newRefreshToken) setRefreshToken(newRefreshToken);
      console.log("✅ Token refreshed successfully");
      return access as string;
    }

    return null;
  } catch (error: any) {
    console.error("❌ Token refresh failed:", error);

    // If refresh token is invalid/expired, clear all auth data
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn("Refresh token is invalid, clearing auth data");
      if (!USE_MOCK_AUTH) {
        clearAuthData();
        navigateToLogin();
      }
    }

    return null;
  }
};

/**
 * Check and refresh token if needed (proactive refresh)
 * @param bufferSeconds - Number of seconds before expiration to refresh (default: 300 = 5 minutes)
 * @returns Promise<boolean> - true if token is valid/refreshed, false if expired
 */
export const checkAndRefreshToken = async (
  bufferSeconds: number = 300,
): Promise<boolean> => {
  if (USE_MOCK_AUTH) {
    return !!getAuthToken();
  }

  try {
    const { isFrontendRolePreview } = await import("./frontendRolePreview");
    if (isFrontendRolePreview()) {
      return !!getAuthToken();
    }
  } catch {
    // ignore
  }

  const accessToken = getAuthToken();

  // No token at all
  if (!accessToken) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Try to refresh
      const newToken = await refreshAccessToken();
      return newToken !== null;
    }
    return false;
  }

  // Check if token is expired or expiring soon
  if (isTokenExpired(accessToken, bufferSeconds)) {
    console.log("Token expired or expiring soon, refreshing...");
    const newToken = await refreshAccessToken();
    return newToken !== null;
  }

  return true;
};

/**
 * Set up automatic token refresh on interval
 * @param intervalSeconds - Check interval in seconds (default: 60 = 1 minute)
 * @param bufferSeconds - Refresh buffer in seconds (default: 300 = 5 minutes)
 * @returns cleanup function to stop the interval
 */
export const setupAutoTokenRefresh = (
  intervalSeconds: number = 60,
  bufferSeconds: number = 300,
): (() => void) => {
  const intervalId = setInterval(async () => {
    await checkAndRefreshToken(bufferSeconds);
  }, intervalSeconds * 1000);

  // Return cleanup function
  return () => clearInterval(intervalId);
};

/**
 * Set up token refresh on page visibility change
 * Refreshes token when user returns to the page
 */
export const setupVisibilityTokenRefresh = (): (() => void) => {
  const handleVisibilityChange = async () => {
    if (document.visibilityState === "visible") {
      console.log("Page became visible, checking token...");
      await checkAndRefreshToken();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Return cleanup function
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};

/**
 * Set up token refresh on page focus
 */
export const setupFocusTokenRefresh = (): (() => void) => {
  const handleFocus = async () => {
    console.log("Window focused, checking token...");
    await checkAndRefreshToken();
  };

  window.addEventListener("focus", handleFocus);

  // Return cleanup function
  return () => {
    window.removeEventListener("focus", handleFocus);
  };
};

/**
 * Initialize all token refresh mechanisms
 * @returns cleanup function to stop all refresh mechanisms
 */
export const initializeTokenRefresh = (): (() => void) => {
  // Set up automatic refresh on interval
  const clearInterval = setupAutoTokenRefresh(60, 300); // Check every minute, refresh 5 min before expiration

  // Set up refresh on visibility change
  const clearVisibility = setupVisibilityTokenRefresh();

  // Set up refresh on window focus
  const clearFocus = setupFocusTokenRefresh();

  // Initial check
  checkAndRefreshToken().catch(console.error);

  // Return combined cleanup function
  return () => {
    clearInterval();
    clearVisibility();
    clearFocus();
  };
};
