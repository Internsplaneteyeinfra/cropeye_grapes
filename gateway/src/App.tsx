import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/Login";
import ForgotPasswordPage from "./pages/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPassword";

function LandingRedirect() {
  // IMPORTANT: Always render login at /login/.
  // Redirecting based on existing tokens prevents users from reaching the login page.
  return <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      {/* In production, this app is mounted under /login/ (basename). */}
      <Route path="/" element={<LandingRedirect />} />
      {/* Backward compatibility */}
      <Route
        path="/login"
        element={<Navigate to={{ pathname: "/", search: window.location.search }} replace />}
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
