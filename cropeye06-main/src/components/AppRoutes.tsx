import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
// import Login from "../components/Login";
import App from "../App";
import CommonSpinner from "../components/CommanSpinner";
import {
  getAuthToken,
  getUserRole,
  // clearAuthData,
  clearAllLocalStorage,
  setAuthData,
  isValidToken,
} from "../utils/auth";
import { getCurrentUser } from "../api";
import { initializeTokenRefresh } from "../utils/tokenManager";
import { USE_MOCK_AUTH } from "../config/authConfig";
import { setNavigationCallback, resetRedirectFlag } from "../utils/navigation";
import { GATEWAY_URL } from "../utils/gatewayAuth";
import { clearAllCache } from "../components/utils/cache";
import { useAppContext } from "../context/AppContext";

const getGatewayOrigin = () => {
  try {
    return new URL(GATEWAY_URL).origin;
  } catch {
    return GATEWAY_URL;
  }
};

const isOnGatewayPath = () => {
  try {
    return window.location.pathname.startsWith("/login");
  } catch {
    return false;
  }
};

const getGatewayLoginUrl = (logout = false) => {
  const base = getGatewayOrigin().replace(/\/+$/, "");
  const url = `${base}/login/`;
  return logout ? `${url}?logout=1` : url;
};

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
    // Check authentication status on app start
    bootstrapTokensFromUrl();
    const token = getAuthToken();
    const savedRole = getUserRole() as UserRole | null;

        // Gateway enforcement: if no token, send to centralized login (except when already leaving)
        if (!token) {
          if (isMounted) setLoading(false);
          // Always route unauthenticated users to gateway (no internal login)
          if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
            window.location.assign(getGatewayLoginUrl(true));
          }
          checkInProgress = false;
          return;
        }

        // If on login page and no token, skip validation
        if (window.location.pathname === "/login") {
          // Internal login disabled -> send to gateway
          if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
            window.location.assign(getGatewayLoginUrl(true));
          }
          checkInProgress = false;
          return;
        }

    if (USE_MOCK_AUTH) {
          const mod = await import("../mockAuth/mockAuthService");
          const mockUser = mod.getMockUser();
          if (mockUser && mockUser.role && isMounted) {
            setUserRole(mockUser.role as UserRole);
            setIsAuthenticated(true);
          }
        } else {
          if (token) {
            // IMPORTANT: After coming from gateway, role may not be stored yet.
            // Always validate token to fetch role and avoid blank/loop screens.
            await validateToken(token, (savedRole || "farmer") as UserRole);
          } else {
            if (isMounted) setLoading(false);
          }
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

  // Initialize token refresh when authenticated
  useEffect(() => {
    if (isAuthenticated && userRole) {
      // Set up automatic token refresh
      const cleanup = initializeTokenRefresh();
      
      // Cleanup on unmount or when authentication changes
      return cleanup;
    }
  }, [isAuthenticated, userRole]);

  const validateToken = async (token: string, role: UserRole) => {
    const currentPath = window.location.pathname;
    if (currentPath === "/login") {
      if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
        window.location.assign(`${GATEWAY_URL}/login?logout=1`);
      }
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
        normalizedRole = userData.role.name.toLowerCase() as UserRole;
      } else if (
        userData.role &&
        typeof userData.role === "object" &&
        userData.role.id
      ) {
        // If role is an object with id property, map the id
        normalizedRole = roleMap[userData.role.id] || "farmer";
      } else if (userData.role && typeof userData.role === "string") {
        // If role is a string, use it directly
        normalizedRole = userData.role.toLowerCase() as UserRole;
      } else if (userData.role_id && typeof userData.role_id === "number") {
        // If role_id is a number, map it to role string
        normalizedRole = roleMap[userData.role_id] || "farmer";
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

  // const handleLoginSuccess = (role: UserRole, token: string) => {
  //   const normalizedRole = role.toLowerCase() as UserRole;

  //   // Store authentication data using utility function
  //   setAuthData(token, normalizedRole);

  //   // Update state
  //   setUserRole(normalizedRole);
  //   setIsAuthenticated(true);

  //   // Auto-redirect to dashboard
  //   navigate("/dashboard");
  // };

  const handleLogout = () => {
    clearApiCache();
    clearAllCache();
    
    // Clear ALL localStorage data (auth, cache, app state, etc.)
    clearAllLocalStorage();

    // Reset state
    setUserRole(null);
    setIsAuthenticated(false);
    
    // Redirect to centralized login
    if (window.location.origin !== getGatewayOrigin() || !isOnGatewayPath()) {
      window.location.assign(getGatewayLoginUrl(true));
    }
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
      {/* Login Route */}
      <Route
        path="/login"
        element={
          <div />
        }
      />

      {/* Dashboard Route */}
      <Route
        path="/dashboard"
        element={
          isAuthenticated && userRole ? (
            <App userRole={userRole} onLogout={handleLogout} />
          ) : (
            <div />
          )
        }
      />

      {/* Root Route */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <div />
          )
        }
      />

      {/* Catch all route */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <div />
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
