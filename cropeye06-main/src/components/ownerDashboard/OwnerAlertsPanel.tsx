import React, { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, BellRing, CheckCircle2, Info } from "lucide-react";
import type { AlertLevel, OwnerAlert } from "../../utils/ownerAlerts";
import { Card, EmptyState, SectionHeader } from "./ownerDashboardUi";

const LEVEL_STYLE: Record<AlertLevel, { label: string; box: string; badge: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    box: "border-red-200 bg-red-50/70",
    badge: "bg-red-600 text-white",
    icon: <AlertOctagon className="h-5 w-5 text-red-600" />,
  },
  warning: {
    label: "Warning",
    box: "border-amber-200 bg-amber-50/70",
    badge: "bg-amber-500 text-white",
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  },
  info: {
    label: "Info",
    box: "border-sky-200 bg-sky-50/70",
    badge: "bg-sky-600 text-white",
    icon: <Info className="h-5 w-5 text-sky-600" />,
  },
  good: {
    label: "Good",
    box: "border-emerald-200 bg-emerald-50/70",
    badge: "bg-emerald-600 text-white",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  },
};

const LEVELS: AlertLevel[] = ["critical", "warning", "info", "good"];

const AlertRow: React.FC<{ alert: OwnerAlert }> = ({ alert }) => {
  const s = LEVEL_STYLE[alert.level];
  return (
    <li className={`flex gap-3 rounded-xl border p-3 ${s.box}`}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{alert.title}</p>
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
            {alert.category}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-slate-600">{alert.detail}</p>
        {alert.action && <p className="mt-1 text-xs font-semibold text-slate-800">→ {alert.action}</p>}
      </div>
    </li>
  );
};

type Props = {
  plotLabel: string | null;
  scopeLabel: string;
  plotAlerts: OwnerAlert[];
  scopeAlerts: OwnerAlert[];
  loading: boolean;
  /** Rendered under the scope-wide alerts in the right column. */
  aside?: React.ReactNode;
  /** Optional insight rendered on its own full-width row below the alert columns. */
  asideWide?: React.ReactNode;
};

const OwnerAlertsPanel: React.FC<Props> = ({ plotLabel, scopeLabel, plotAlerts, scopeAlerts, loading, aside, asideWide }) => {
  const [filter, setFilter] = useState<AlertLevel | "all">("all");
  const counts = useMemo(
    () => Object.fromEntries(LEVELS.map((l) => [l, plotAlerts.filter((a) => a.level === l).length])) as Record<AlertLevel, number>,
    [plotAlerts],
  );
  const shown = filter === "all" ? plotAlerts : plotAlerts.filter((a) => a.level === filter);

  return (
    <Card>
      <SectionHeader
        icon={<BellRing className="h-5 w-5" />}
        title="Alerts & detection"
        subtitle={`Detected automatically from satellite indices, soil moisture, pest risk and yield data${plotLabel ? ` for ${plotLabel}` : ""}.`}
        action={
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1 font-semibold ${filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
              style={{ minHeight: 0 }}
            >
              All {plotAlerts.length}
            </button>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setFilter(l)}
                className={`rounded-full px-3 py-1 font-semibold ${filter === l ? LEVEL_STYLE[l].badge : "bg-slate-100 text-slate-600"}`}
                style={{ minHeight: 0 }}
              >
                {LEVEL_STYLE[l].label} {counts[l]}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Plot · {plotLabel ?? "no plot selected"}
          </p>
          {!plotLabel ? (
            <EmptyState message="Select a plot to run detection." />
          ) : shown.length === 0 ? (
            <EmptyState
              loading={loading}
              message={loading ? "Analysing plot data…" : filter === "all" ? "No issues detected for this plot." : "No alerts at this level."}
            />
          ) : (
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {shown.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
              {loading && <li className="text-xs text-slate-400">Still loading more data…</li>}
            </ul>
          )}
        </div>
        <div className="flex h-full flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Across {scopeLabel}</p>
            {scopeAlerts.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                No portfolio-wide alerts.
              </p>
            ) : (
              <ul className="space-y-2">
                {scopeAlerts.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </div>
          {aside}
        </div>
      </div>
      {asideWide && <div className="mt-5 w-full">{asideWide}</div>}
    </Card>
  );
};

export default OwnerAlertsPanel;
