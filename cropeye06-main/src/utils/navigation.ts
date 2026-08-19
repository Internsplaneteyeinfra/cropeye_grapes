/**
 * Navigation utility to prevent infinite reload loops
 * Uses events instead of window.location.href to avoid full page reloads
 */

let navigationCallback: ((path: string) => void) | null = null;
let redirectInProgress = false;
let lastRedirectTime = 0;
const REDIRECT_COOLDOWN = 1000; // 1 second cooldown between redirects

/**
 * Set the navigation callback (should be called from AppRoutes)
 */
export const setNavigationCallback = (callback: (path: string) => void) => {
  navigationCallback = callback;
};

/**
 * Navigate to a path without causing a full page reload
 */
export const navigateToLogin = () => {
  // Demo/mock auth or frontend role preview: never bounce to login on API 401
  try {
    const { USE_MOCK_AUTH } = require("../config/authConfig");
    if (USE_MOCK_AUTH) {
      console.warn("⚠️ Navigation: mock auth active — skip redirect to /login");
      return;
    }
    const { isFrontendRolePreview } = require("./frontendRolePreview");
    if (isFrontendRolePreview()) {
      console.warn("⚠️ Navigation: frontend role preview — skip redirect to /login");
      return;
    }
  } catch {
    // continue with normal logout redirect
  }

  const now = Date.now();
  
  // Prevent rapid redirects (infinite loop protection)
  if (redirectInProgress) {
    console.warn('⚠️ Navigation: Redirect already in progress, skipping...');
    return;
  }

  if (now - lastRedirectTime < REDIRECT_COOLDOWN) {
    console.warn('⚠️ Navigation: Redirect prevented - too frequent (cooldown active)');
    return;
  }

  // Check if already on login page
  if (window.location.pathname === '/login') {
    console.warn('⚠️ Navigation: Already on login page, skipping redirect');
    return;
  }

  redirectInProgress = true;
  lastRedirectTime = now;

  // Use React Router navigation if available
  if (navigationCallback) {
    console.log('✅ Navigation: Using React Router navigation to /login');
    try {
      navigationCallback('/login');
      // Reset flag after navigation completes
      setTimeout(() => {
        redirectInProgress = false;
      }, REDIRECT_COOLDOWN);
    } catch (error) {
      console.error('❌ Navigation error:', error);
      redirectInProgress = false;
    }
  } else {
    // Fallback: Use window.location but only if not already on login
    console.warn('⚠️ Navigation: React Router not available, using window.location (fallback)');
    setTimeout(() => {
      if (window.location.pathname !== '/login') {
        // Clear auth data before redirect to prevent loops
        try {
          const { clearAuthData } = require('./auth');
          clearAuthData();
        } catch (e) {
          console.warn('Could not clear auth data:', e);
        }
        try {
          const { gatewayLogout } = require('./gatewayAuth');
          gatewayLogout();
        } catch {
          window.location.href = '/login';
        }
      }
      redirectInProgress = false;
    }, 100);
  }
};

/**
 * Reset redirect flag (call when navigation completes)
 */
export const resetRedirectFlag = () => {
  redirectInProgress = false;
};
