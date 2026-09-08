import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Satellite, Leaf, Mail, Lock, Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_BASE_URL, getRedirectURL } from "../config";
import { getIndustry, getToken, logout, setIndustry, setToken } from "../auth/auth";

const LOGIN_URL = `${API_BASE_URL.replace(/\/+$/, "")}/login/`;
const ME_URL = `${API_BASE_URL.replace(/\/+$/, "")}/users/me/`;

type LoginResponse = {
  access?: string;
  refresh?: string;
  user?: {
    industry?: {
      name?: string;
      crop_type?: string;
    };
    crop_type?: string;
  };
  crop_type?: string;
};

export default function LoginPage() {
  const [phone_number, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // NOTE: we keep the query param name as "industry" for compatibility with
  // cropeye06/cropeye07 bootstrap logic, but its value can be either
  // industry name or crop_type (preferred).
  const buildRedirectWithTokens = (baseUrl: string, access: string, refresh: string, industry: string) => {
    const u = new URL(baseUrl);
    u.searchParams.set("access", access);
    u.searchParams.set("refresh", refresh);
    u.searchParams.set("industry", industry);
    return u.toString();
  };

  // Handle logout=1 (clear storage and stay on login).
  // IMPORTANT: Do NOT auto-redirect from /login/ in production, otherwise users
  // cannot reach the login page when tokens exist in same-origin storage.
  useEffect(() => {
    // If coming from any app logout, clear gateway storage and stay on login
    try {
      const url = new URL(window.location.href);
      const shouldLogout = url.searchParams.get("logout") === "1";
      if (shouldLogout) {
        logout();
        url.searchParams.delete("logout");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        return;
      }
    } catch {
      // ignore
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const loginUrl = LOGIN_URL;
      console.info("[gateway] POST login →", loginUrl);
      const response = await axios.post<LoginResponse>(
        loginUrl,
        { phone_number: phone_number.trim(), password: password.trim() },
        { headers: { "Content-Type": "application/json", Accept: "application/json" } },
      );
      const result = response.data || {};

      const access = result.access;
      const refresh = result.refresh;

      if (!access || !refresh) {
        throw new Error("Invalid login response: missing access/refresh tokens");
      }

      // Token storage (required keys)
      setToken(access, refresh);

      let industryName = result.user?.industry?.name;
      let cropType =
        result.user?.industry?.crop_type ||
        result.user?.crop_type ||
        result.crop_type;
      let industryId =
        (result.user?.industry as { id?: number } | undefined)?.id ??
        (result.user as { industry_id?: number } | undefined)?.industry_id;

      // If industry missing on /login/, load /users/me/ for routing.
      if (!(cropType || industryName || industryId)) {
        try {
          console.info("[gateway] GET users/me →", ME_URL);
          const me = await axios.get(ME_URL, {
            headers: { Authorization: `Bearer ${access}` },
          });
          const u = me.data || {};
          industryName = u?.industry?.name || industryName;
          cropType =
            u?.industry?.crop_type || u?.crop_type || cropType;
          industryId = u?.industry?.id ?? u?.industry_id ?? industryId;
        } catch {
          // keep whatever login returned
        }
      }

      // Grapes industry id is commonly 3 when name/crop_type is missing
      let routingKey = String(cropType || industryName || "").trim();
      if (!routingKey && Number(industryId) === 3) routingKey = "grapes";
      if (!routingKey && Number(industryId) === 1) routingKey = "sugarcane";

      if (!routingKey) {
        setError(
          "Login OK, but user has no industry/crop_type. Assign grapes or sugarcane industry in backend.",
        );
        return;
      }
      setIndustry(routingKey);

      // Redirect is driven by crop_type (sugarcane/grapes). Industry name is fallback.
      const dest = getRedirectURL(routingKey);
      if (!dest) {
        setError(
          `Unknown industry "${routingKey}". Expected grapes or sugarcane on the user profile.`,
        );
        return;
      }

      window.location.assign(buildRedirectWithTokens(dest, access, refresh, routingKey));
    } catch (err: any) {
      logout();
      if (err?.response) {
        const status = err.response.status;
        const detail =
          typeof err.response.data?.detail === "string"
            ? err.response.data.detail
            : "";
        if (status === 400) {
          setError(
            detail ||
              "Invalid phone_number or password. Please check your credentials.",
          );
        } else if (status === 401) {
          setError(
            detail ||
              "Authentication failed. Please check your phone_number and password.",
          );
        } else if (status === 403) {
          setError("Access denied. Please contact your administrator.");
        } else if (status >= 500) {
          setError("Server error. Please try again later.");
        } else {
          setError(detail || "Login failed. Please try again.");
        }
      } else if (err?.request) {
        setError(
          ` Check Network tab and that the backend is running.`,
        );
      } else {
        setError(err?.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  // UI copied from cropeye07 (no redesign)
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        style={{
          backgroundImage: `url('/icons/sugarcane main slide.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        className="absolute inset-0"
      />
      <div className="absolute top-0 left-0 w-full flex justify-center items-center p-2 md:p-4 z-20">
        <img
          src="/icons/cropw.png"
          alt="SmartCropLogo"
          className="w-56 h-48 md:w-72 md:h-60 object-contain max-w-[60vw] md:max-w-[288px]"
          style={{ maxWidth: "60vw", height: "auto" }}
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
              <p className="text-lg text-emerald-50 mb-6 text-center">
                Welcome to the future of agriculture
              </p>
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
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <h3 className="text-3xl font-bold text-gray-800 mb-8 text-center">
                Login
              </h3>

              {/* Error Display */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-6 w-[50%]">
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                    <Mail className="w-5 h-5 mr-3 text-gray-500" />
                    <input
                      type="phone_number"
                      placeholder="Enter phone_number"
                      value={phone_number}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full outline-none text-gray-700"
                      required
                      disabled={loading}
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

                <div className="flex items-center justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    Forgot password?
                  </Link>
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
                    "Submit"
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

