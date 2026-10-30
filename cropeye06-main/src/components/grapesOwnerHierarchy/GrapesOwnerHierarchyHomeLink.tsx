/**
 * Home-grid tile for grapes owners only.
 * Does not touch sugarcane owner-hierarchy / OwnerFarmDash.
 */

import React from "react";
import { Grape } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUserRole } from "../../utils/auth";
import { getStoredUserIndustry } from "../../utils/userIndustry";
import { isGrapesOwnerHierarchyEligible } from "./grapesOwnerEligibility";

const GrapesOwnerHierarchyHomeLink: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const navigate = useNavigate();
  const eligible = isGrapesOwnerHierarchyEligible(
    getUserRole(),
    getStoredUserIndustry().crop_type,
  );

  if (!eligible) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate("/owner")}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
        style={{ minHeight: 0 }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <Grape className="h-4 w-4" />
        </span>
        Grapes Hierarchy
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/owner")}
      className="bg-emerald-300 hover:bg-emerald-400 p-4 sm:p-6 lg:p-8 rounded-xl shadow-sm transition-transform transform hover:scale-105 min-h-[120px] sm:min-h-[140px] lg:min-h-[160px]"
    >
      <div className="flex flex-col items-center justify-center space-y-2 sm:space-y-4 h-full">
        <div className="flex-shrink-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 flex items-center justify-center">
            <Grape className="w-full h-full text-emerald-800" />
          </div>
        </div>
        <span className="text-sm sm:text-base lg:text-lg font-semibold text-gray-800 text-center leading-tight break-words px-1">
          Grapes Hierarchy
        </span>
      </div>
    </button>
  );
};

export default GrapesOwnerHierarchyHomeLink;
