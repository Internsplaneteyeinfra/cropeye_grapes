import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Leaf, Mail, Satellite } from "lucide-react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";
import LoginBrand from "../components/LoginBrand";

function isValidIdentifier(value: string): boolean {
  const v = value.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = /^\d{10}$/.test(v);
  return isEmail || isPhone;
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const apiBase = useMemo(() => API_BASE_URL.replace(/\/+$/, ""), []);
  const canSend = isValidIdentifier(identifier) && !sending;
  const canVerify = isValidIdentifier(identifier) && otp.trim().length > 0 && !verifying;

  const sendOtp = async () => {
    setError("");
    setInfo("");
    if (!isValidIdentifier(identifier)) {
      setError("Please enter a valid email or phone number.");
      return;
    }
    setSending(true);
    try {
      await axios.post(`${apiBase}/forgot-password/`, { identifier: identifier.trim() });
      setOtpSent(true);
      setInfo("OTP sent successfully.");
    } catch (err: any) {
      if (err?.response?.status >= 500) {
        setError("Server error. Please try again later.");
      } else if (err?.response?.status === 401) {
        setError("Please enter valid email or phone.");
      } else if (err?.response?.status === 404) {
        setError("Account not found.");
      } else if (err?.response?.status === 400) {
        setError("Invalid identifier. Please check and try again.");
      } else if (err?.request) {
        setError("Network error. Please check your internet connection.");
      } else {
        setError("Failed to send OTP. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!isValidIdentifier(identifier)) {
      setError("Please enter a valid email or phone number.");
      return;
    }
    if (!otp.trim()) {
      setError("Please enter the OTP.");
      return;
    }
    setVerifying(true);
    try {
      await axios.post(`${apiBase}/verify-otp/`, {
        identifier: identifier.trim(),
        otp: otp.trim(),
      });
      navigate("/reset-password", { state: { identifier: identifier.trim() } });
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Please enter valid identifier.");
      } else if (err?.response?.status === 400) {
        setError("Invalid OTP. Please check and try again.");
      } else if (err?.response?.status >= 500) {
        setError("Server error. Please try again later.");
      } else if (err?.request) {
        setError("Network error. Please check your internet connection.");
      } else {
        setError("OTP verification failed. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  };

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
      <LoginBrand />

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
                Reset your password securely
              </p>
              <div className="flex items-center justify-center space-x-2">
                <Leaf className="w-5 h-5" />
                <span>Intelligent Farming Solutions</span>
              </div>
            </div>
          </motion.div>

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
                Forgot Password
              </h3>

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 w-[80%]">
                  {error}
                </div>
              )}
              {info && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded mb-4 w-[80%]">
                  {info}
                </div>
              )}

              <form onSubmit={verifyOtp} className="space-y-6 w-[80%]">
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                    <Mail className="w-5 h-5 mr-3 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Email or Phone Number"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full outline-none text-gray-700"
                      required
                      disabled={sending || verifying}
                    />
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full outline-none text-gray-700"
                        disabled={sending || verifying}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={!canSend}
                      className="bg-emerald-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      title="Send OTP"
                    >
                      {sending ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canVerify}
                  className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-emerald-700 focus:ring-2 focus-within:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {verifying ? (
                    <div className="flex items-center justify-center">
                      <Satellite className="w-5 h-5 animate-spin mr-2" />
                      Verifying...
                    </div>
                  ) : (
                    "Submit"
                  )}
                </button>

                <div className="flex items-center justify-center">
                  <Link
                    to="/"
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
