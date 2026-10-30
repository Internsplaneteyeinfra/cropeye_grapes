import { clearAllLocalStorage, getAuthToken } from "./auth";

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

export const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ||
  (typeof window !== "undefined"
    ? (!isLocalHostname(window.location.hostname)
        ? window.location.origin
        : import.meta.env.DEV
          ? "http://localhost:5175"
          : window.location.origin)
    : "http://localhost:5175");

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
  const token = getAuthToken();
  if (!token) {
    if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
      window.location.assign(getGatewayLoginUrl(true));
    }
  }
}

export function gatewayLogout(): void {
  clearAllLocalStorage();
  if (!isOnGatewayPath()) window.location.assign(getGatewayLoginUrl(true));
}
