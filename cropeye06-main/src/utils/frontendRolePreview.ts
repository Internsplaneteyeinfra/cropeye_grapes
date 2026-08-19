import {
  ALLOW_FRONTEND_ROLE_DASHBOARDS,
  FRONTEND_ROLE_PREVIEW_KEY,
} from "../config/authConfig";
import { setAuthData } from "./auth";

export type FrontendPreviewRole = "manager" | "owner" | "fieldofficer";

const PREVIEW_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyX2lkIjowLCJpZCI6MCwidXNlcm5hbWUiOiJkZW1vIiwicm9sZSI6ImRlbW8iLCJleHAiOjQxMDI0NDQ4MDB9.mocksig";

export const isFrontendRolePreview = (): boolean => {
  if (!ALLOW_FRONTEND_ROLE_DASHBOARDS) return false;
  try {
    return !!sessionStorage.getItem(FRONTEND_ROLE_PREVIEW_KEY);
  } catch {
    return false;
  }
};

export const getFrontendPreviewRole = (): FrontendPreviewRole | null => {
  if (!ALLOW_FRONTEND_ROLE_DASHBOARDS) return null;
  try {
    const role = sessionStorage.getItem(FRONTEND_ROLE_PREVIEW_KEY);
    if (role === "manager" || role === "owner" || role === "fieldofficer") {
      return role;
    }
  } catch {
    // ignore
  }
  return null;
};

/** Start a frontend-only session for Manager / Owner / Field Officer (no backend login). */
export const startFrontendRolePreview = (role: FrontendPreviewRole): void => {
  if (!ALLOW_FRONTEND_ROLE_DASHBOARDS) return;
  sessionStorage.setItem(FRONTEND_ROLE_PREVIEW_KEY, role);
  localStorage.removeItem("refresh_token");
  setAuthData(PREVIEW_TOKEN, role, {
    first_name: role === "fieldofficer" ? "Field Officer" : role.charAt(0).toUpperCase() + role.slice(1),
    last_name: "(Preview)",
    phone_number: "",
    username: `preview_${role}`,
    id: 0,
  });
};

export const clearFrontendRolePreview = (): void => {
  try {
    sessionStorage.removeItem(FRONTEND_ROLE_PREVIEW_KEY);
  } catch {
    // ignore
  }
};
