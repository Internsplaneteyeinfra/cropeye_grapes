import React from "react";
import { Loader2, Sun } from "lucide-react";
import { useLightIntensity } from "../hooks/useLightIntensity";

/** Dashboard metric card: current sunlight on the selected plot. */
const LightIntensityCard: React.FC<{ location: [number, number] | null }> = ({ location }) => {
  const { loading, irradiance, sunshineHours } = useLightIntensity(location);

  return (
    <div
      className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <Sun className="w-7 h-7 text-amber-500" />
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: "#212121" }}>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : irradiance != null ? (
              Math.round(irradiance)
            ) : (
              "-"
            )}
          </div>
          <div className="text-sm font-semibold text-amber-500">W/m²</div>
        </div>
      </div>
      <p className="text-xs font-medium mt-2" style={{ color: "#616161" }}>
        Light Intensity
      </p>
      {!loading && sunshineHours != null && (
        <p className="text-[11px] text-gray-500">{sunshineHours.toFixed(1)} h sunshine today</p>
      )}
    </div>
  );
};

export default LightIntensityCard;
