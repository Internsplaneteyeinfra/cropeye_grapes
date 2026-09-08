
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Satellite, Leaf, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { setAuthData, setRefreshToken, getAuthToken, clearAuthData } from '../utils/auth';
import { USE_MOCK_AUTH } from '../config/authConfig.js';
import { login } from '../api';
import { saveUserIndustryFromProfile } from '../utils/userIndustry';
import { resetFarmerProfileStore } from '../hooks/useFarmerProfile';

export type UserRole = "manager" | "admin" | "fieldofficer" | "farmer" | "owner";

interface LoginProps {
  onLoginSuccess: (role: UserRole, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [phone_number, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Clear any stale/invalid tokens when login page loads (real auth only)
  useEffect(() => {
    if (USE_MOCK_AUTH) return;
    // Only clear if we're actually on the login page
    if (window.location.pathname === '/login') {
      const token = getAuthToken();
      // Clear token if it exists but might be invalid (prevents redirect loops)
      // Don't clear if user is actively logging in
      if (token && !loading) {
        // Check if token is expired or invalid format
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length !== 3) {
            // Invalid token format, clear it
            console.warn('⚠️ Login: Invalid token format detected, clearing...');
            clearAuthData();
          }
        } catch (e) {
          // Error parsing token, clear it
          console.warn('⚠️ Login: Error checking token, clearing...');
          clearAuthData();
        }
      }
    }
  }, []); // Only run once on mount

  // OTP flow removed — use phone/password login against Railway backend
  // NEW: Username and Password Login
  const completeMockLogin = async (phoneOrAlias: string, pass: string) => {
    setLoading(true);
    setError("");
    try {
      const { mockLogin, MOCK_ACCESS_TOKEN } = await import("../mockAuth/mockAuthService.js");
      const user = mockLogin(phoneOrAlias.trim(), pass.trim());
      if (!user) {
        setError("Invalid login. Use a valid phone number and password.");
        return;
      }
      const userRole = user.role as UserRole;
      const token = MOCK_ACCESS_TOKEN;
      setPhoneNumber(user.phone_number);
      setPassword(pass.trim());
      // Persist mock session (also drops stale refresh_token inside mockLogin)
      localStorage.setItem("authUser", JSON.stringify(user));
      setAuthData(token, userRole, {
        first_name: user.name,
        last_name: "",
        phone_number: user.phone_number,
        username: user.phone_number,
        id: 0,
      });
      onLoginSuccess(userRole, token);
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (USE_MOCK_AUTH) {
        await completeMockLogin(phone_number, password);
        return;
      }
      // Using the API function to login with email as username
      const response = await login(phone_number.trim(), password.trim());
      const result = response.data;

      const token = result.access || result.token;
      const refreshToken = result.refresh; // Get refresh token from response

      if (!token) {
        throw new Error('No authentication token received');
      }

      // User data is already included in the login response
      const userData = result.user;

      // Handle role determination (string role, role_id, or role object)
      const roleMap: { [key: number]: UserRole } = {
        1: 'farmer',
        2: 'fieldofficer',
        3: 'manager',
        4: 'owner',
      };
      let userRole: UserRole | null = null;

      if (userData?.role && typeof userData.role === 'object' && userData.role.name) {
        userRole = String(userData.role.name).toLowerCase() as UserRole;
      } else if (userData?.role && typeof userData.role === 'object' && userData.role.id != null) {
        userRole = roleMap[Number(userData.role.id)] || null;
      } else if (typeof userData?.role === 'string') {
        const r = userData.role.toLowerCase().replace(/[\s_-]/g, '');
        if (r === 'fieldofficer' || r === 'fo') userRole = 'fieldofficer';
        else if (r === 'manager') userRole = 'manager';
        else if (r === 'owner' || r === 'admin') userRole = r === 'admin' ? 'admin' : 'owner';
        else if (r === 'farmer') userRole = 'farmer';
        else userRole = userData.role.toLowerCase() as UserRole;
      } else if (typeof userData?.role === 'number') {
        userRole = roleMap[userData.role] || null;
      } else if (userData?.role_id != null) {
        userRole = roleMap[Number(userData.role_id)] || null;
      }

      if (!userRole || !['manager', 'admin', 'fieldofficer', 'farmer', 'owner'].includes(userRole)) {
        console.error('Could not determine user role from login user:', userData);
        throw new Error('Invalid user role');
      }

      // Store authentication data
      const userDataToStore = {
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        phone_number: userData.phone_number || phone_number,
        username: userData.username || phone_number,
        id: userData.id || '',
        industry: userData.industry ?? null,
        industry_id:
          userData.industry_id ??
          userData.industry?.id ??
          null,
      };

      // Store refresh token if available
      if (refreshToken) {
        setRefreshToken(refreshToken);
        console.log("✅ Refresh token stored successfully");
      } else {
        console.warn("⚠️ No refresh token received from login response");
      }

      setAuthData(token, userRole, userDataToStore, refreshToken);
      saveUserIndustryFromProfile(userData);
      resetFarmerProfileStore();

      console.log("✅ Login successful - Access token and refresh token stored");

      // Success - call the callback with role and token
      onLoginSuccess(userRole, token);

    } catch (err: any) {
      console.error('❌ Login error:', err);

      // Handle different types of errors
      if (err.response) {
        // Server responded with error status
        const status = err.response.status;
        const data = err.response.data;

        console.error('Server error response:', { status, data });

        if (status === 400) {
          setError('Invalid phone_number or password. Please check your credentials.');
        } else if (status === 401) {
          setError('Authentication failed. Please check your phone_number and password.');
        } else if (status === 403) {
          setError('Access denied. Please contact your administrator.');
        } else if (status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(data?.detail || data?.message || `Login failed (${status})`);
        }
      } else if (err.request) {
        console.error('Network error:', err.request);
        setError(
          'Cannot reach login API (/api/backend/login/ → Railway). Check Network tab for that request.',
        );
      } else {
        // Other error
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // COMMENTED OUT: handleBackToEmail function (no longer needed)
  // const handleBackToEmail = () => {
  //   setStep('input');
  //   setOtp('');
  //   setError('');
  // };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        style={{
          backgroundImage: `url('/icons/sugarcane main slide.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        className="absolute inset-0"
      />
      <div className="absolute top-0 left-0 w-full flex justify-center items-center p-2 md:p-4 z-20">
        <img
          src="/icons/cropw.png"
          alt="SmartCropLogo"
          className="w-56 h-48 md:w-72 md:h-60 object-contain max-w-[60vw] md:max-w-[288px]"
          style={{ maxWidth: '60vw', height: 'auto' }}
        />
      </div>

      <div className="relative min-h-screen flex flex-col md:flex-row items-center justify-center p-1 sm:p-2 md:p-4 overflow-hidden pt-25">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden"
        >
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-full md:w-1/2 bg-emerald-600 p-6 md:p-12 flex flex-col justify-center items-center text-white relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[url('/icons/sugarcane-plant.jpg')] bg-cover bg-center opacity-10" />
            <div className="relative z-10">
              <div className="flex items-center justify-center mb-8">
                <h1 className="text-4xl font-bold tracking-wide">CROPEYE</h1>
              </div>
              <p className="text-lg text-emerald-50 mb-6 text-center">Welcome to the future of agriculture</p>
              <div className="flex items-center justify-center space-x-2">
                <Leaf className="w-5 h-5" />
                <span>Intelligent Farming Solutions</span>
              </div>
            </div>
          </motion.div>
          {/* Right Panel - Login Form */}
          <div className="w-full md:w-1/2 p-6 md:p-12 ">
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
            >
              <h3 className="text-3xl font-bold text-gray-800 mb-6 text-center">
                Login
              </h3>

              {/* Error Display */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 w-full max-w-sm text-sm">
                  {error}
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-6 w-full max-w-sm">
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                    <Mail className="w-5 h-5 mr-3 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Enter phone number"
                      value={phone_number}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full outline-none text-gray-700"
                      required
                      disabled={loading}
                      autoComplete="username"
                    />
                  </div>
                </div>
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                    <Lock className="w-5 h-5 mr-3 text-gray-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full outline-none text-gray-700 pr-10"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="ml-2 p-1 text-gray-500 hover:text-gray-700 focus:outline-none transition-colors"
                      disabled={loading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !phone_number.trim() || !password.trim()}
                  className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <Satellite className="w-5 h-5 animate-spin mr-2" />
                      Submitting...
                    </div>
                  ) : (
                    'Submit'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
