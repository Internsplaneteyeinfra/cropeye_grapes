import { clearAllLocalStorage, getAuthToken } from "./auth";
import { USE_MOCK_AUTH } from "../config/authConfig";

export const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ||
  (typeof window !== "undefined"
    ? (import.meta.env.DEV ? "http://localhost:5174" : window.location.origin)
    : "http://localhost:5174");

const getGatewayOrigin = () => {
  try {
    return new URL(GATEWAY_URL).origin;
  } catch {
    return GATEWAY_URL;
  }
};

const getGatewayLoginUrl = (logout = false) => {
  const base = getGatewayOrigin().replace(/\/+$/, "");
  const url = `${base}/login/`;
  return logout ? `${url}?logout=1` : url;
};

const isOnGatewayPath = () => {
  try {
    return window.location.pathname.startsWith("/login");
  } catch {
    return false;
  }
};

export function requireGatewayAuth(): void {
  if (USE_MOCK_AUTH) return;
  const token = getAuthToken();
  if (!token) {
    if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
      window.location.assign(getGatewayLoginUrl(true));
    }
  }
}

export function gatewayLogout(): void {
  clearAllLocalStorage();
  if (USE_MOCK_AUTH) {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    return;
  }
  if (!isOnGatewayPath()) window.location.assign(getGatewayLoginUrl(true));
}
