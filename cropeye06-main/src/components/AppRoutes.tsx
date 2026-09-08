import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import Login from "../components/Login";
import App from "../App";
import CommonSpinner from "../components/CommanSpinner";
import GrapesOwnerHierarchyPage from "../components/grapesOwnerHierarchy/GrapesOwnerHierarchyPage";
import {
  getAuthToken,
  getUserRole,
  clearAllLocalStorage,
  setAuthData,
  isValidToken,
} from "../utils/auth";
import { getCurrentUser } from "../api";
import { initializeTokenRefresh } from "../utils/tokenManager";
import { USE_MOCK_AUTH } from "../config/authConfig";
import { setNavigationCallback, resetRedirectFlag } from "../utils/navigation";
import { clearAllCache } from "../components/utils/cache";
import { useAppContext } from "../context/AppContext";
import { saveUserIndustryFromProfile } from "../utils/userIndustry";
import { clearFrontendRolePreview } from "../utils/frontendRolePreview";

const bootstrapTokensFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    const access = url.searchParams.get("access");
    const refresh = url.searchParams.get("refresh");
    const industry = url.searchParams.get("industry");
    if (access && refresh) {
      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      if (industry) localStorage.setItem("industry_type", industry);
      url.searchParams.delete("access");
      url.searchParams.delete("refresh");
      url.searchParams.delete("industry");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // ignore
  }
};

export type UserRole =
  | "manager"
  | "admin"
  | "fieldofficer"
  | "farmer"
  | "owner";

const AppRoutesContent: React.FC = () => {
  const navigate = useNavigate();
  const { clearApiCache } = useAppContext();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Set up navigation callback for API interceptors
  useEffect(() => {
    setNavigationCallback((path: string) => {
      navigate(path, { replace: true });
      resetRedirectFlag();
    });
  }, [navigate]);

  useEffect(() => {
    // Prevent multiple simultaneous authentication checks
    let isMounted = true;
    let checkInProgress = false;

    const checkAuth = async () => {
      // Prevent concurrent checks
      if (checkInProgress) {
        console.warn('⚠️ Auth check already in progress, skipping...');
        return;
      }

      checkInProgress = true;

      try {
        bootstrapTokensFromUrl();
        const token = getAuthToken();
        const savedRole = getUserRole() as UserRole | null;

        // Grapes mock auth: use internal /login (no gateway, no backend users)
        if (USE_MOCK_AUTH) {
          const mod = await import("../mockAuth/mockAuthService");
          const mockUser = mod.getMockUser();
          const roleFromStorage = (savedRole || mockUser?.role) as UserRole | null;
          if (token && roleFromStorage && isMounted) {
            // Keep authUser in sync if only role/token survived
            if (!mockUser && savedRole) {
              localStorage.setItem(
                "authUser",
                JSON.stringify({
                  phone_number: "",
                  password: "",
                  role: savedRole,
                  name: savedRole,
                })
              );
            }
            setUserRole(roleFromStorage);
            setIsAuthenticated(true);
          } else if (isMounted) {
            setIsAuthenticated(false);
            setUserRole(null);
            if (window.location.pathname !== "/login") {
              navigate("/login", { replace: true });
            }
          }
          if (isMounted) setLoading(false);
          checkInProgress = false;
          return;
        }

        if (!token) {
          if (isMounted) {
            setIsAuthenticated(false);
            setUserRole(null);
            setLoading(false);
            // Stay on grapes /login so Network shows /api/backend/login/ (Railway via Vite proxy)
            if (window.location.pathname !== "/login") {
              navigate("/login", { replace: true });
            }
          }
          checkInProgress = false;
          return;
        }

        if (window.location.pathname === "/login") {
          // Already on internal login with a token — validate below or stay for re-login
          if (isMounted) setLoading(false);
        }

        if (token) {
          await validateToken(token, (savedRole || "farmer") as UserRole);
        } else if (isMounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ Auth check error:', error);
        if (isMounted) {
          setLoading(false);
        }
      } finally {
        checkInProgress = false;
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize token refresh when authenticated (skip mock — no real JWT)
  useEffect(() => {
    if (USE_MOCK_AUTH) return;
    if (isAuthenticated && userRole) {
      const cleanup = initializeTokenRefresh();
      return cleanup;
    }
  }, [isAuthenticated, userRole]);

  const validateToken = async (token: string, role: UserRole) => {
    const currentPath = window.location.pathname;
    if (currentPath === "/login") {
      // Stay on internal login — do not redirect to gateway
      setLoading(false);
      return;
    }

    try {
      // Check if token exists and is valid format
      if (!token || token.trim() === "") {
        console.warn('⚠️ validateToken: No token provided');
        handleLogout();
        return;
      }

      // Validate token format before making API call
      if (!isValidToken(token)) {
        console.warn('⚠️ validateToken: Invalid token format');
        handleLogout();
        return;
      }

      // Use the API function to get current user (automatically uses stored token)
      const response = await getCurrentUser();
      const userData = response.data;
      saveUserIndustryFromProfile(userData);

      // Handle both string roles and numeric role_id
      let normalizedRole: UserRole;

      // Create role mapping
      const roleMap: { [key: number]: UserRole } = {
        1: "farmer",
        2: "fieldofficer",
        3: "manager",
        4: "owner",
      };

      if (
        userData.role &&
        typeof userData.role === "object" &&
        userData.role.name
      ) {
        // If role is an object with name property, use the name
        const name = String(userData.role.name).toLowerCase().replace(/[\s_-]/g, "");
        if (name === "fieldofficer" || name === "fo") normalizedRole = "fieldofficer";
        else if (name === "admin") normalizedRole = "admin";
        else normalizedRole = userData.role.name.toLowerCase() as UserRole;
      } else if (
        userData.role &&
        typeof userData.role === "object" &&
        userData.role.id
      ) {
        // If role is an object with id property, map the id
        normalizedRole = roleMap[userData.role.id] || "farmer";
      } else if (userData.role && typeof userData.role === "string") {
        // If role is a string, use it directly
        const name = userData.role.toLowerCase().replace(/[\s_-]/g, "");
        if (name === "fieldofficer" || name === "fo") normalizedRole = "fieldofficer";
        else if (name === "admin") normalizedRole = "admin";
        else normalizedRole = userData.role.toLowerCase() as UserRole;
      } else if (userData.role_id && typeof userData.role_id === "number") {
        // If role_id is a number, map it to role string
        normalizedRole = roleMap[userData.role_id] || "farmer";
      } else if (userData.role_id != null) {
        normalizedRole = roleMap[Number(userData.role_id)] || "farmer";
      } else {
        // Fallback: check if role is already a number
        const roleId = userData.role || userData.role_id;
        if (typeof roleId === "number") {
          normalizedRole = roleMap[roleId] || "farmer";
        } else {
          // Invalid role, logout
          handleLogout();
          return;
        }
      }

      if (
        normalizedRole &&
        ["manager", "admin", "fieldofficer", "farmer", "owner"].includes(
          normalizedRole
        )
      ) {
        setUserRole(normalizedRole);
        setIsAuthenticated(true);

        // Update localStorage with normalized role
        setAuthData(token, normalizedRole, {
          first_name: userData.first_name || "",
          last_name: userData.last_name || "",
          email: userData.email || "",
          username: userData.username || "",
          id: userData.id || "",
        });
      } else {
        // Invalid role, logout
        handleLogout();
      }
    } catch (error: any) {
      const status = error.response?.status;
      // const errorMessage = error.response?.data?.detail || error.message;
      
      // Handle 401/403 - Token expired or invalid
      if (status === 401 || status === 403) {
        handleLogout();
        return;
      }
      
      // Handle network errors - keep user logged in with cached credentials
      // This prevents logout when accessing from different network/laptop
      if (!error.response || error.code === 'ECONNABORTED' || error.message?.includes('Network Error') || error.message?.includes('timeout')) {
        console.warn('⚠️ Network error detected, keeping user logged in with cached credentials');
        setUserRole(role);
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }
      
      // Handle CORS errors - also keep user logged in
      if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
        console.warn('⚠️ CORS/Network error detected, keeping user logged in with cached credentials');
        setUserRole(role);
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }
      
      // Handle other errors - only logout for actual auth errors
      // For unknown errors, keep user logged in if we have a valid token format
      if (isValidToken(token)) {
        console.warn('⚠️ API error but token format is valid, keeping user logged in');
        setUserRole(role);
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }
      
      // Only logout if token is invalid format
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (role: UserRole, _token: string) => {
    const normalizedRole = role.toLowerCase() as UserRole;
    setUserRole(normalizedRole);
    setIsAuthenticated(true);
    setLoading(false);
    // Force dashboard route after mock login (farmer Map fires APIs that used to bounce back)
    navigate("/dashboard", { replace: true });
  };

  const handleLogout = () => {
    clearApiCache();
    clearAllCache();
    clearFrontendRolePreview();
    clearAllLocalStorage();

    setUserRole(null);
    setIsAuthenticated(false);

    // Grapes login page — login call visible in Network as /api/backend/login/
    navigate("/login", { replace: true });
  };

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <CommonSpinner />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated && userRole ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLoginSuccess={handleLoginSuccess} />
          )
        }
      />

      <Route
        path="/dashboard"
        element={
          isAuthenticated && userRole ? (
            <App userRole={userRole} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Grapes-only owner hierarchy (isolated from sugarcane owner-hierarchy) */}
      <Route
        path="/owner"
        element={
          isAuthenticated && userRole ? (
            <GrapesOwnerHierarchyPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/owner/grapes-hierarchy"
        element={
          isAuthenticated && userRole ? (
            <GrapesOwnerHierarchyPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppRoutesContent />
    </Router>
  );
};

export default AppRoutes;
