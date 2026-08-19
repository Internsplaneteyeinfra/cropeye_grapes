export const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ||
  "http://localhost:5174";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "https://cropeye-backendd.up.railway.app/api";

function toAbsoluteAppUrl(maybeUrl: string): string {
  const raw = String(maybeUrl || "").trim();
  if (!raw) return raw;
  // If provided as relative path (recommended for single-domain deploy), prefix current origin.
  if (raw.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${raw}`;
  }
  return raw;
}

// CRITICAL: Industry mapping must be tolerant to typos like "grapse industry"
export function getRedirectURL(industryName: string | null | undefined): string | null {
  const name = String(industryName || "").toLowerCase().trim();

  const grapesUrl = toAbsoluteAppUrl(
    (import.meta.env.VITE_GRAPES_APP_URL as string | undefined) ||
    (typeof window !== "undefined" && !import.meta.env.DEV ? "/grapes/" : "http://localhost:3001"),
  );
  // Dev: sugarcane UI is cropeye07-main — run `npm run dev` there (port 3002). Override with VITE_SUGARCANE_APP_URL.
  const sugarcaneUrl = toAbsoluteAppUrl(
    (import.meta.env.VITE_SUGARCANE_APP_URL as string | undefined) ||
    (typeof window !== "undefined" && !import.meta.env.DEV ? "/sugarcan/" : "http://localhost:3002"),
  );

  // Accept "grapes", "grapse", "grape", "grap..." (common typo variants)
  if (name.includes("grape") || name.includes("graps") || name.includes("grap")) {
    return grapesUrl; // cropeye06 (or /grapes behind a reverse proxy)
  }

  // Accept "sugarcane", "sugar cane" and close variants
  if (name.includes("sugarcane") || name.includes("sugar cane") || (name.includes("sugar") && name.includes("cane"))) {
    return sugarcaneUrl; // cropeye07 (deployed at /sugarcan/ behind nginx)
  }

  return null;
}
