/**
 * Grapes-only owner hierarchy page (lazy cascade).
 * Isolated from sugarcane OwnerFarmDash / owner-hierarchy screens.
 */

import React, { useMemo } from "react";
import { ArrowLeft, RefreshCw, Grape } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUserRole } from "../../utils/auth";
import { getStoredUserIndustry } from "../../utils/userIndustry";
import { useGrapesOwnerHierarchy } from "../../hooks/useGrapesOwnerHierarchy";
import {
  GrapesOwnerCascadeSelect,
  GrapesOwnerPlotCard,
} from "./GrapesOwnerCascadeParts";
import { isGrapesOwnerHierarchyEligible } from "./grapesOwnerEligibility";

export { isGrapesOwnerHierarchyEligible } from "./grapesOwnerEligibility";

const GrapesOwnerHierarchyPage: React.FC = () => {
  const navigate = useNavigate();
  const role = getUserRole();
  const industry = getStoredUserIndustry();
  const eligible = isGrapesOwnerHierarchyEligible(role, industry.crop_type);

  const {
    managers,
    fieldOfficers,
    farmers,
    plots,
    selectedManagerId,
    selectedFieldOfficerId,
    selectedFarmerId,
    loadingManagers,
    loadingFieldOfficers,
    loadingFarmers,
    error,
    forbidden,
    cropType,
    industry: apiIndustry,
    displayPersonName,
    loadManagers,
    selectManager,
    selectFieldOfficer,
    selectFarmer,
  } = useGrapesOwnerHierarchy(eligible);

  const managerOptions = useMemo(
    () =>
      managers.map((m) => ({
        id: m.id,
        label: displayPersonName(m),
        meta:
          m.field_officers_count != null
            ? `${m.field_officers_count} FO`
            : undefined,
      })),
    [managers, displayPersonName],
  );

  const foOptions = useMemo(
    () =>
      fieldOfficers.map((fo) => ({
        id: fo.id,
        label: displayPersonName(fo),
        meta: fo.phone_number || fo.username,
      })),
    [fieldOfficers, displayPersonName],
  );

  const farmerOptions = useMemo(
    () =>
      farmers.map((f) => ({
        id: f.id,
        label: displayPersonName(f),
        meta: f.village || f.phone_number || f.username,
      })),
    [farmers, displayPersonName],
  );

  if (!eligible) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">
            Grapes owner hierarchy
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            This page is only for users with role <strong>owner</strong> and
            industry <code className="rounded bg-gray-100 px-1">crop_type =
            &quot;grapes&quot;</code>
            . Sugarcane owners should keep using the existing Farm Crop Status /
            owner hierarchy screens.
          </p>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Access denied</h1>
          <p className="mt-3 text-sm text-red-700">
            {error ||
              "403 — this grapes hierarchy endpoint is not available for your industry. The existing sugarcane owner hierarchy was not changed."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-lime-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-emerald-800 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </button>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Grape className="h-7 w-7 text-emerald-700" />
              Grapes owner hierarchy
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Select one level at a time: Manager → Field officer → Farmer →
              Plots
              {(cropType || apiIndustry?.crop_type) && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  {cropType || apiIndustry?.crop_type}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadManagers()}
            disabled={loadingManagers}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingManagers ? "animate-spin" : ""}`}
            />
            Reload managers
          </button>
        </div>

        {error && !forbidden && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm sm:grid-cols-3 sm:p-6">
          <GrapesOwnerCascadeSelect
            label="1. Manager"
            placeholder="Select manager"
            options={managerOptions}
            value={selectedManagerId}
            loading={loadingManagers}
            emptyText="No managers found for this grapes owner."
            onChange={(id) => void selectManager(id)}
          />
          <GrapesOwnerCascadeSelect
            label="2. Field officer"
            placeholder={
              selectedManagerId
                ? "Select field officer"
                : "Select a manager first"
            }
            options={foOptions}
            value={selectedFieldOfficerId}
            disabled={!selectedManagerId}
            loading={loadingFieldOfficers}
            emptyText="No field officers under this manager."
            onChange={(id) => void selectFieldOfficer(id)}
          />
          <GrapesOwnerCascadeSelect
            label="3. Farmer"
            placeholder={
              selectedFieldOfficerId
                ? "Select farmer"
                : "Select a field officer first"
            }
            options={farmerOptions}
            value={selectedFarmerId}
            disabled={!selectedFieldOfficerId}
            loading={loadingFarmers}
            emptyText="No farmers under this field officer."
            onChange={selectFarmer}
          />
        </div>

        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            4. Plots
          </h2>
          {!selectedFarmerId && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-8 text-center text-sm text-gray-500">
              Select a farmer to view plots.
            </p>
          )}
          {selectedFarmerId && plots.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-8 text-center text-sm text-gray-500">
              No plots linked to this farmer.
            </p>
          )}
          {selectedFarmerId && plots.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {plots.map((plot, idx) => (
                <GrapesOwnerPlotCard
                  key={plot.id ?? plot.fastapi_plot_id ?? idx}
                  plot={plot}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GrapesOwnerHierarchyPage;
