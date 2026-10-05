export interface ProfileCompletion {
  percentage: number;
  missing: string[];
}

export function calculateProfileCompletion(profile: any): ProfileCompletion {
  const farmer = profile?.farmer_profile as any;
  const personal = farmer?.personal_info ?? {};
  const address = farmer?.address_info ?? {};
  const plots = profile?.plots ?? [];
  const farms = plots.flatMap((plot: any) => plot?.farms ?? []);
  const firstFarm = farms[0] ?? {};
  const crop = firstFarm.crop_type ?? {};
  const irrigation = firstFarm.irrigations?.[0] ?? {};
  const hasValue = (value: unknown) =>
    value != null && String(value).trim() !== "";

  const fields = [
    {
      label: "Full Name",
      complete: hasValue(
        personal.full_name ||
          [personal.first_name, personal.last_name].filter(Boolean).join(" "),
      ),
    },
    { label: "Email", complete: hasValue(farmer?.email || personal.email) },
    { label: "Phone Number", complete: hasValue(personal.phone_number) },
    {
      label: "Address",
      complete: hasValue(
        address.full_address ||
          address.address ||
          address.village ||
          address.taluka,
      ),
    },
    {
      label: "Aadhaar Number",
      complete: hasValue(
        personal.aadhaar_number ||
          personal.aadhar_number ||
          personal.aadhar_card ||
          farmer?.aadhaar_number ||
          farmer?.aadhar_number ||
          farmer?.aadhar_card,
      ),
    },
    { label: "Farm Plot", complete: plots.length > 0 },
    {
      label: "Crop Details",
      complete: hasValue(crop.crop_type || crop.crop_variety || firstFarm.variety),
    },
    { label: "Planting Date", complete: hasValue(firstFarm.plantation_date) },
    {
      label: "Irrigation Details",
      complete: hasValue(
        irrigation.irrigation_type || irrigation.irrigation_type_code,
      ),
    },
  ];
  const missing = fields
    .filter((field) => !field.complete)
    .map((field) => field.label);
  const backendPercentage = Number(
    farmer?.profile_completion_percentage ??
      farmer?.profile_completion ??
      profile?.profile_completion_percentage,
  );
  const percentage = Number.isFinite(backendPercentage)
    ? Math.max(0, Math.min(100, Math.round(backendPercentage)))
    : Math.round(((fields.length - missing.length) / fields.length) * 100);

  return { percentage, missing };
}