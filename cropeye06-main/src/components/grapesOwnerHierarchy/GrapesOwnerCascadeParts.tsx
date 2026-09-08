import React from "react";

type SelectOption = {
  id: number;
  label: string;
  meta?: string;
};

type CascadeSelectProps = {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: number | null;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  onChange: (id: number) => void;
};

export const GrapesOwnerCascadeSelect: React.FC<CascadeSelectProps> = ({
  label,
  placeholder,
  options,
  value,
  disabled,
  loading,
  emptyText = "No items found.",
  onChange,
}) => {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      <select
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-100"
        value={value ?? ""}
        disabled={disabled || loading}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
      >
        <option value="">
          {loading ? "Loading…" : placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.meta ? `${opt.label} (${opt.meta})` : opt.label}
          </option>
        ))}
      </select>
      {!loading && !disabled && options.length === 0 && (
        <p className="text-xs text-gray-500">{emptyText}</p>
      )}
    </div>
  );
};

type PlotCardProps = {
  plot: {
    id?: number;
    fastapi_plot_id?: string;
    gat_number?: string;
    plot_number?: string;
    village?: string;
    taluka?: string;
    district?: string;
    state?: string;
    location?: { coordinates?: [number, number] } | null;
    farms?: Array<{
      id?: number;
      farm_uid?: string;
      area_size?: string | number;
      plantation_type_display?: string;
      plantation_type?: string;
      plantation_date?: string;
    }>;
  };
};

export const GrapesOwnerPlotCard: React.FC<PlotCardProps> = ({ plot }) => {
  const title =
    [plot.gat_number, plot.plot_number].filter(Boolean).join("_") ||
    plot.fastapi_plot_id ||
    (plot.id != null ? `Plot #${plot.id}` : "Plot");
  const place = [plot.village, plot.taluka, plot.district, plot.state]
    .filter(Boolean)
    .join(", ");
  const coords = plot.location?.coordinates;
  const farm = plot.farms?.[0];

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="text-base font-semibold text-gray-900">{title}</div>
      {place && <p className="mt-1 text-sm text-gray-600">{place}</p>}
      {plot.fastapi_plot_id && (
        <p className="mt-1 text-xs text-gray-500">
          FastAPI ID: {plot.fastapi_plot_id}
        </p>
      )}
      {coords && coords.length >= 2 && (
        <p className="mt-1 text-xs text-gray-500">
          Location: {coords[1]?.toFixed?.(5) ?? coords[1]},{" "}
          {coords[0]?.toFixed?.(5) ?? coords[0]}
        </p>
      )}
      {farm && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {farm.area_size != null && farm.area_size !== "" && (
            <div>Area: {String(farm.area_size)}</div>
          )}
          {(farm.plantation_type_display || farm.plantation_type) && (
            <div>
              Plantation:{" "}
              {farm.plantation_type_display || farm.plantation_type}
            </div>
          )}
          {farm.plantation_date && (
            <div>Planted: {String(farm.plantation_date).split("T")[0]}</div>
          )}
        </div>
      )}
    </div>
  );
};
