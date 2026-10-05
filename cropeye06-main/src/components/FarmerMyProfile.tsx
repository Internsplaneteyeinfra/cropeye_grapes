import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Sprout,
  Save,
  UserRound,
} from "lucide-react";
import { updateUser } from "../api";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import { getPlotAreaAcresFromProfile } from "../utils/grapesEventsBundle";

function displayValue(value: unknown): string {
  if (value == null || String(value).trim() === "") return "Not provided";
  return String(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

interface FarmerMyProfileProps {
  initialEditMode?: boolean;
}

type ProfileFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aadhaar: string;
  address: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
};

const FarmerMyProfile: React.FC<FarmerMyProfileProps> = ({
  initialEditMode = false,
}) => {
  const { profile, loading, error, refreshMyProfile } = useFarmerProfile();
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    aadhaar: "",
    address: "",
    village: "",
    taluka: "",
    district: "",
    state: "",
  });
  const plots = profile?.plots ?? [];
  const personalInfo = profile?.farmer_profile?.personal_info;
  const addressInfo = profile?.farmer_profile?.address_info;
  const accountInfo = profile?.farmer_profile?.account_info;
  const agricultureSummary = profile?.agricultural_summary;

  useEffect(() => {
    setIsEditing(initialEditMode);
  }, [initialEditMode]);

  useEffect(() => {
    const farmer = profile?.farmer_profile as any;
    const personal = farmer?.personal_info ?? {};
    const address = farmer?.address_info ?? {};
    setForm({
      firstName: personal.first_name ?? farmer?.first_name ?? "",
      lastName: personal.last_name ?? farmer?.last_name ?? "",
      email: farmer?.email ?? personal.email ?? "",
      phone: personal.phone_number ?? farmer?.phone_number ?? "",
      aadhaar:
        personal.aadhaar_number ??
        personal.aadhar_number ??
        personal.aadhar_card ??
        farmer?.aadhaar_number ??
        farmer?.aadhar_number ??
        farmer?.aadhar_card ??
        "",
      address: address.address ?? address.full_address ?? farmer?.address ?? "",
      village: address.village ?? farmer?.village ?? "",
      taluka: address.taluka ?? farmer?.taluka ?? "",
      district: address.district ?? farmer?.district ?? "",
      state: address.state ?? farmer?.state ?? "",
    });
  }, [profile]);

  const plotAreas = useMemo(
    () =>
      plots.map((plot) => {
        const plotId = String(
          plot.fastapi_plot_id ||
            (plot.gat_number && plot.plot_number
              ? `${plot.gat_number}_${plot.plot_number}`
              : plot.id ?? ""),
        );
        return {
          plot,
          areaAcres: plotId
            ? getPlotAreaAcresFromProfile(profile, plotId)
            : null,
        };
      }),
    [plots, profile],
  );

  const totalAreaAcres = plotAreas.reduce(
    (total, item) => total + (item.areaAcres ?? 0),
    0,
  );
  const hasArea = plotAreas.some((item) => item.areaAcres != null);
  const farmerName =
    personalInfo?.full_name ||
    [personalInfo?.first_name, personalInfo?.last_name]
      .filter(Boolean)
      .join(" ") ||
    profile?.farmer_profile?.username ||
    "Farmer";

  const updateField = (key: keyof ProfileFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const farmerId = profile?.farmer_profile?.id;
    if (farmerId == null) {
      setSaveError("Your profile does not include an account ID, so it cannot be updated.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateUser(String(farmerId), {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        phone_number: form.phone.trim(),
        aadhar_card: form.aadhaar.trim(),
        address: form.address.trim(),
        village: form.village.trim(),
        taluka: form.taluka.trim(),
        district: form.district.trim(),
        state: form.state.trim(),
      });
      await refreshMyProfile(true);
      setIsEditing(false);
      setSaveSuccess(true);
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Profile could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 text-emerald-800" role="status">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Loading profile…</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="border-l-4 border-amber-500 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
          <p className="mt-2 text-sm text-gray-600">
            {error || "Profile information is not available."}
          </p>
          <button
            type="button"
            onClick={() => void refreshMyProfile()}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Farmer Account
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {isEditing ? "Update Profile" : "My Profile"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{farmerName}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Edit Profile
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshMyProfile(true)}
            disabled={loading || saving}
            title="Refresh profile"
            aria-label="Refresh profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {isEditing && (
        <form onSubmit={handleSaveProfile} className="space-y-4 border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Personal Details</h2>
            <p className="mt-1 text-sm text-gray-600">Update the information used for your farmer account.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([
              ["firstName", "First Name", "text"],
              ["lastName", "Last Name", "text"],
              ["email", "Email", "email"],
              ["phone", "Phone Number", "tel"],
              ["aadhaar", "Aadhaar Number", "text"],
              ["address", "Address", "text"],
              ["village", "Village", "text"],
              ["taluka", "Taluka", "text"],
              ["district", "District", "text"],
              ["state", "State", "text"],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="block text-sm font-medium text-gray-700">
                {label}
                <input
                  type={type}
                  value={form[key]}
                  onChange={(event) => updateField(key, event.target.value)}
                  autoComplete={key === "email" ? "email" : key === "phone" ? "tel" : "off"}
                  inputMode={key === "aadhaar" ? "numeric" : undefined}
                  maxLength={key === "aadhaar" ? 12 : undefined}
                  className="mt-1 block min-h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Profile updated successfully.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Some profile details could not be refreshed. Showing the last available profile data.
        </div>
      )}

      <section aria-labelledby="profile-summary-title">
        <h2 id="profile-summary-title" className="mb-3 text-base font-semibold text-gray-900">
          Farm Summary
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Total Plots</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {agricultureSummary?.total_plots ?? plots.length}
            </p>
          </div>
          <div className="border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Total Farms</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {agricultureSummary?.total_farms ?? profile.farms_count ?? "-"}
            </p>
          </div>
          <div className="border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">Total Area</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {hasArea ? totalAreaAcres.toFixed(2) : "-"}
              <span className="ml-1 text-sm font-medium text-gray-600">acre</span>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="personal-info-title" className="border-t border-gray-200 pt-5">
        <h2 id="personal-info-title" className="mb-3 text-base font-semibold text-gray-900">
          Personal Information
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Full Name</p><p className="text-sm font-medium text-gray-900">{farmerName}</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Email</p><p className="break-all text-sm font-medium text-gray-900">{displayValue(profile.farmer_profile?.email || profile.farmer_profile?.username)}</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Phone</p><p className="text-sm font-medium text-gray-900">{displayValue(personalInfo?.phone_number)}</p></div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Address</p><p className="text-sm font-medium text-gray-900">{displayValue(addressInfo?.full_address || addressInfo?.address)}</p></div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Village / Taluka</p><p className="text-sm font-medium text-gray-900">{displayValue([addressInfo?.village, addressInfo?.taluka].filter(Boolean).join(", "))}</p></div>
          </div>
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div><p className="text-xs text-gray-500">Member Since</p><p className="text-sm font-medium text-gray-900">{formatDate(accountInfo?.date_joined || accountInfo?.created_at)}</p></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="plots-title" className="border-t border-gray-200 pt-5">
        <div className="mb-3 flex items-center gap-2">
          <Sprout className="h-5 w-5 text-emerald-700" />
          <h2 id="plots-title" className="text-base font-semibold text-gray-900">My Plots</h2>
        </div>
        {plotAreas.length === 0 ? (
          <p className="bg-white px-4 py-6 text-sm text-gray-600">No plots are linked to this profile.</p>
        ) : (
          <div className="divide-y divide-gray-200 border-y border-gray-200 bg-white">
            {plotAreas.map(({ plot, areaAcres }, index) => {
              const farm = plot.farms?.[0];
              const irrigation = farm?.irrigations?.[0];
              const plotId = plot.fastapi_plot_id || plot.plot_id || plot.id;
              const plotAddress = plot.address;
              const address =
                typeof plotAddress === "string"
                  ? plotAddress
                  : plotAddress?.full_address ||
                    [plotAddress?.village, plotAddress?.taluka, plotAddress?.district]
                      .filter(Boolean)
                      .join(", ");
              const crop = farm?.crop_type;
              const variety = crop?.crop_variety;

              return (
                <article key={String(plotId ?? index)} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <h3 className="font-semibold text-gray-900">Plot {displayValue(plot.plot_number || plotId)}</h3>
                    <p className="mt-1 text-sm text-gray-600">{displayValue(address)}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <span><span className="text-gray-500">Crop:</span> {displayValue(crop?.crop_type || variety)}</span>
                      <span><span className="text-gray-500">Variety:</span> {displayValue(variety)}</span>
                      <span><span className="text-gray-500">Planting:</span> {formatDate(farm?.plantation_date)}</span>
                      <span><span className="text-gray-500">Irrigation:</span> {displayValue(irrigation?.irrigation_type)}</span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-gray-500">Area</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {areaAcres != null ? `${areaAcres.toFixed(2)} acre` : "Not provided"}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

export default FarmerMyProfile;
