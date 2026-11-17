import React, { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  Cloud,
  Grape,
  Layers,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Tractor,
  User,
  Users,
  UserSquare2,
  Wheat,
} from "lucide-react";
import type { OwnerUnit } from "../../hooks/useOwnerPortfolio";
import type { OwnerBackendCounts } from "../../utils/ownerCounts";
import {
  displayOwnerManagerName,
  summarizePlots,
  UNASSIGNED_MANAGER,
  type OwnerPlotRecord,
  type PortfolioSummary,
} from "../../utils/ownerPortfolio";
import GrapesOwnerHierarchyHomeLink from "../grapesOwnerHierarchy/GrapesOwnerHierarchyHomeLink";
import { DashHero, EmptyState, OD_CARD, OD_KPI, OD_THEME, fmt, fmtInt, statusColor } from "./ownerDashboardUi";

export const MODULES = [
  { title: "Farm Crop Status", label: "Farm Crop Status", icon: <BarChart3 className="h-4 w-4" />, tone: "bg-indigo-50 text-indigo-600" },
  { title: "Harvesting Planning", label: "Harvest Planning", icon: <Wheat className="h-4 w-4" />, tone: "bg-amber-50 text-amber-600" },
  { title: "Agroclimatic", label: "Agroclimatic", icon: <Cloud className="h-4 w-4" />, tone: "bg-sky-50 text-sky-600" },
  { title: "Team Connect", label: "Team Connect", icon: <Users className="h-4 w-4" />, tone: "bg-pink-50 text-pink-600" },
  { title: "Contactuser", label: "Contact Users", icon: <User className="h-4 w-4" />, tone: "bg-emerald-50 text-emerald-600" },
];

const PALETTES = [
  { header: "from-emerald-500 to-green-400", icon: "bg-emerald-600", bar: "bg-emerald-500" },
  { header: "from-teal-500 to-cyan-400", icon: "bg-teal-600", bar: "bg-teal-500" },
  { header: "from-violet-500 to-fuchsia-400", icon: "bg-violet-600", bar: "bg-violet-500" },
  { header: "from-blue-600 to-sky-400", icon: "bg-blue-600", bar: "bg-blue-500" },
  { header: "from-lime-500 to-emerald-400", icon: "bg-lime-600", bar: "bg-lime-500" },
];

type UnitCardData = {
  key: string;
  name: string;
  phone: string;
  location: string;
  fieldOfficers: number;
  farmers: number;
  summary: PortfolioSummary;
  districts: string[];
  /** Whether plots sit under a real manager (FO link) or the Unassigned bucket. */
  linkStatus: "linked" | "unassigned" | "empty";
};

type Props = {
  industryName: string | null;
  units: OwnerUnit[];
  plots: OwnerPlotRecord[];
  loading: boolean;
  agroLoading: boolean;
  managerCount: number;
  fieldOfficerCount: number;
  farmerCount: number;
  backendCounts: OwnerBackendCounts | null;
  onOpen: (unitKey: string) => void;
  onMenuClick: (menuTitle: string) => void;
};

function topCounts(values: string[], limit: number): [string, number][] {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export const ModulesCard: React.FC<{ onMenuClick: (menuTitle: string) => void }> = ({ onMenuClick }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    {MODULES.map((m) => (
      <button
        key={m.title}
        type="button"
        onClick={() => onMenuClick(m.title)}
        className="flex items-center gap-2.5 rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 shadow-[0_6px_16px_rgba(15,80,50,0.05)] transition hover:border-emerald-300 hover:bg-emerald-50"
        style={{ minHeight: 0 }}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.tone}`}>{m.icon}</span>
        <span className="truncate">{m.label}</span>
      </button>
    ))}
    <GrapesOwnerHierarchyHomeLink compact />
  </div>
);

const UnitCard: React.FC<{
  card: UnitCardData;
  index: number;
  industryName: string | null;
  totalFarmers: number;
  onOpen: (unitKey: string) => void;
}> = ({ card: c, index, industryName, totalFarmers, onOpen }) => {
  const palette = PALETTES[index % PALETTES.length];
  const statuses = Object.entries(c.summary.statusCounts).sort((a, b) => b[1] - a[1]);
  const share = totalFarmers > 0 ? Math.round((c.farmers / totalFarmers) * 100) : 0;
  const places = c.districts.length ? c.districts : c.location ? [c.location] : [];
  const linkBadge =
    c.linkStatus === "linked"
      ? { text: "Linked", className: "bg-emerald-50 text-emerald-700" }
      : c.linkStatus === "unassigned"
        ? { text: "Not linked", className: "bg-amber-50 text-amber-800" }
        : { text: "No FO / plots linked", className: "bg-slate-100 text-slate-600" };

  return (
    <button
      type="button"
      onClick={() => onOpen(c.key)}
      className="owner-dash-card group flex flex-col overflow-hidden text-left transition hover:-translate-y-0.5"
      style={{ minHeight: 0, padding: 0 }}
    >
      <div className={`relative h-12 shrink-0 bg-gradient-to-r ${palette.header}`}>
        <span className="absolute right-2.5 top-2 max-w-[75%] truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          {industryName ?? "Grapes industry"}
        </span>
        <span className="absolute -bottom-5 left-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow ring-2 ring-white">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${palette.icon}`}>
            <Grape className="h-4 w-4" />
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-1.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${linkBadge.className}`}>
            {linkBadge.text}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            {fmtInt(c.fieldOfficers)} FOs · {fmtInt(c.farmers)} farmers
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
          <p className="text-[11px] text-slate-500">Farm unit</p>
        </div>

        <div className="flex min-h-[18px] flex-wrap items-center gap-1.5 text-[10px]">
          {places.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
              <MapPin className="h-3 w-3" /> {d}
            </span>
          ))}
        </div>
        {c.phone && (
          <p className="-mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <Phone className="h-3 w-3" /> {c.phone}
          </p>
        )}

        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { label: "FOs", value: fmtInt(c.fieldOfficers) },
            { label: "Farmers", value: fmtInt(c.farmers) },
            { label: "Plots", value: fmtInt(c.summary.plots) },
            { label: "Acre", value: fmt(c.summary.areaAcres, 1) },
          ].map((s) => (
            <div key={s.label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 py-1">
              <p className="truncate text-xs font-bold tabular-nums text-slate-900">{s.value}</p>
              <p className="truncate text-[9px] uppercase text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span className="truncate">
              Crop stage mix
              {statuses.length > 0 && ` · ${statuses.map(([name, count]) => `${name} ${count}`).join(" · ")}`}
            </span>
            <span className="shrink-0 pl-2">{fmtInt(c.summary.plots)} plots</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
            {statuses.map(([name, count], idx) => (
              <span
                key={name}
                title={`${name}: ${count}`}
                style={{ width: `${(count / Math.max(1, c.summary.plots)) * 100}%`, background: statusColor(name, idx) }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span>Share of farmers</span>
            <span>{share}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className={`block h-full rounded-full ${palette.bar}`} style={{ width: `${share}%` }} />
          </div>
        </div>

        <span className="mt-auto flex items-center justify-between pt-1 text-xs font-semibold text-emerald-700">
          Open unit view
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
};

const OwnerUnitLanding: React.FC<Props> = ({
  industryName,
  units,
  plots,
  loading,
  managerCount,
  fieldOfficerCount,
  farmerCount,
  backendCounts,
  onOpen,
  onMenuClick,
}) => {
  const [query, setQuery] = useState("");
  const overall = useMemo(() => summarizePlots(plots), [plots]);
  const cards = useMemo<UnitCardData[]>(() => {
    const build = (
      key: string,
      base: Omit<UnitCardData, "summary" | "districts" | "key" | "linkStatus">,
      linkStatus: UnitCardData["linkStatus"],
    ): UnitCardData => {
      const unitPlots = plots.filter((p) => p.managerId === key);
      const summary = summarizePlots(unitPlots);
      const resolvedLink: UnitCardData["linkStatus"] =
        linkStatus === "unassigned"
          ? "unassigned"
          : summary.plots > 0 || base.farmers > 0
            ? "linked"
            : "empty";
      return {
        key,
        ...base,
        // Never show FO count on manager cards — plots/farmers stay under manager.
        fieldOfficers: 0,
        farmers: Math.max(base.farmers, summary.farmers),
        summary,
        districts: topCounts(unitPlots.map((p) => p.district), 2).map(([d]) => d),
        linkStatus: resolvedLink,
      };
    };
    const list = units.map((u) => build(u.key, u, "linked"));
    const known = new Set(units.map((u) => u.key));
    const orphanKeys = Array.from(new Set(plots.map((p) => p.managerId))).filter(
      (k) => !known.has(k),
    );
    orphanKeys.forEach((k) => {
      const sample = plots.find((p) => p.managerId === k)!;
      list.push(
        build(
          k,
          {
            name:
              k === UNASSIGNED_MANAGER
                ? "Plots not linked to a manager"
                : displayOwnerManagerName(sample.managerName),
            phone: "",
            location: "",
            fieldOfficers: 0,
            farmers: 0,
          },
          k === UNASSIGNED_MANAGER ? "unassigned" : "linked",
        ),
      );
    });
    // Keep all manager cards (including Grapes Manager); only empty ones stay hidden.
    return list
      .filter(
        (c) =>
          c.linkStatus === "unassigned" ||
          c.summary.plots > 0 ||
          c.farmers > 0,
      )
      .sort((a, b) => b.summary.plots - a.summary.plots || b.farmers - a.farmers);
  }, [units, plots]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => [c.name, c.location, ...c.districts].some((s) => s.toLowerCase().includes(q)));
  }, [cards, query]);

  const totals = {
    managers: cards.filter((c) => c.linkStatus !== "unassigned").length,
    fieldOfficers: 0,
    farmers: backendCounts?.farmers ?? Math.max(farmerCount, overall.farmers),
    plots: backendCounts?.plots ?? overall.plots,
    areaAcres: backendCounts?.areaAcres ?? overall.areaAcres,
  };
  const totalFarmers = totals.farmers;

  return (
    <div className={`${OD_THEME} mx-auto flex w-full max-w-[1440px] flex-col gap-4 pb-4`}>
      <DashHero className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Grape className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              <ShieldCheck className="h-3.5 w-3.5" /> Owner overview
            </p>
            <h1 className="truncate text-xl font-bold leading-tight sm:text-2xl">{industryName ?? "Grapes industry"}</h1>
            <p className="truncate text-xs text-emerald-50/90">
              Welcome · select a farm unit to see every vineyard parameter, crop stage, issues and history
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Farm units", value: fmtInt(totals.managers), icon: <UserSquare2 className="h-4 w-4" /> },
            { label: "Field Officers", value: fmtInt(totals.fieldOfficers), icon: <Users className="h-4 w-4" /> },
            { label: "Total Farmers", value: fmtInt(totals.farmers), icon: <Tractor className="h-4 w-4" /> },
            { label: "Total Plots", value: fmtInt(totals.plots), icon: <Layers className="h-4 w-4" /> },
            { label: "Total Field Area", value: fmt(totals.areaAcres, 1, " ac"), icon: <MapPin className="h-4 w-4" /> },
          ].map((k) => (
            <div key={k.label} className={`${OD_KPI} min-w-0 px-3 py-2`}>
              <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-emerald-50">
                {k.icon} {k.label}
              </p>
              <p className="mt-0.5 truncate text-lg font-bold tabular-nums">{loading ? "…" : k.value}</p>
            </div>
          ))}
        </div>
      </DashHero>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <UserSquare2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Select a farm unit</h2>
            <p className="truncate text-[11px] text-slate-500">
              {fmtInt(cards.length)} unit{cards.length === 1 ? "" : "s"} under {industryName ?? "your industry"} · click a card for the unit view
            </p>
          </div>
        </div>
        <label className="relative block w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manager, district…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm"
            style={{ minHeight: 0 }}
          />
        </label>
      </div>

      {!loading && cards.some((c) => c.linkStatus === "unassigned") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Plots not linked to a manager</b> still has rows the app could not match to a field officer
          (missing FO / manager id on the plot). Linked manager cards show plots that matched. Ask backend
          to set <code className="rounded bg-amber-100 px-1">field_officer_id</code> /{" "}
          <code className="rounded bg-amber-100 px-1">manager_id</code> on remaining grapes plots.
        </div>
      )}

      {loading ? (
        <EmptyState loading message="Loading managers…" />
      ) : visible.length === 0 ? (
        <EmptyState message={cards.length === 0 ? "No managers or plots found for your industry." : "No manager matches your search."} />
      ) : (
        <div className="grid max-h-[calc(100vh-340px)] grid-cols-1 gap-4 overflow-y-auto p-0.5 sm:grid-cols-2 xl:grid-cols-4">
          {visible.map((c, i) => (
            <UnitCard key={c.key} card={c} index={i} industryName={industryName} totalFarmers={totalFarmers} onOpen={onOpen} />
          ))}
        </div>
      )}

      <ModulesCard onMenuClick={onMenuClick} />
    </div>
  );
};

export default OwnerUnitLanding;
