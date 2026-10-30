import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Building2,
  Loader2,
  MapPinned,
  Route,
  Warehouse,
  X,
} from "lucide-react";
import {
  fetchRouteDistance,
  formatDistanceKm,
  formatDurationMin,
  loadOwnerStorageLocation,
  saveOwnerStorageLocation,
  type LatLngPoint,
  type RouteDistanceResult,
} from "../../utils/ownerLocationDistance";
import { plotCenter, type OwnerPlotRecord } from "../../utils/ownerPortfolio";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Plots in current owner scope (for picker + map context). */
  plots: OwnerPlotRecord[];
  /** Currently selected plot key from the dashboard. */
  selectedPlotKey: string | null;
  onSelectPlot?: (key: string) => void;
};

const DEFAULT_CENTER: [number, number] = [19.9975, 73.7898]; // Nashik

function makeIcon(kind: "storage" | "plot"): L.DivIcon {
  const isStorage = kind === "storage";
  const bg = isStorage ? "#d97706" : "#059669";
  const label = isStorage ? "Court / storage" : "Plot";
  const glyph = isStorage ? "▣" : "●";
  return L.divIcon({
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="background:${bg};color:#fff;font:700 10px/1 system-ui,sans-serif;padding:3px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid ${bg}"></div>
      <div style="margin-top:-2px;width:28px;height:28px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff">${glyph}</div>
    </div>`,
  });
}

const storageIcon = makeIcon("storage");
const plotIcon = makeIcon("plot");

const MapClickPlace: React.FC<{
  enabled: boolean;
  onPlace: (p: LatLngPoint) => void;
}> = ({ enabled, onPlace }) => {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const FitBounds: React.FC<{
  storage: LatLngPoint | null;
  plot: LatLngPoint | null;
  geometry: [number, number][] | null;
}> = ({ storage, plot, geometry }) => {
  const map = useMap();
  useEffect(() => {
    const pts: L.LatLngExpression[] = [];
    if (storage) pts.push([storage.lat, storage.lng]);
    if (plot) pts.push([plot.lat, plot.lng]);
    if (geometry?.length) {
      geometry.forEach(([lng, lat]) => pts.push([lat, lng]));
    }
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
  }, [map, storage, plot, geometry]);
  return null;
};

const InvalidateSize: React.FC<{ open: boolean }> = ({ open }) => {
  const map = useMap();
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [map, open]);
  return null;
};

/**
 * Owner sets court/storage on the map, then sees road distance to the selected plot area.
 */
const OwnerLocationDistancePanel: React.FC<Props> = ({
  isOpen,
  onClose,
  plots,
  selectedPlotKey,
  onSelectPlot,
}) => {
  const [storage, setStorage] = useState<LatLngPoint | null>(null);
  const [placingStorage, setPlacingStorage] = useState(true);
  const [route, setRoute] = useState<RouteDistanceResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const locatedPlots = useMemo(
    () =>
      plots
        .map((p) => {
          const c = plotCenter(p);
          return c
            ? { plot: p, point: { lat: c[0], lng: c[1], label: p.plotLabel } as LatLngPoint }
            : null;
        })
        .filter((x): x is { plot: OwnerPlotRecord; point: LatLngPoint } => x != null),
    [plots],
  );

  const active =
    locatedPlots.find((x) => x.plot.key === selectedPlotKey) ??
    locatedPlots[0] ??
    null;
  const plotPoint = active?.point ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadOwnerStorageLocation();
    setStorage(saved.storage);
    setPlacingStorage(!saved.storage);
    setRoute(null);
    setRouteError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !storage || !plotPoint) {
      setRoute(null);
      return;
    }
    const controller = new AbortController();
    setRouting(true);
    setRouteError(null);
    void fetchRouteDistance(storage, plotPoint, controller.signal)
      .then((r) => {
        setRoute(r);
        setRouting(false);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setRouteError("Could not calculate distance. Try again.");
        setRouting(false);
      });
    return () => controller.abort();
  }, [isOpen, storage, plotPoint?.lat, plotPoint?.lng]);

  const placeStorage = (p: LatLngPoint) => {
    const next = { ...p, label: "Court / storage" };
    setStorage(next);
    saveOwnerStorageLocation(next);
    setPlacingStorage(false);
  };

  const clearStorage = () => {
    setStorage(null);
    saveOwnerStorageLocation(null);
    setPlacingStorage(true);
    setRoute(null);
  };

  const mapCenter: [number, number] = storage
    ? [storage.lat, storage.lng]
    : plotPoint
      ? [plotPoint.lat, plotPoint.lng]
      : DEFAULT_CENTER;

  const routeLatLngs = useMemo((): [number, number][] => {
    if (route?.geometry?.length) {
      return route.geometry.map(([lng, lat]) => [lat, lng] as [number, number]);
    }
    if (storage && plotPoint) {
      return [
        [storage.lat, storage.lng],
        [plotPoint.lat, plotPoint.lng],
      ];
    }
    return [];
  }, [route, storage, plotPoint]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-storage-distance-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              <Warehouse className="h-3.5 w-3.5" />
              Court / storage → plot
            </p>
            <h2
              id="owner-storage-distance-title"
              className="mt-0.5 text-lg font-bold text-slate-900"
            >
              Storage location &amp; plot distance
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Place your court or storage pin, pick a plot, and see the road distance to that plot area.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            style={{ minHeight: 0, minWidth: 0, padding: "0.375rem" }}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-3 border-b border-slate-100 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-end sm:px-5">
          <label className="block text-xs font-medium text-slate-700">
            Plot area (destination)
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={active?.plot.key ?? ""}
              onChange={(e) => onSelectPlot?.(e.target.value)}
              disabled={locatedPlots.length === 0}
            >
              {locatedPlots.length === 0 ? (
                <option value="">No plots with map coordinates</option>
              ) : (
                locatedPlots.map(({ plot }) => (
                  <option key={plot.key} value={plot.key}>
                    {plot.farmerName} · {plot.plotLabel}
                    {plot.village ? ` · ${plot.village}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlacingStorage(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                placingStorage
                  ? "bg-amber-600 text-white"
                  : "border border-amber-600 bg-amber-50 text-amber-900"
              }`}
              style={{ minHeight: 0 }}
            >
              <MapPinned className="h-3.5 w-3.5" />
              {storage ? "Move storage pin" : "Set court / storage"}
            </button>
            {storage && (
              <button
                type="button"
                onClick={clearStorage}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                style={{ minHeight: 0 }}
              >
                Clear storage
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-3 sm:px-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              <Warehouse className="h-3.5 w-3.5" /> Court / storage
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {storage
                ? `${storage.lat.toFixed(5)}, ${storage.lng.toFixed(5)}`
                : placingStorage
                  ? "Click the map to place"
                  : "Not set"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              <Building2 className="h-3.5 w-3.5" /> Plot area
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
              {active
                ? `${active.plot.plotLabel}${active.plot.farmerName ? ` · ${active.plot.farmerName}` : ""}`
                : "Select a plot with coordinates"}
            </p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
              <Route className="h-3.5 w-3.5" /> Distance
            </p>
            {routing ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
              </p>
            ) : route ? (
              <div className="mt-1">
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {formatDistanceKm(route.distanceKm)}
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  {route.mode === "road"
                    ? `Road route · ~${formatDurationMin(route.durationMin)} drive`
                    : "Straight-line (approx.) — road routing unavailable"}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                {routeError || "Set storage and a plot to calculate"}
              </p>
            )}
          </div>
        </div>

        {placingStorage && (
          <p className="px-4 text-xs font-medium text-amber-800 sm:px-5">
            Click anywhere on the map to place the <b>court / storage</b> pin. Distance to the selected plot updates automatically.
          </p>
        )}

        <div className="relative min-h-[320px] flex-1 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="h-[min(48vh,420px)] w-full overflow-hidden rounded-xl border border-slate-200">
            <MapContainer
              center={mapCenter}
              zoom={12}
              scrollWheelZoom
              className="h-full w-full"
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap"
                maxZoom={19}
              />
              <InvalidateSize open={isOpen} />
              <MapClickPlace enabled={placingStorage} onPlace={placeStorage} />
              <FitBounds
                storage={storage}
                plot={plotPoint}
                geometry={route?.geometry ?? null}
              />
              {storage && (
                <Marker
                  position={[storage.lat, storage.lng]}
                  icon={storageIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const m = e.target as L.Marker;
                      const ll = m.getLatLng();
                      placeStorage({ lat: ll.lat, lng: ll.lng });
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -36]}>
                    Court / storage — drag to adjust
                  </Tooltip>
                </Marker>
              )}
              {plotPoint && (
                <Marker position={[plotPoint.lat, plotPoint.lng]} icon={plotIcon}>
                  <Tooltip direction="top" offset={[0, -36]} permanent>
                    Plot: {active?.plot.plotLabel}
                  </Tooltip>
                </Marker>
              )}
              {routeLatLngs.length >= 2 && (
                <Polyline
                  positions={routeLatLngs}
                  pathOptions={{
                    color: route?.mode === "road" ? "#0284c7" : "#94a3b8",
                    weight: 4,
                    opacity: 0.85,
                    dashArray: route?.mode === "road" ? undefined : "6 8",
                  }}
                />
              )}
            </MapContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-600" /> Court / storage
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Plot area
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-sky-600" /> Road distance
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OwnerLocationDistancePanel;
