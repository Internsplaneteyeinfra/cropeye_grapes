import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CloudSun,
  Droplets,
  FileCheck2,
  Grape,
  Layers,
  Loader2,
  MapPin,
  Map as MapIcon,
  Route,
  ScanLine,
  Sprout,
  Sun,
  Tractor,
  Users,
  UserCheck,
  Warehouse,
  Wheat,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOwnerPortfolio } from "../../hooks/useOwnerPortfolio";
import { useOwnerPlotInsights } from "../../hooks/useOwnerPlotInsights";
import { moistureBandForCrop } from "../../utils/soilMoistureApi";
import {
  dominantState,
  groupPlots,
  plotArea,
  plotBoundary,
  plotCenter,
  displayOwnerManagerName,
  summarizePlots,
  UNASSIGNED_MANAGER,
  type OwnerPlotRecord,
} from "../../utils/ownerPortfolio";
import OwnerPortfolioMap, { type MapColorMode } from "./OwnerPortfolioMap";
import LightIntensityCard from "../LightIntensityCard";
import OwnerUnitLanding from "./OwnerUnitLanding";
import OwnerAgroclimate from "./OwnerAgroclimate";
import OwnerAlertsPanel from "./OwnerAlertsPanel";
import OwnerCanopyPanel, {
  deriveWaterInsight,
  indexReading,
  WaterInsightMessage,
} from "./OwnerCanopyPanel";
import { activeFarmerStats } from "../../utils/ownerActivity";
import { pruningOverview, type PlotPruningDates } from "../../utils/pruningOverview";
import OwnerPruningOverview from "./OwnerPruningOverview";
import OwnerScopePerformance from "./OwnerScopePerformance";
import OwnerFarmerTable from "./OwnerFarmerTable";
import { useOwnerScopeHealth } from "../../hooks/useOwnerScopeHealth";
import { useGrapesStage } from "../../hooks/useGrapesStage";
import { useOwnerSeasonStages } from "../../hooks/useOwnerSeasonStages";
import { SATELLITE_STALE_DAYS } from "../../utils/dataAvailability";
import { buildPlotAlerts, buildScopeAlerts } from "../../utils/ownerAlerts";
import OwnerScopeSelector, {
  SCOPE_ALL,
  TALUKA_NOT_SET,
  areaOptions,
  plotAreaBucket,
  plotFarmerKey,
  plotTaluka,
  plotVariety,
  scopeOptions,
} from "./OwnerScopeSelector";
import {
  Card,
  DashHero,
  EmptyState,
  OD_KPI,
  OD_THEME,
  OD_TILE,
  SectionHeader,
  Stat,
  fmt,
  fmtInt,
  statusColor,
} from "./ownerDashboardUi";
import OwnerLocationDistancePanel from "./OwnerLocationDistancePanel";
import CertificationTimeline from "./CertificationTimeline";
import RegistrationOcrPanel from "./RegistrationOcrPanel";
import { loadOwnerStorageLocation } from "../../utils/ownerLocationDistance";

type Props = {
  onMenuClick: (menuTitle: string) => void;
};

const ALL = SCOPE_ALL;

const OwnerFarmDash = lazy(() => import("../OwnerFarmDash"));

/** Histogram bins spanning the Brix values actually reported (max 8 bins). */
function brixBins(values: number[]): { label: string; min: number; max: number }[] {
  if (values.length === 0) return [];
  const lo = Math.floor(Math.min(...values));
  const hi = Math.floor(Math.max(...values)) + 1;
  const width = Math.max(1, Math.ceil((hi - lo) / 8));
  const bins: { label: string; min: number; max: number }[] = [];
  for (let start = lo; start < hi; start += width) {
    const end = start + width;
    bins.push({ label: width === 1 ? `${start}°` : `${start}–${end}°`, min: start, max: end });
  }
  return bins;
}

const STAGE_COLORS = ["#16a34a", "#f59e0b", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#ef4444", "#84cc16"];

const PH_BANDS: { label: string; min: number; max: number; color: string }[] = [
  { label: "Acidic (< 6.5)", min: -Infinity, max: 6.5, color: "#f59e0b" },
  { label: "Optimal (6.5–7.5)", min: 6.5, max: 7.5, color: "#16a34a" },
  { label: "Alkaline (> 7.5)", min: 7.5, max: Infinity, color: "#6366f1" },
];

const ScopeMetricStat: React.FC<{ label: string; value: string; loading: boolean }> = ({
  label,
  value,
  loading,
}) => (
  <div className={`${OD_TILE} min-w-0 px-3 py-2`}>
    <p className="truncate text-[11px] uppercase tracking-wide text-[#5b7468]">{label}</p>
    <p className="truncate text-sm font-semibold tabular-nums text-slate-900">
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : value}
    </p>
  </div>
);

function averageCenter(plots: OwnerPlotRecord[]): [number, number] | null {
  const centers = plots.map(plotCenter).filter((c): c is [number, number] => c != null);
  if (centers.length === 0) return null;
  const lat = centers.reduce((s, c) => s + c[0], 0) / centers.length;
  const lng = centers.reduce((s, c) => s + c[1], 0) / centers.length;
  return [lat, lng];
}

const OwnerIntelligenceDashboard: React.FC<Props> = ({ onMenuClick }) => {
  const portfolio = useOwnerPortfolio();
  const { plots, loading, error, agroState } = portfolio;
  const agroLoading = agroState === "loading";

  const [unitKey, setUnitKey] = useState<string | null>(null);
  const [district, setDistrict] = useState<string>(ALL);
  const [taluka, setTaluka] = useState<string>(ALL);
  const [farmer, setFarmer] = useState<string>(ALL);
  const [extraFilters, setExtraFilters] = useState(false);
  const [variety, setVariety] = useState<string>(ALL);
  const [areaBucket, setAreaBucket] = useState<string>(ALL);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const locationScopeReady = district !== ALL && taluka !== ALL;
  const overviewLoading = loading || agroLoading || !locationScopeReady;
  const [colorMode, setColorMode] = useState<MapColorMode>("stage");
  const [visibleIndexLines, setVisibleIndexLines] = useState({
    growth: true,
    stress: true,
    water: true,
    moisture: true,
  });
  const [storageDistanceOpen, setStorageDistanceOpen] = useState(false);
  const [certificationTimelineOpen, setCertificationTimelineOpen] = useState(false);
  const [registrationToolsOpen, setRegistrationToolsOpen] = useState(false);
  const [storagePinSaved, setStoragePinSaved] = useState(
    () => !!loadOwnerStorageLocation().storage,
  );
  const unitPlots = useMemo(
    () => (unitKey ? plots.filter((p) => p.managerId === unitKey) : plots),
    [plots, unitKey],
  );
  const unit = useMemo(() => portfolio.units.find((u) => u.key === unitKey) ?? null, [portfolio.units, unitKey]);
  const unitName = displayOwnerManagerName(
    unit?.name ??
      (unitKey === UNASSIGNED_MANAGER
        ? "Plots not linked to a manager"
        : unitPlots[0]?.managerName ?? "Farm unit"),
  );

  useEffect(() => {
    setDistrict(ALL);
    setTaluka(ALL);
    setFarmer(ALL);
    setVariety(ALL);
    setAreaBucket(ALL);
    setSelectedKey(null);
    if (unitKey) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [unitKey]);

  const stateName = useMemo(() => dominantState(unitPlots), [unitPlots]);
  const overall = useMemo(() => summarizePlots(unitPlots), [unitPlots]);

  const districts = useMemo(
    () => groupPlots(unitPlots, (p) => p.district).sort((a, b) => b.summary.plots - a.summary.plots),
    [unitPlots],
  );

  const byDistrict = useMemo(
    () => (district === ALL ? unitPlots : unitPlots.filter((p) => p.district === district)),
    [unitPlots, district],
  );
  const byTaluka = useMemo(
    () => (taluka === ALL ? byDistrict : byDistrict.filter((p) => plotTaluka(p) === taluka)),
    [byDistrict, taluka],
  );
  const byVariety = useMemo(
    () => (variety === ALL ? byTaluka : byTaluka.filter((p) => plotVariety(p) === variety)),
    [byTaluka, variety],
  );
  const byArea = useMemo(
    () => (areaBucket === ALL ? byVariety : byVariety.filter((p) => plotAreaBucket(p) === areaBucket)),
    [byVariety, areaBucket],
  );
  const filtered = useMemo(
    () => (farmer === ALL ? byArea : byArea.filter((p) => plotFarmerKey(p) === farmer)),
    [byArea, farmer],
  );
  const districtOptions = useMemo(() => scopeOptions(unitPlots, (p) => p.district), [unitPlots]);
  const talukaOptions = useMemo(() => scopeOptions(byDistrict, plotTaluka), [byDistrict]);
  const varietyOptions = useMemo(() => scopeOptions(byTaluka, plotVariety), [byTaluka]);
  const areaBucketOptions = useMemo(() => areaOptions(byVariety), [byVariety]);
  const farmerOptions = useMemo(
    () => scopeOptions(byArea, plotFarmerKey, (p) => p.farmerName),
    [byArea],
  );

  const changeVariety = (v: string) => {
    setVariety(v);
    setAreaBucket(ALL);
    setFarmer(ALL);
  };
  const changeAreaBucket = (v: string) => {
    setAreaBucket(v);
    setFarmer(ALL);
  };
  const toggleExtraFilters = () => {
    if (extraFilters) {
      setVariety(ALL);
      setAreaBucket(ALL);
    }
    setExtraFilters(!extraFilters);
  };
  const farmerLabel = farmerOptions.find((f) => f.key === farmer)?.label;

  const changeDistrict = (v: string) => {
    setDistrict(v);
    setTaluka(ALL);
    setVariety(ALL);
    setAreaBucket(ALL);
    setFarmer(ALL);
  };
  const changeTaluka = (v: string) => {
    setTaluka(v);
    setVariety(ALL);
    setAreaBucket(ALL);
    setFarmer(ALL);
  };

  const summary = useMemo(() => summarizePlots(filtered), [filtered]);
  const scopeLabel =
    farmer !== ALL && farmerLabel
      ? farmerLabel
      : taluka !== ALL
        ? taluka
        : district !== ALL
          ? district
          : unitName;

  const scopeFarmers = useMemo(() => {
    // Variety and area describe plots, so farmers without plots can't match those filters.
    if (variety !== ALL || areaBucket !== ALL) return [];
    return portfolio.farmers.filter(
      (f) =>
        (!unitKey || f.managerId === unitKey) &&
        (district === ALL || f.district === district) &&
        (taluka === ALL || (f.taluka || TALUKA_NOT_SET) === taluka) &&
        (farmer === ALL || f.key === farmer),
    );
  }, [portfolio.farmers, unitKey, district, taluka, farmer, variety, areaBucket]);

  // Plot drill-down only after District → Taluka → Farmer are chosen (not on "All").
  const selectionReady = locationScopeReady && farmer !== ALL;

  useEffect(() => {
    if (!selectionReady || filtered.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey && filtered.some((p) => p.key === selectedKey)) return;
    const ranked = [...filtered].sort(
      (a, b) => (b.agro?.yieldTPerAcre ?? -1) - (a.agro?.yieldTPerAcre ?? -1),
    );
    setSelectedKey(ranked[0].key);
  }, [filtered, selectedKey, selectionReady]);

  const selectedPlot = useMemo(
    () =>
      selectionReady
        ? filtered.find((p) => p.key === selectedKey) ?? null
        : null,
    [filtered, selectedKey, selectionReady],
  );
  const selectedFarmerPhone = useMemo(() => {
    if (!selectionReady || !selectedPlot) return null;
    const fromPlot = selectedPlot.farmerPhone?.trim();
    if (fromPlot) return fromPlot;
    const key = plotFarmerKey(selectedPlot);
    return (
      scopeFarmers.find((f) => f.key === key)?.phone?.trim() ||
      portfolio.farmers.find((f) => f.key === key)?.phone?.trim() ||
      null
    );
  }, [selectionReady, selectedPlot, scopeFarmers, portfolio.farmers]);
  const selectedFarmerFarmIds = useMemo(() => {
    if (!selectionReady || !selectedPlot) return [] as number[];
    const key = plotFarmerKey(selectedPlot);
    const ids = filtered
      .filter((p) => plotFarmerKey(p) === key)
      .map((p) => p.farmId)
      .filter((id): id is number => id != null && id > 0);
    return [...new Set(ids)];
  }, [selectionReady, selectedPlot, filtered]);
  const farmDashPlot = useMemo(
    () =>
      selectedPlot?.plotId
        ? {
            plotId: selectedPlot.plotId,
            boundary: plotBoundary(selectedPlot),
            areaAcres: plotArea(selectedPlot) || null,
            farmerName: selectedPlot.farmerName,
            cropType: selectedPlot.cropType,
            variety: selectedPlot.variety,
        }
        : null,
    [selectedPlot],
  );
  const insights = useOwnerPlotInsights(selectedPlot?.plotId || null, {
    plantationDate: selectedPlot?.plantationDate ?? selectedPlot?.agro?.plantationDate ?? null,
    center: selectedPlot ? plotCenter(selectedPlot) : null,
  });

  const statusData = useMemo(
    () =>
      Object.entries(summary.statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({ name, value, fill: statusColor(name, i) })),
    [summary],
  );

  const yieldBreakdown = useMemo(() => {
    const groups =
      district === ALL
        ? groupPlots(filtered, (p) => p.district)
        : groupPlots(filtered, (p) => p.taluka || p.village || p.district);
    return groups
      .filter((g) => g.summary.avgYield != null)
      .sort((a, b) => (b.summary.avgYield ?? 0) - (a.summary.avgYield ?? 0))
      .slice(0, 12)
      .map((g) => ({
        name: g.label,
        yield: Number((g.summary.avgYield ?? 0).toFixed(2)),
        production: Number((g.summary.estProductionT ?? 0).toFixed(1)),
      }));
  }, [filtered, district]);

  const brixHistogram = useMemo(() => {
    const values = filtered
      .map((p) => p.agro?.brix)
      .filter((v): v is number => v != null && Number.isFinite(v));
    return brixBins(values).map((bin) => ({
      name: bin.label,
      plots: values.filter((v) => v >= bin.min && v < bin.max).length,
    }));
  }, [filtered]);

  const topPlots = useMemo(
    () =>
      filtered
        .filter((p) => p.agro?.yieldTPerAcre != null)
        .sort((a, b) => (b.agro!.yieldTPerAcre ?? 0) - (a.agro!.yieldTPerAcre ?? 0))
        .slice(0, 6),
    [filtered],
  );

  const phData = useMemo(
    () =>
      PH_BANDS.map((band) => ({
        name: band.label,
        value: filtered.filter(
          (p) => p.agro?.soilPH != null && p.agro.soilPH >= band.min && p.agro.soilPH < band.max,
        ).length,
        fill: band.color,
      })).filter((d) => d.value > 0),
    [filtered],
  );

  const soilByGroup = useMemo(
    () =>
      (district === ALL
        ? groupPlots(filtered, (p) => p.district)
        : groupPlots(filtered, (p) => p.taluka || p.village || p.district)
      )
        .filter((g) => g.summary.avgSoilPH != null || g.summary.avgOrganicCarbon != null)
        .sort((a, b) => b.summary.plots - a.summary.plots)
        .slice(0, 8),
    [filtered, district],
  );

  const weatherLocation = useMemo(
    () =>
      (selectedPlot && (district !== ALL || farmer !== ALL) ? plotCenter(selectedPlot) : null) ??
      averageCenter(filtered),
    [filtered, selectedPlot, district, farmer],
  );

  const indexSeries = useMemo(
    () => (insights.indices.data ?? []).slice(-24),
    [insights.indices.data],
  );
  const band = moistureBandForCrop("grapes");
  const moisture = insights.moisture.data;
  const ndmiReading = useMemo(
    () => indexReading(insights.indices.data ?? [], "stress"),
    [insights.indices.data],
  );
  const waterInsight = deriveWaterInsight(
    moisture?.currentMoisture ?? null,
    ndmiReading?.latest ?? null,
    band,
  );
  const moistureSeries = useMemo(
    () =>
      (moisture?.stack ?? []).slice(-10).map((d) => ({
        day: d.day,
        moisture: Number(d.soil_moisture.toFixed(1)),
      })),
    [moisture],
  );
  const moistureState =
    moisture == null
      ? null
      : moisture.currentMoisture < band.minOptimal
        ? { label: "Below optimal — irrigation advised", tone: "text-amber-700" }
        : moisture.currentMoisture > band.maxOptimal
          ? { label: "Above optimal — risk of waterlogging", tone: "text-sky-700" }
          : { label: "Within optimal range", tone: "text-emerald-700" };

  const risk = insights.risk.data;
  const plotAlerts = useMemo(
    () =>
      selectedPlot
        ? buildPlotAlerts({
            plot: selectedPlot,
            scopePlots: filtered,
            indices: insights.indices.data,
            moisture,
            band,
            risk,
          })
        : [],
    [selectedPlot, filtered, insights.indices.data, moisture, band, risk],
  );
  const scopeAlerts = useMemo(() => buildScopeAlerts(filtered), [filtered]);
  const scopeHealth = useOwnerScopeHealth(filtered, { key: selectedKey, risk }, unitPlots);
  const scopeMetricStats = useMemo(() => {
    const spread = (values: (number | null | undefined)[]) => {
      const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
      return {
        average: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
        min: valid.length ? Math.min(...valid) : null,
        max: valid.length ? Math.max(...valid) : null,
      };
    };
    return {
      brix: spread(filtered.map((plot) => plot.agro?.brix)),
      recovery: spread(filtered.map((plot) => plot.agro?.recovery)),
      biomass: spread(filtered.map((plot) => plot.agro?.biomass)),
      plotsWithAlerts: filtered.filter((plot) => {
        const status = scopeHealth.health.get(plot.key)?.status;
        return status === "Immediate action" || status === "Stressed";
      }).length,
    };
  }, [filtered, scopeHealth.health]);
  const selectedStage = useGrapesStage(selectedPlot?.plotId || null);
  const seasonStages = useOwnerSeasonStages(useMemo(() => unitPlots.map((p) => p.plotId), [unitPlots]));
  const farmerActivity = useMemo(() => {
    const foundation = new Map<string, boolean | null>();
    unitPlots.forEach((p) => {
      const stage = seasonStages.stages.get(p.plotId);
      if (stage) foundation.set(p.plotId, stage.foundationPruningDone);
      else if (seasonStages.failed.has(p.plotId)) foundation.set(p.plotId, null);
    });
    const stats = activeFarmerStats(unitPlots, plotFarmerKey, scopeHealth.satelliteDates, foundation);
    // Once stage + health loads finish (or time out), stop the "Checking…" state.
    if (!seasonStages.loading && !scopeHealth.loading) {
      return { ...stats, pendingFarmers: 0 };
    }
    return stats;
  }, [
    unitPlots,
    scopeHealth.satelliteDates,
    scopeHealth.loading,
    seasonStages.stages,
    seasonStages.failed,
    seasonStages.loading,
  ]);
  const pruning = useMemo(() => {
    const dates = new Map<string, PlotPruningDates>();
    seasonStages.stages.forEach((s, id) =>
      dates.set(id, { foundation: s.savedFoundationPruningDate, fruit: s.savedFruitPruningDate }),
    );
    return pruningOverview(filtered, plotFarmerKey, dates, seasonStages.failed);
  }, [filtered, seasonStages.stages, seasonStages.failed]);
  /** Backend crop status when any plot reports one; otherwise each plot's current stage from /grapes/stages. */
  const cropChart = useMemo(() => {
    if (statusData.some((d) => d.name !== "Not reported")) return { source: "status" as const, data: statusData };
    const counts = new Map<string, number>();
    filtered.forEach((p) => {
      const s = seasonStages.stages.get(p.plotId);
      const name = s
        ? s.stageName ?? "No stage"
        : seasonStages.failed.has(p.plotId)
          ? "Schedule unavailable"
          : "Loading…";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    let i = 0;
    const data = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        fill: ["Loading…", "Schedule unavailable", "No stage"].includes(name)
          ? "#cbd5e1"
          : STAGE_COLORS[i++ % STAGE_COLORS.length],
      }));
    return { source: "stage" as const, data };
  }, [statusData, filtered, seasonStages.stages, seasonStages.failed]);
  if (!unitKey) {
    return (
      <OwnerUnitLanding
        industryName={portfolio.industryName}
        units={portfolio.units}
        plots={plots}
        loading={loading}
        agroLoading={agroLoading}
        managerCount={portfolio.managerCount}
        fieldOfficerCount={portfolio.fieldOfficerCount}
        farmerCount={portfolio.farmerCount}
        backendCounts={portfolio.backendCounts}
        onOpen={setUnitKey}
        onMenuClick={onMenuClick}
      />
    );
  }

  if (certificationTimelineOpen) {
    return (
      <CertificationTimeline
        isOpen
        onClose={() => setCertificationTimelineOpen(false)}
        selectedPlot={selectedPlot}
        plots={filtered}
        onSelectPlot={setSelectedKey}
        syncBackendCertification
      />
    );
  }

  return (
    <div className={`${OD_THEME} mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-10`}>
      {/* Overview */}
      <DashHero className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => setUnitKey(null)}
              aria-label="Back to farm units"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 transition hover:bg-white/25"
              style={{ minHeight: 0, padding: 0 }}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                <Grape className="h-4 w-4" /> Owner overview · Unit view
              </p>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight sm:text-2xl">{unitName}</h1>
              <p className="mt-1 text-xs text-emerald-50/90">
                {[portfolio.industryName, unitName, unit?.phone, stateName].filter(Boolean).join(" · ")}
                {" · "}
                {fmtInt(districts.length)} district{districts.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setStorageDistanceOpen(true)}
              title="Set court/storage location and calculate road distance to a plot"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25"
              style={{ minHeight: 0 }}
            >
              <Warehouse className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Court / storage → plot</span>
              <span className="sm:hidden">Storage distance</span>
              <Route className="h-4 w-4 shrink-0 opacity-80" />
            </button>
            <button
              type="button"
              onClick={() => setRegistrationToolsOpen(true)}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 hover:border-white/60 hover:bg-white/25 hover:shadow-md active:scale-[0.98] active:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-800"
            >
              <FileCheck2 className="h-4 w-4 shrink-0" />
              Registration
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[
            { label: "Field officers", value: "0", icon: <Users className="h-3.5 w-3.5" /> },
            { label: "Farmers", value: fmtInt(Math.max(unit?.farmers ?? 0, overall.farmers)), icon: <Tractor className="h-3.5 w-3.5" /> },
            { label: "Plots", value: fmtInt(overall.plots), icon: <MapPin className="h-3.5 w-3.5" /> },
            { label: "Area", value: fmt(overall.areaAcres, 1, " ac"), icon: <Layers className="h-4.5 w-4.5" /> },
            { label: "Ready to harvest", value: fmtInt(overall.readyToHarvest), icon: <Sprout className="h-4 w4.5" />, agro: true },
          ].map((k) => (
            <div key={k.label} className={`${OD_KPI} min-w-0 px-2.5 py-2`}>
              <p className="flex items-center gap-1.5 truncate text-xs font-medium uppercase tracking-wide text-emerald-100">
                {k.icon} {k.label}
              </p>
              <p className="mt-0.5 truncate text-xl font-bold tabular-nums leading-snug sm:text-2xl">
                {loading || (k.agro && agroLoading) ? "…" : k.value}
              </p>
            </div>
          ))}
          <div
            className={`${OD_KPI} col-span-2 min-w-0 px-2.5 py-2`}
            title={`Active = at least one plot with a satellite reading in the last ${SATELLITE_STALE_DAYS} days. Foundation pruning = saved foundation pruning date has arrived.`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-medium uppercase tracking-wide text-emerald-100">
                  <UserCheck className="h-3.5 w-3.5" /> Active farmers
                </p>
                <p className="mt-1.5 truncate text-xl font-bold tabular-nums leading-snug sm:text-2xl">
                  {loading ? "…" : fmtInt(farmerActivity.activeFarmers)}
                  <span className="ml-1 text-xs font-medium text-emerald-100">
                    of {fmtInt(farmerActivity.totalFarmers)}
                  </span>
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-emerald-100">Foundation pruning</p>
                <p className="mt-0.5 truncate text-xl font-bold tabular-nums leading-snug sm:text-2xl">
                  {loading ? "…" : fmtInt(farmerActivity.foundationDone)}
                  <span className="ml-1 text-xs font-medium text-emerald-100">
                    {farmerActivity.foundationPct != null ? `· ${Math.round(farmerActivity.foundationPct)}%` : ""}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
              <div
                className="h-full rounded-full bg-lime-300 transition-all"
                style={{ width: `${farmerActivity.foundationPct ?? 0}%` }}
              />
            </div>
            <p className="mt-1 truncate text-[10px] text-emerald-100/90">
              {loading
                ? "Loading farmers…"
                : farmerActivity.pendingFarmers > 0
                  ? `Checking ${farmerActivity.pendingFarmers} farmer${farmerActivity.pendingFarmers === 1 ? "" : "s"}…`
                  : farmerActivity.activeFarmers === 0
                    ? `No farmer has a satellite reading in the last ${SATELLITE_STALE_DAYS} days`
                    : `of active farmers have done foundation pruning`}
            </p>
          </div>
        </div>
        {agroState === "unavailable" && !loading && (
          <p className="mt-3 text-xs text-amber-100">
            Satellite yield, Brix and soil statistics are currently unavailable; hierarchy and area figures are shown.
          </p>
        )}
      </DashHero>

      {registrationToolsOpen && (
        <div
          className="fixed inset-0 z-[999900] h-dvh overflow-y-auto bg-white"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRegistrationToolsOpen(false);
          }}
        >
          <section
            id="owner-registration-tools"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-registration-title"
            className="flex min-h-full w-full flex-col bg-white p-4 sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <FileCheck2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="owner-registration-title" className="text-lg font-semibold text-slate-900">
                    Registration
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Upload a registration form or review details for the selected plot.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close registration"
                onClick={() => setRegistrationToolsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-h-[320px] rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-5">
                <div className="mb-3 flex items-start gap-2">
                  <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Upload &amp; Scan</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Scan a grape registration / GrapeNet form in your browser. Soil lab PDFs
                      should be uploaded under Water &amp; soil after selecting a farmer.
                    </p>
                  </div>
                </div>
                <RegistrationOcrPanel compact alwaysOpen />
              </div>

              <div className="min-h-[320px] rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 sm:p-5">
                <div className="mb-3 flex items-start gap-2">
                  <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Review Registration</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Open certification / registration for the selected plot.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationToolsOpen(false);
                    setCertificationTimelineOpen(true);
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 sm:w-auto"
                >
                  <FileCheck2 className="h-4 w-4" />
                  Open Review Registration
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setRegistrationToolsOpen(false)}
                className="inline-flex min-h-10 min-w-28 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <OwnerScopeSelector
        unitName={unitName}
        scopeLabel={scopeLabel}
        districts={districtOptions}
        talukas={talukaOptions}
        farmers={farmerOptions}
        plots={filtered}
        district={district}
        taluka={taluka}
        farmer={farmer}
        selectedKey={selectedKey}
        onDistrict={changeDistrict}
        onTaluka={changeTaluka}
        onFarmer={setFarmer}
        onPlot={setSelectedKey}
        extraFilters={extraFilters}
        onToggleExtra={toggleExtraFilters}
        varieties={varietyOptions}
        areas={areaBucketOptions}
        variety={variety}
        area={areaBucket}
        onVariety={changeVariety}
        onArea={changeAreaBucket}
      />

      <Card>
        <SectionHeader
          icon={<Layers className="h-5 w-5" />}
          title={
            farmDashPlot
              ? `Plot overview · ${selectedPlot?.plotLabel ?? ""}`
              : `Portfolio overview · ${scopeLabel}`
          }
          subtitle={
            farmDashPlot
              ? `${selectedPlot?.farmerName ?? ""} · area, crop stage, ripening, Brix, yield and stress for the selected plot.`
              : `${fmtInt(summary.plots)} plots across ${fmtInt(summary.farmers)} farmers in this selection.`
          }
        />
        {farmDashPlot ? (
          <Suspense fallback={<EmptyState loading message="Loading plot overview…" />}>
            <OwnerFarmDash embedded={farmDashPlot} />
          </Suspense>
        ) : loading && summary.plots === 0 ? (
          <EmptyState loading message="Loading portfolio overview…" />
        ) : unitPlots.length === 0 ? (
          <EmptyState message="No plots linked under this manager yet. Soft-refresh after FO hydrate, or confirm grapes plots have field_officer_id / manager_id in the backend." />
        ) : summary.plots === 0 ? (
          <EmptyState message="No plots in this selection. Pick a district and taluka that list counts above 0." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className={`${OD_TILE} flex min-h-[190px] flex-col p-4`}>
                <p className="text-xs font-semibold uppercase text-slate-500">Field Area</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {overviewLoading ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <>{fmt(summary.areaAcres, 1)} <span className="text-sm font-semibold text-emerald-700">acres</span></>}
                </p>
                <p className="mt-auto pt-4 text-sm text-slate-600">
                  {overviewLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <>{fmtInt(summary.plots)} plots · {fmtInt(summary.farmers)} farmers</>}
                </p>
              </div>

              <div className={`${OD_TILE} min-h-[190px] p-4`}>
                <p className="text-xs font-semibold uppercase text-slate-500">Crop Stage</p>
                <div className="mt-3 space-y-2">
                  {overviewLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : cropChart.data.length ? cropChart.data.slice(0, 4).map((stage) => (
                    <div key={stage.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{stage.name}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{fmtInt(stage.value)}</span>
                    </div>
                  )) : <p className="text-sm text-slate-500">No crop stage data</p>}
                </div>
              </div>

              <div className={`${OD_TILE} min-h-[190px] bg-[#f7fbe9] p-4`}>
                <p className="text-xs font-semibold uppercase text-slate-500">Ripening / Harvest</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Ready to harvest</span>
                    <span className="font-bold tabular-nums text-emerald-700">{overviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : fmtInt(summary.readyToHarvest)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Harvested</span>
                    <span className="font-bold tabular-nums text-slate-900">{overviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : fmtInt(summary.harvested)}</span>
                  </div>
                </div>
              </div>

              <div className={`${OD_TILE} min-h-[190px] p-4`}>
                <p className="text-xs font-semibold uppercase text-slate-500">Sugar Content</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {overviewLoading ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <>{scopeMetricStats.brix.average == null ? "—" : fmt(scopeMetricStats.brix.average, 1)}<span className="ml-1 text-sm font-semibold text-emerald-700">°Brix avg</span></>}
                </p>
                <div className="mt-auto flex justify-between pt-5 text-xs text-slate-500">
                  {overviewLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <><span>Min {scopeMetricStats.brix.min == null ? "—" : fmt(scopeMetricStats.brix.min, 1)}</span><span>Max {scopeMetricStats.brix.max == null ? "—" : fmt(scopeMetricStats.brix.max, 1)}</span></>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {overviewLoading ? (
                <div className={`${OD_TILE} p-4`}>
                  <div className="mb-2 flex items-center justify-between">
                    <Sun className="h-7 w-7 text-amber-500" />
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600">Light Intensity</p>
                </div>
              ) : <LightIntensityCard location={weatherLocation} />}
              <ScopeMetricStat
                label="Avg Recovery"
                value={scopeMetricStats.recovery.average == null ? "—" : `${fmt(scopeMetricStats.recovery.average, 1)}%`}
                loading={overviewLoading}
              />
              <ScopeMetricStat
                label="Expected Yield"
                value={summary.avgYield == null ? "—" : `${fmt(summary.avgYield, 1)} T/acre`}
                loading={overviewLoading}
              />
              <ScopeMetricStat
                label="Average Soil pH"
                value={summary.avgSoilPH == null ? "—" : fmt(summary.avgSoilPH, 1)}
                loading={overviewLoading}
              />
              <ScopeMetricStat label="Plots with alerts" value={`${fmtInt(scopeMetricStats.plotsWithAlerts)} / ${fmtInt(summary.plots)}`} loading={overviewLoading} />
              <ScopeMetricStat
                label="Avg Biomass"
                value={scopeMetricStats.biomass.average == null ? "—" : `${fmt(scopeMetricStats.biomass.average, 1)} T/acre`}
                loading={overviewLoading}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Map + category totals */}
        <Card className="flex flex-col">
          <SectionHeader
            icon={<MapIcon className="h-5 w-5" />}
            title={`Plot map · ${scopeLabel}`}
            subtitle={`${fmtInt(summary.farmers)} farmers · ${fmtInt(
              filtered.filter((p) => plotCenter(p) != null).length,
            )} of ${fmtInt(filtered.length)} plots located · click a plot to drill in, or a legend item to highlight`}
            action={
              <button
                type="button"
                onClick={() => setStorageDistanceOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                style={{ minHeight: 0 }}
                title="Court / storage pin → road distance to selected plot"
              >
                <Warehouse className="h-3.5 w-3.5" />
                {storagePinSaved ? "Storage → plot distance" : "Set storage & distance"}
              </button>
            }
          />
          <div className="relative min-h-[420px] flex-1 lg:min-h-[520px]">
            {filtered.length === 0 && loading ? (
              <EmptyState loading message="Loading plot boundaries…" />
            ) : (
              <OwnerPortfolioMap
                plots={filtered}
                selectedKey={selectionReady ? selectedKey : null}
                onSelect={(key) => {
                  if (!selectionReady) return;
                  setSelectedKey(key);
                }}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
                stages={seasonStages.stages}
                stagesFailed={seasonStages.failed}
              />
            )}
          </div>
        </Card>

      <OwnerScopePerformance
        plots={filtered}
        scopeLabel={scopeLabel}
        selectedPlot={selectedPlot}
        loading={loading || agroLoading}
      />

      <OwnerAlertsPanel
        plotLabel={selectedPlot?.plotLabel ?? null}
        scopeLabel={scopeLabel}
        plotAlerts={plotAlerts}
        scopeAlerts={scopeAlerts}
        loading={insights.indices.loading || insights.moisture.loading || insights.risk.loading}
        aside={
          <OwnerCanopyPanel
            plotId={selectedPlot?.plotId || null}
            plotLabel={selectedPlot?.plotLabel ?? null}
            indices={insights.indices}
            moisture={insights.moisture}
            band={band}
            stageName={selectedStage.stageName}
            daysAfterFruitPruning={selectedStage.daysAfterFruitPruning}
          />
        }
        asideWide={
          selectedPlot && waterInsight ? (
            <WaterInsightMessage insight={waterInsight} />
          ) : null
        }
      />

      {/* 3. Crop health */}
      <Card>
        <SectionHeader
          step={1}
          icon={<Sprout className="h-5 w-5" />}
          title="Crop health"
          subtitle="Crop status across the selection, and the vegetation index trend of the selected plot."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {cropChart.source === "status" ? "Crop status" : "Crop stage"} · {scopeLabel}
            </p>
            {cropChart.data.length === 0 ? (
              <EmptyState loading={loading} message="No crop status reported yet." />
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="relative h-[200px] w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cropChart.data}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={cropChart.data.length > 1 ? 2 : 0}
                        stroke="#fff"
                      >
                        {cropChart.data.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v} plot${v === 1 ? "" : "s"}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold tabular-nums text-slate-900">
                      {cropChart.data.reduce((s, d) => s + d.value, 0)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">plots</span>
                  </div>
                </div>
                <ul className="w-full space-y-1.5 text-sm sm:w-1/2">
                  {cropChart.source === "stage" && (
                    <li className="text-[11px] leading-snug text-slate-400">
                      Crop status is not reported by the backend yet, so plots are grouped by current crop stage.
                    </li>
                  )}
                  {cropChart.data.map((d) => (
                    <li key={d.name} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 truncate text-slate-700">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.fill }} />
                        {d.name}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="lg:col-span-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vegetation indices · {selectedPlot?.plotLabel ?? "no plot selected"}
            </p>
            {insights.indices.loading ? (
              <EmptyState loading message="Loading NDVI / NDMI / NDWI / NDRE history…" />
            ) : indexSeries.length === 0 ? (
              <EmptyState message={insights.indices.error ?? "Select a plot to see its vegetation trend."} />
            ) : (
              <>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={indexSeries} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} domain={[-0.2, 1]} />
                      <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(3) : v)} />
                      <Legend
                        wrapperStyle={{ fontSize: 12 }}
                        content={({ payload = [] }) => (
                          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-3 text-xs">
                            {payload.map((item) => {
                              const key = String(item.dataKey ?? "");
                              if (!(key in visibleIndexLines)) return null;
                              const visible =
                                visibleIndexLines[key as keyof typeof visibleIndexLines];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  aria-pressed={visible}
                                  onClick={() =>
                                    setVisibleIndexLines((current) => ({
                                      ...current,
                                      [key]: !current[key as keyof typeof current],
                                    }))
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                     visible ? "" : "opacity-40 line-through"
                                  }`}
                                  style={{ color: String(item.color ?? "#475569") }}
                                >
                                  <span
                                    className="h-0.5 w-3"
                                    style={{ backgroundColor: String(item.color ?? "#475569") }}
                                    aria-hidden="true"
                                  />
                                  {item.value}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      />
                      <Line dataKey="growth" name="NDVI (growth)" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls hide={!visibleIndexLines.growth} />
                      <Line dataKey="stress" name="NDMI (soil moisture)" stroke="#0284c7" strokeWidth={2} dot={false} connectNulls hide={!visibleIndexLines.stress} />
                      <Line dataKey="water" name="NDWI (water)" stroke="#0891b2" strokeWidth={2} dot={false} connectNulls hide={!visibleIndexLines.water} />
                      <Line dataKey="moisture" name="NDRE (leaf quality)" stroke="#a855f7" strokeWidth={1.5} dot={false} connectNulls hide={!visibleIndexLines.moisture} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <OwnerPruningOverview overview={pruning} scopeLabel={scopeLabel} />

      {/* 4. Yield */}
      <Card>
        <SectionHeader
          step={2}
          icon={<Wheat className="h-5 w-5" />}
          title="Yield & quality"
          subtitle={`Satellite yield forecast and Brix distribution for ${scopeLabel}.`}
        />
        {summary.plotsWithAgro === 0 ? (
          <EmptyState
            loading={agroLoading}
            message={
              agroLoading
                ? "Loading satellite yield and Brix statistics…"
                : "No satellite yield or Brix statistics for plots in this selection."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Avg yield by {district === ALL ? "district" : "taluka"} (T/acre)
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yieldBreakdown} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="yield" name="Yield (T/acre)" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brix distribution (plots)</p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brixHistogram} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="plots" name="Plots" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Top plots by yield</p>
              <ul className="divide-y divide-slate-100">
                {topPlots.map((p, i) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(p.key)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50 ${
                        p.key === selectedKey ? "bg-emerald-50" : ""
                      }`}
                      style={{ minHeight: 0 }}
                    >
                      <span className="min-w-0">
                        <span className="mr-2 text-xs text-slate-400">{i + 1}</span>
                        <span className="truncate text-sm font-medium text-slate-900">{p.plotLabel}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {p.farmerName} · {p.district}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-emerald-700">
                          {fmt(p.agro?.yieldTPerAcre, 2)} T/ac
                        </span>
                        <span className="block text-xs tabular-nums text-slate-500">Brix {fmt(p.agro?.brix, 1)}°</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* 5. Water & soil */}
      <Card>
        <SectionHeader
          step={3}
          icon={<Droplets className="h-5 w-5" />}
          title="Water & soil"
          subtitle="Soil chemistry across the selection, and live soil moisture of the selected plot."
        />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-10">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Soil pH balance (plots)</p>
            {phData.length === 0 ? (
              <EmptyState
                loading={agroLoading}
                message={
                  agroLoading
                    ? "Loading soil statistics…"
                    : "Soil pH is not reported in the satellite soil data for these plots yet."
                }
              />
            ) : (
              <>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={phData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {phData.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Stat label="Avg soil pH" value={fmt(summary.avgSoilPH, 2)} />
                  <Stat label="Avg organic carbon" value={fmt(summary.avgOrganicCarbon, 2)} />
                </div>
              </>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Soil by {district === ALL ? "district" : "taluka"}
            </p>
            {soilByGroup.length === 0 ? (
              <EmptyState loading={agroLoading} message="Soil pH and organic carbon are not reported for these plots yet." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">Area</th>
                    <th className="py-2 text-right">Plots</th>
                    <th className="py-2 text-right">pH</th>
                    <th className="py-2 text-right">Org. C</th>
                  </tr>
                </thead>
                <tbody>
                  {soilByGroup.map((g) => (
                    <tr key={g.key} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-[140px] truncate py-2 text-slate-800">{g.label}</td>
                      <td className="py-2 text-right tabular-nums">{fmtInt(g.summary.plots)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(g.summary.avgSoilPH, 2)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(g.summary.avgOrganicCarbon, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="border-t border-slate-100 pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Soil moisture · {selectedPlot?.plotLabel ?? "no plot selected"}
            </p>
            {insights.moisture.loading ? (
              <EmptyState loading message="Loading soil moisture…" />
            ) : !moisture ? (
              <EmptyState message={insights.moisture.error ?? "Select a plot to see soil moisture."} />
            ) : (
              <>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-3xl font-bold tabular-nums text-sky-700">{fmt(moisture.currentMoisture, 1, "%")}</p>
                  <p className="text-xs text-slate-500">
                    Optimal {band.minOptimal}–{band.maxOptimal}%
                  </p>
                </div>
                {moistureState && <p className={`text-xs font-medium ${moistureState.tone}`}>{moistureState.label}</p>}
                <div className="mt-2 h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={moistureSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                      <ReferenceArea y1={band.minOptimal} y2={band.maxOptimal} fill="#bbf7d0" fillOpacity={0.5} />
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip />
                      <Line dataKey="moisture" name="Soil moisture (%)" stroke="#0284c7" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* 7. Agroclimate */}
      <Card>
        <SectionHeader
          step={4}
          icon={<CloudSun className="h-5 w-5" />}
          title="Agroclimate"
          subtitle={`Today's conditions, date-wise history and forecast for ${district === ALL ? `the centre of ${unitName}'s plots${stateName ? ` in ${stateName}` : ""}` : district}.`}
        />
        <OwnerAgroclimate location={weatherLocation} label={scopeLabel} />
      </Card>

      {/* All farmers in scope */}
      <Card>
        <OwnerFarmerTable
          plots={filtered}
          farmers={scopeFarmers}
          scopeLabel={scopeLabel}
          selectedKey={selectedKey}
          onSelectPlot={(key) => {
            setSelectedKey(key);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          loading={loading}
          agroLoading={agroLoading}
          health={scopeHealth.health}
          stages={seasonStages.stages}
          stagesFailed={seasonStages.failed}
        />
      </Card>

      <OwnerLocationDistancePanel
        isOpen={storageDistanceOpen}
        onClose={() => {
          setStorageDistanceOpen(false);
          setStoragePinSaved(!!loadOwnerStorageLocation().storage);
        }}
        plots={filtered}
        selectedPlotKey={selectionReady ? selectedKey : null}
        onSelectPlot={(key) => {
          setSelectedKey(key);
        }}
      />

    </div>
  );
};

export default OwnerIntelligenceDashboard;
