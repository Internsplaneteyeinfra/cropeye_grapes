import React from "react";
import { Loader2 } from "lucide-react";

/** Shared owner-dashboard theme tokens as Tailwind classes (no extra CSS file). */
export const OD_THEME = "rounded-3xl bg-[#eef8f2] px-2.5 pt-2.5";
export const OD_KPI =
  "rounded-2xl border border-white/[0.22] bg-white/[0.16] backdrop-blur";
export const OD_CARD =
  "rounded-[20px] border border-[rgba(15,80,50,0.08)] bg-white shadow-[0_10px_28px_rgba(15,80,50,0.07)]";
export const OD_TILE =
  "rounded-2xl border border-[rgba(15,80,50,0.08)] bg-[#f4faf6]";

export const DashHero: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = "", children }) => (
  <section
    className={`relative overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_92%_8%,rgba(190,242,100,0.28),transparent_46%),linear-gradient(112deg,#064e3b_0%,#0f7a4a_48%,#16a34a_100%)] text-white shadow-[0_16px_36px_rgba(6,78,59,0.22)] ${className}`}
  >
    {children}
    <span
      className="pointer-events-none absolute -right-10 -top-[50px] h-[220px] w-[220px] rounded-full bg-white/[0.08]"
      aria-hidden
    />
  </section>
);

export const STATUS_COLORS: Record<string, string> = {
  "Ready to Harvest": "#f59e0b",
  Harvested: "#64748b",
  Growing: "#16a34a",
  "Not reported": "#cbd5e1",
};

const EXTRA_STATUS_COLORS = ["#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444"];

export function statusColor(status: string, index = 0): string {
  return STATUS_COLORS[status] ?? EXTRA_STATUS_COLORS[index % EXTRA_STATUS_COLORS.length];
}

export function fmt(value: number | null | undefined, digits = 1, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${suffix}`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

export const Card: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = "", children }) => (
  <div
    className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}
  >
    {children}
  </div>
);

export const SectionHeader: React.FC<{
  step?: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ step, icon, title, subtitle, action }) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[#143328] sm:text-lg">
          {step != null && (
            <span className="mr-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
              {String(step).padStart(2, "0")}
            </span>
          )}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-[#5b7468] sm:text-sm">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

export const Kpi: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  loading?: boolean;
  tone?: "emerald" | "sky" | "amber" | "violet" | "slate";
}> = ({ label, value, hint, icon, loading, tone = "emerald" }) => {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-emerald-900/5 bg-white p-3 shadow-[0_6px_16px_rgba(15,80,50,0.05)] sm:p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="truncate text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : value}
        </p>
        {hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ message: string; loading?: boolean }> = ({
  message,
  loading,
}) => (
  <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-6 text-center text-sm text-[#5b7468]">
    {loading && <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />}
    <span>{message}</span>
  </div>
);

export const Stat: React.FC<{ label: string; value: string; accent?: string }> = ({
  label,
  value,
  accent = "text-slate-900",
}) => (
  <div className={`${OD_TILE} min-w-0 px-3 py-2`}>
    <p className="truncate text-[11px] uppercase tracking-wide text-[#5b7468]">{label}</p>
    <p className={`truncate text-sm font-semibold tabular-nums ${accent}`}>{value}</p>
  </div>
);
