import { mockUsers } from "./mockUsers";

/** Build a jwt-decode-compatible token (signature not verified by the app). */
const encodePart = (obj) => {
  const json = JSON.stringify(obj);
  const b64 =
    typeof btoa === "function"
      ? btoa(json)
      : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

const buildMockAccessToken = () => {
  const header = encodePart({ alg: "none", typ: "JWT" });
  const payload = encodePart({
    user_id: 0,
    id: 0,
    username: "demo",
    role: "demo",
    // Far-future exp so isTokenExpired() never treats mock session as expired
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.mocksig`;
};

/** JWT-shaped string so isValidToken / Login format checks pass */
export const MOCK_ACCESS_TOKEN = buildMockAccessToken();

export const isMockAccessToken = (token) => {
  if (!token || typeof token !== "string") return false;
  if (token === MOCK_ACCESS_TOKEN) return true;
  // Older sessions used a placeholder string
  if (token === "mock.access.token") return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload?.role === "demo" || payload?.username === "demo";
  } catch {
    return false;
  }
};

export const mockLogin = (phone_number, password) => {
  const id = String(phone_number || "").trim().toLowerCase();
  const pass = String(password || "").trim();

  const user = mockUsers.find((u) => {
    const phoneMatch = u.phone_number === id;
    const aliasMatch = Array.isArray(u.aliases)
      ? u.aliases.some((a) => String(a).toLowerCase() === id)
      : false;
    return (phoneMatch || aliasMatch) && u.password === pass;
  });

  if (user) {
    localStorage.setItem("authUser", JSON.stringify(user));
    // Drop any leftover real refresh token so interceptors never try /token/refresh/
    localStorage.removeItem("refresh_token");
    return user;
  }
  return null;
};

export const mockLogout = () => {
  localStorage.removeItem("authUser");
};

export const getMockUser = () => {
  const raw = localStorage.getItem("authUser");
  return raw ? JSON.parse(raw) : null;
};
