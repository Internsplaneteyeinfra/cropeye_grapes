import React from "react";
import { MISSING_LABEL, type FieldState, type MissingKind } from "../../utils/dataAvailability";

const MISSING_STYLE: Record<MissingKind, string> = {
  not_available: "bg-slate-100 text-slate-600",
  not_measured: "bg-sky-50 text-sky-700",
  overdue: "bg-amber-50 text-amber-700",
};

/** Stat tile that explains why a value is missing instead of showing "—". */
export const FieldStateStat: React.FC<{ label: string; state: FieldState; accent?: string }> = ({
  label,
  state,
  accent = "text-slate-900",
}) => (
  <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
    <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    {state.kind === "value" ? (
      <p className={`truncate text-sm font-semibold tabular-nums ${accent}`}>{state.text}</p>
    ) : (
      <>
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${MISSING_STYLE[state.kind]}`}>
          {state.text}
        </span>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{state.why}</p>
      </>
    )}
  </div>
);

export const FieldStateLegend: React.FC = () => (
  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
    {(Object.keys(MISSING_LABEL) as MissingKind[]).map((k) => (
      <span key={k} className="flex items-center gap-1">
        <span className={`rounded-full px-1.5 py-0.5 font-semibold ${MISSING_STYLE[k]}`}>{MISSING_LABEL[k]}</span>
        {k === "not_available" && "no record — fix the data"}
        {k === "not_measured" && "crop too early"}
        {k === "overdue" && "should exist by now"}
      </span>
    ))}
  </div>
);
