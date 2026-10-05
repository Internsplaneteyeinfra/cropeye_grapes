import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFarmerProfile } from '../hooks/useFarmerProfile';
import { useAppContext } from '../context/AppContext';
import './FarmerInfoBar.css';
import { getAuthToken } from '../utils/auth';
import { getNotificationsBaseUrl, getEventsBaseUrl } from '../utils/serviceUrls';
import { getCache, setCache } from './utils/cache';
import { extractAgroStatsPlotRow } from '../utils/grapesEventsBundle';
import { calculateProfileCompletion } from '../utils/profileCompletion';
import axios from 'axios';
import { ChevronRight, UserRound } from 'lucide-react';
import {
  resolveWeedRecord,
  resolvePestRecord,
  resolveDiseaseRecord,
  type RiskAssessmentResult,
} from './pestt/meter/riskAssessmentService';
import {
  fetchForecastCurrentWeather,
  type ForecastCurrentWeather,
  type ForecastPeriodPrediction,
} from '../services/weatherService';

type NotificationRow = {
  id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  task_id: number | null;
  task_title: string | null;
  notification_type: string;
  metadata: Record<string, unknown>;
};

type ToastItem = {
  id: number;
  message: string;
  created_at: string;
  title?: string;
};

function isFromFieldOfficer(n: NotificationRow): boolean {
  const t = String(n.notification_type || "").toLowerCase();
  if (t.includes("fieldofficer") || t.includes("field_officer") || t.includes("field officer")) return true;
  const m: any = n.metadata || {};
  const candidates: Array<any> = [
    m.sender_role,
    m.from_role,
    m.actor_role,
    m.created_by_role,
    m.sender?.role,
    m.from?.role,
    m.actor?.role,
    m.created_by?.role,
    m.sender?.user_role,
    m.from?.user_role,
    m.actor?.user_role,
    m.created_by?.user_role,
  ];
  return candidates
    .map((v) => String(v || "").toLowerCase())
    .some((v) => v === "fieldofficer" || v === "field_officer" || v === "field officer");
}

function isTaskFromFieldOfficer(n: NotificationRow): boolean {
  if (!isFromFieldOfficer(n)) return false;
  // Prefer explicit task_id (present in our NotificationRow type)
  if (typeof n.task_id === "number" && n.task_id > 0) return true;
  const t = String(n.notification_type || "").toLowerCase();
  if (t.includes("task")) return true;
  const m: any = n.metadata || {};
  if (m.task_id || m.task || m.task_title) return true;
  // Fallback: many notifications only carry a text message
  if (String(n.message || "").toLowerCase().includes("task")) return true;
  return false;
}

function isTaskLikeNotification(n: NotificationRow): boolean {
  if (typeof n.task_id === "number" && n.task_id > 0) return true;
  const t = String(n.notification_type || "").toLowerCase();
  if (t.includes("task")) return true;
  const msg = String(n.message || "").toLowerCase();
  if (msg.includes("assigned a new task")) return true;
  if (msg.startsWith("task") || msg.includes("task:")) return true;
  const m: any = n.metadata || {};
  if (m.task_id || m.task || m.task_title) return true;
  return false;
}

function getFirstPlotLatLon(
  plots: Array<{ coordinates?: { location?: { coordinates?: [number, number]; latitude?: number; longitude?: number } } }> | undefined
): { lat: number; lon: number } | null {
  if (!plots?.length) return null;
  for (const plot of plots) {
    const loc = plot.coordinates?.location;
    if (!loc) continue;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      const [lon, lat] = loc.coordinates;
      if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
        return { lat, lon };
      }
    }
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return { lat: loc.latitude, lon: loc.longitude };
    }
  }
  return null;
}

/** Used when no plot has coordinates (same order as API: lat, lon). */
const DEFAULT_FORECAST_LAT = 20.014422865162672;
const DEFAULT_FORECAST_LON = 73.73769671983223;

function temperatureStressLabel(temp: number | undefined): string {
  if (temp === undefined || isNaN(temp)) return '—';
  const heat = temp >= 35;
  const frost = temp <= 2;
  if (heat && frost) return 'Heat stress · Frost risk';
  if (heat) return 'Heat stress';
  if (frost) return 'Frost risk';
  return 'No heat or frost stress';
}

function hasMeaningfulRainSignal(period?: ForecastPeriodPrediction): boolean {
  if (!period) return false;

  const rainAlert = String(period.rain_alert || '').toLowerCase();
  const rainProbability = String(period.rain_probability || '').toLowerCase();
  const combined = `${rainAlert} ${rainProbability}`.trim();

  // Treat explicit "very low/no rain" labels as not worthy of alert display.
  if (
    combined.includes('very low chance') ||
    combined.includes('no rain') ||
    combined.includes('unlikely')
  ) {
    return false;
  }

  // If backend provides numeric range like 0-20%, require upper bound > 20.
  const rangeMatch = combined.match(/(\d+)\s*-\s*(\d+)\s*%?/);
  if (rangeMatch) {
    const upper = Number(rangeMatch[2]);
    return Number.isFinite(upper) && upper > 20;
  }

  // If single numeric probability exists, require > 20.
  const singleMatch = combined.match(/(\d+)\s*%/);
  if (singleMatch) {
    const value = Number(singleMatch[1]);
    return Number.isFinite(value) && value > 20;
  }

  // If it mentions rain and is not explicitly low/unlikely, treat as meaningful.
  return combined.includes('rain');
}

function playNotificationSound(audioCtxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (Ctx) {
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      void ctx.resume?.();
      const now = ctx.currentTime;

      const playBeep = (startAt: number, freq: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.30);
        o.start(startAt);
        o.stop(startAt + 0.32);
      };

      playBeep(now, 880);
      playBeep(now + 0.38, 988);
    }
  } catch {
    // ignore
  }
}

function isBrowserNotificationSupported(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  // Browser notifications are only allowed on secure origins in production.
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function ForecastPeriodRows({
  title,
  prediction,
}: {
  title: string;
  prediction: ForecastCurrentWeather['next_24h_prediction'];
}) {
  if (!prediction) return null;
  const periods: { key: keyof NonNullable<typeof prediction>; label: string }[] = [
    { key: 'morning', label: 'Morning' },
    { key: 'afternoon', label: 'Afternoon' },
    { key: 'night', label: 'Night' },
  ];
  const rows = periods
    .map(({ key, label }) => {
      const p = prediction[key] as ForecastPeriodPrediction | undefined;
      if (!p || !hasMeaningfulRainSignal(p)) return null;
      return (
        <div key={key} className="notif-forecast-period">
          <span className="notif-forecast-period-label">{label}</span>
          <span className="notif-forecast-period-text">
            {p.rain_alert ?? '—'}
            {p.rain_probability ? ` · ${p.rain_probability}` : ''}
          </span>
        </div>
      );
    })
    .filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="notif-forecast-block">
      <div className="notif-forecast-block-title">{title}</div>
      {rows}
    </div>
  );
}

function formatPlantationDate(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolvePlotAreaAcres(plot: any, farm: any): number {
  const acres = parseFloat(
    String(
      farm?.area_acres ??
        farm?.area_in_acres ??
        plot?.area_acres ??
        plot?.area_in_acres ??
        '',
    ),
  );
  if (Number.isFinite(acres) && acres > 0) return acres;
  const size = parseFloat(String(farm?.area_size ?? farm?.area_size_numeric ?? '0'));
  if (!Number.isFinite(size) || size <= 0) return 0;
  return size * 2.47105;
}

function positiveAmount(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function positiveValueText(value: unknown): string | null {
  const text = value == null ? "" : String(value).trim();
  return positiveAmount(text) != null ? text : null;
}

const GRAPES_PRICE_API =
  'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=579b464db66ec23bdd00000192b7b5617dcf45f95865d31f2f071eb2&format=json&offset=0&limit=10&filters%5Bstate.keyword%5D=Maharastra&filters%5Bcommodity%5D=Grapes';

const FarmerInfoBar: React.FC = () => {
  const { appState, getApiData } = useAppContext();
  const { profile, getFarmerName, getTotalPlots } = useFarmerProfile();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [headerWeight, setHeaderWeight] = useState<string | null>(null);
  const [headerPrice, setHeaderPrice] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastCurrentWeather | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsReady, setAlertsReady] = useState(false);
  const [pendingLoginAlert, setPendingLoginAlert] = useState<{ title: string; message: string } | null>(null);
  const panelWrapRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Format current date
  const getCurrentDate = () => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    return today.toLocaleDateString('en-US', options);
  };

  // Get farmer name
  const farmerName = profile ? getFarmerName() : 'Loading...';
  
  // Get total plots count - use agricultural_summary first, fallback to plots array length
  const totalPlots = profile 
    ? (getTotalPlots() || profile.plots?.length || 0)
    : 0;

  const profileCompletion = useMemo(
    () => calculateProfileCompletion(profile),
    [profile],
  );

  const openMyProfile = (editProfile = false) => {
    window.dispatchEvent(
      new CustomEvent("cropeye:navigate", {
        detail: { menu: editProfile ? "Update Profile" : "My Profile" },
      }),
    );
    setOpen(false);
  };

  const selectedPlotMeta = useMemo(() => {
    const plotId =
      (appState as any)?.selectedPlotName ||
      (typeof window !== 'undefined' ? localStorage.getItem('selectedPlot') : null) ||
      profile?.plots?.[0]?.fastapi_plot_id ||
      null;
    const plots = profile?.plots || [];
    const plot =
      plots.find(
        (p: any) =>
          String(p?.fastapi_plot_id || '') === String(plotId) ||
          (p?.gat_number &&
            p?.plot_number &&
            `${p.gat_number}_${p.plot_number}` === String(plotId)),
      ) || plots[0] || null;
    const farm =
      Array.isArray(plot?.farms) && plot.farms.length > 0
        ? (plot.farms[0] as any)
        : null;
    // Prefer fields filled on Registration page (weight / price), else null for API fill
    const filledWeight =
      farm?.harvest_weight ??
      farm?.weight ??
      farm?.crop_type?.harvest_weight ??
      farm?.crop_type?.weight ??
      farm?.plantation?.harvest_weight ??
      farm?.plantation?.weight ??
      (plot as any)?.harvest_weight ??
      (plot as any)?.weight ??
      null;
    const filledPrice =
      farm?.price ??
      farm?.market_price ??
      farm?.selling_price ??
      farm?.crop_type?.price ??
      farm?.crop_type?.market_price ??
      farm?.crop_type?.selling_price ??
      farm?.plantation?.price ??
      farm?.plantation?.market_price ??
      farm?.plantation?.selling_price ??
      (plot as any)?.price ??
      (plot as any)?.market_price ??
      null;
    return {
      plotId: plot?.fastapi_plot_id || plotId,
      areaAcres: resolvePlotAreaAcres(plot, farm),
      filledWeight: positiveValueText(filledWeight),
      filledPrice: positiveAmount(filledPrice),
    };
  }, [appState, profile?.plots]);

  // Weight comes from the saved harvest fields; predicted yield is not harvest weight.
  useEffect(() => {
    setHeaderWeight(selectedPlotMeta.filledWeight);
  }, [selectedPlotMeta.filledWeight]);

  // Price: saved farm value first, otherwise the latest available grapes market price.
  useEffect(() => {
    if (selectedPlotMeta.filledPrice != null) {
      setHeaderPrice(`₹${selectedPlotMeta.filledPrice.toLocaleString('en-IN')}`);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cacheKey = 'grapes_market_modal_price_v2';
        const cached = getCache(cacheKey);
        if (cached && typeof cached === 'string') {
          const cachedAmount = positiveAmount(cached);
          if (cachedAmount != null) {
            if (!cancelled) {
              setHeaderPrice(`₹${cachedAmount.toLocaleString('en-IN')}`);
            }
            return;
          }
        }
        const res = await fetch(GRAPES_PRICE_API);
        if (!res.ok) throw new Error(`Grapes price request failed (${res.status})`);
        const data = await res.json();
        const records = Array.isArray(data?.records) ? data.records : [];
        const today = new Date().toISOString().slice(0, 10);
        const todayRec =
          records.find((r: any) => String(r.arrival_date) === today) ||
          records[0];
        const modal = [todayRec?.modal_price, todayRec?.max_price, todayRec?.min_price]
          .map(positiveAmount)
          .find((amount): amount is number => amount != null);
        if (!cancelled) {
          if (modal != null) {
            const label = `₹${modal.toLocaleString('en-IN')}`;
            setHeaderPrice(label);
            setCache(cacheKey, String(modal));
          } else {
            setHeaderPrice(null);
          }
        }
      } catch {
        if (!cancelled) setHeaderPrice(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlotMeta.filledPrice, selectedPlotMeta.plotId]);

  const displayItems = useMemo(() => {
    const fieldOfficerOnly = items.filter(isFromFieldOfficer);
    // If backend provides role metadata, use it. Otherwise, show all (avoid empty dropdown).
    return fieldOfficerOnly.length > 0 ? fieldOfficerOnly : items;
  }, [items]);

  const unreadCount = useMemo(
    () => displayItems.filter((n) => !n.is_read).length,
    [displayItems]
  );
  
  const forecastLatLon = useMemo(
    () =>
      getFirstPlotLatLon(profile?.plots) ?? {
        lat: DEFAULT_FORECAST_LAT,
        lon: DEFAULT_FORECAST_LON,
      },
    [profile?.plots]
  );

  const selectedPlotForAlerts = useMemo(() => {
    const candidates = [
      (appState as any)?.selectedPlotName as string | null,
      (appState as any)?.plotName as string | null,
      typeof window !== 'undefined' ? localStorage.getItem('selectedPlot') : null,
      profile?.plots?.[0]?.fastapi_plot_id ?? null,
    ].filter((v): v is string => !!v && String(v).trim().length > 0);

    return candidates[0] || null;
  }, [appState, profile?.plots]);

  const cachedRiskAssessment = useMemo(() => {
    const candidateKeys = new Set<string>();

    const addCandidate = (value?: string | null) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      candidateKeys.add(trimmed);
    };

    addCandidate((appState as any)?.selectedPlotName as string | null);
    addCandidate((appState as any)?.plotName as string | null);
    addCandidate(typeof window !== 'undefined' ? localStorage.getItem('selectedPlot') : null);
    addCandidate(selectedPlotForAlerts);

    (profile?.plots || []).forEach((p: any) => {
      addCandidate(p?.fastapi_plot_id);
      if (p?.gat_number && p?.plot_number) {
        addCandidate(`${p.gat_number}_${p.plot_number}`);
      }
    });

    for (const key of candidateKeys) {
      const hit = getCache(`riskAssessment_${key}`, 30 * 60 * 1000) as RiskAssessmentResult | null;
      if (hit) return hit;
    }
    return null;
  }, [appState, profile?.plots, selectedPlotForAlerts]);

  const todayIrrigationAlert = useMemo(() => {
    const scheduleRows = Array.isArray((appState as any)?.irrigationScheduleData)
      ? (appState as any).irrigationScheduleData
      : [];
    const todayRow = scheduleRows.find((row: any) => row?.isToday);
    if (!todayRow || String(todayRow.etRange || '').toLowerCase() !== 'high') return null;

    const temp = typeof forecast?.temperature_c === 'number' ? forecast.temperature_c : null;
    const tempLabel = temp !== null && temp >= 35 ? 'Hot' : 'Warm';
    const irrigationTime = String(todayRow.time || '0 hrs 0 mins')
      .replace(/\s*hrs?\s*/gi, 'h ')
      .replace(/\s*mins?\s*/gi, 'm')
      .trim();

    let weedName = 'weeds';
    let chemical = 'recommended herbicide';
    const highWeedName = cachedRiskAssessment?.weeds?.High?.[0];
    if (highWeedName) {
      const weed = resolveWeedRecord(highWeedName);
      weedName = (weed.name || highWeedName).split('(')[0].trim();
      const chemicalRaw = Array.isArray(weed.chemical) && weed.chemical[0] ? weed.chemical[0] : '';
      if (chemicalRaw) {
        chemical = chemicalRaw.split(' OR ')[0].trim();
      }
    }

    const tempText = temp !== null ? `${temp.toFixed(1)}°C` : '--';
    return `Today is ${tempLabel} (${tempText}). You need to irrigate for ${irrigationTime}. High risk of ${weedName} detected—consider applying ${chemical} today.`;
  }, [appState, cachedRiskAssessment, forecast?.temperature_c, profile?.plots]);

  const cropHealthHighAlerts = useMemo(() => {
    if (!cachedRiskAssessment) return [];
    const temp = typeof forecast?.temperature_c === 'number' ? `${forecast.temperature_c.toFixed(1)}°C` : '--';

    const weedAlerts = (cachedRiskAssessment.weeds?.High || []).map((weedName) => {
      const weed = resolveWeedRecord(weedName);
      const displayName = (weed.name || weedName).split('(')[0].trim();
      const solutionRaw = Array.isArray(weed.chemical) && weed.chemical[0] ? weed.chemical[0] : '';
      const solution = solutionRaw ? solutionRaw.split(' OR ')[0].trim() : 'recommended herbicide';
      return `High weed alert: ${displayName} risk is high today (Temp ${temp}). Solution: apply ${solution} today.`;
    });

    const pestAlerts = (cachedRiskAssessment.pests?.High || []).map((pestName) => {
      const pest = resolvePestRecord(pestName);
      const displayName = (pest.name || pestName).split('(')[0].trim();
      const solutionRaw = Array.isArray(pest.chemical) && pest.chemical[0] ? pest.chemical[0] : '';
      const solution = solutionRaw ? solutionRaw.split(' OR ')[0].trim() : 'recommended control spray';
      return `High pest alert: ${displayName} risk is high today (Temp ${temp}). Solution: apply ${solution} today.`;
    });

    const diseaseAlerts = (cachedRiskAssessment.diseases?.High || []).map((diseaseName) => {
      const disease = resolveDiseaseRecord(diseaseName);
      const displayName = (disease.name || diseaseName).split('(')[0].trim();
      const solutionRaw = Array.isArray(disease.chemical) && disease.chemical[0] ? disease.chemical[0] : '';
      const solution = solutionRaw ? solutionRaw.split(' OR ')[0].trim() : 'recommended disease control spray';
      return `High disease alert: ${displayName} risk is high today (Temp ${temp}). Solution: apply ${solution} today.`;
    });

    return [...weedAlerts, ...pestAlerts, ...diseaseAlerts];
  }, [cachedRiskAssessment, forecast?.temperature_c]);

  const isTemperatureHighAlert =
    typeof forecast?.temperature_c === 'number' &&
    temperatureStressLabel(forecast.temperature_c) !== 'No heat or frost stress';

  useEffect(() => {
    if (!open || !showAlerts) {
      setAlertsReady(false);
      return;
    }

    // Wait for all alert data to settle before showing cards.
    if (forecastLoading || appState?.apiData?.isPreloading) {
      setAlertsReady(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setAlertsReady(true);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [open, showAlerts, forecastLoading, appState?.apiData?.isPreloading, forecast, cachedRiskAssessment, todayIrrigationAlert, cropHealthHighAlerts]);

  // Initial alert notification on login
  const alertTriggeredRef = useRef(false);
  const permissionPromptAttachedRef = useRef(false);

  const showLoginAlert = (title: string, message: string) => {
    alertTriggeredRef.current = true;
    const alertId = Date.now();
    playNotificationSound(audioCtxRef);

    try {
      if (isBrowserNotificationSupported() && Notification.permission === 'granted') {
        const n = new Notification(title, {
          body: message,
          tag: `notif-${alertId}`,
        });
        window.setTimeout(() => n.close(), 6000);
      }
    } catch {
      // ignore notification failures
    }

    setToasts((prev) => {
      const next: ToastItem[] = [
        { id: alertId, message, created_at: new Date().toISOString(), title },
        ...prev,
      ].slice(0, 3);
      return next;
    });
  };

  // Ask notification permission on first user interaction (works better in deployed browsers).
  useEffect(() => {
    if (permissionPromptAttachedRef.current) return;
    if (!isBrowserNotificationSupported()) return;
    if (Notification.permission !== 'default') return;

    permissionPromptAttachedRef.current = true;
    const askPermissionOnce = () => {
      void ensureNotificationPermission();
      document.removeEventListener('click', askPermissionOnce);
      document.removeEventListener('keydown', askPermissionOnce);
      permissionPromptAttachedRef.current = false;
    };

    document.addEventListener('click', askPermissionOnce, { once: true });
    document.addEventListener('keydown', askPermissionOnce, { once: true });

    return () => {
      document.removeEventListener('click', askPermissionOnce);
      document.removeEventListener('keydown', askPermissionOnce);
      permissionPromptAttachedRef.current = false;
    };
  }, []);
  
  useEffect(() => {
    if (alertTriggeredRef.current) return;

    let cancelled = false;
    
    fetchForecastCurrentWeather(forecastLatLon.lat, forecastLatLon.lon)
      .then((data) => {
        if (cancelled) return;
        
        let alertMsg = `Today's Weather: ${data.temperature_c ?? '--'}°C, Humidity: ${data.humidity ?? '--'}%. Click to view.`;
        
        if (data.rain_alert || data.next_24h_prediction?.morning?.rain_alert) {
          alertMsg = `Rain Expected! Temp: ${data.temperature_c ?? '--'}°C, Humidity: ${data.humidity ?? '--'}%. Click to view.`;
        } else if ((data.temperature_c && data.temperature_c >= 35) || (data.temperature_c && data.temperature_c <= 2) || (data.humidity && data.humidity > 80)) {
          alertMsg = `Extreme Weather (${data.temperature_c ?? '--'}°C, ${data.humidity ?? '--'}%). Click to view.`;
        }
        
        setPendingLoginAlert({ title: "Weather Alert", message: alertMsg });
      })
      .catch(() => {
        if (cancelled) return;
        setPendingLoginAlert({
          title: "Weather Alert",
          message: "Weather update is temporarily unavailable. Open alerts to view latest notifications.",
        });
      });
      
    return () => {
      cancelled = true;
    };
  }, [forecastLatLon.lat, forecastLatLon.lon]);

  useEffect(() => {
    if (!pendingLoginAlert) return;
    if (alertTriggeredRef.current) return;
    if (forecastLoading || appState?.apiData?.isPreloading) return;

    const timer = window.setTimeout(() => {
      if (alertTriggeredRef.current) return;
      showLoginAlert(pendingLoginAlert.title, pendingLoginAlert.message);
      setPendingLoginAlert(null);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [pendingLoginAlert, forecastLoading, appState?.apiData?.isPreloading]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const base = getNotificationsBaseUrl();
      const res = await fetch(`${base.replace(/\/+$/, '')}/api/notifications/`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: any = await res.json();
      const rows: NotificationRow[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      setItems(rows);
    } catch (e) {
      // keep silent; dropdown will show empty
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      const token = getAuthToken();
      const base = getNotificationsBaseUrl();
      const res = await fetch(
        `${base.replace(/\/+$/, '')}/api/notifications/mark-all-read/`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // optimistic UI update
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore failures (keep UI as-is)
    }
  };

  const pushIncomingNotification = (notif: NotificationRow) => {
    // Sound
    playNotificationSound(audioCtxRef);

    // Native browser notification (permission required)
    try {
      if (isBrowserNotificationSupported() && Notification.permission === 'granted') {
        const title = notif.task_title ? `Task assigned: ${notif.task_title}` : 'New notification';
        const n = new Notification(title, {
          body: notif.message,
          tag: `notif-${notif.id}`,
        });
        window.setTimeout(() => n.close(), 6000);
      }
    } catch {
      // ignore notification failures
    }

    // Prepend + de-dup by id
    setItems((prev) => {
      const byId = new Map<number, NotificationRow>();
      [notif, ...prev].forEach((n) => byId.set(n.id, n));
      return Array.from(byId.values());
    });

    // Show on-screen toast like a browser notification
    setToasts((prev) => {
      const next: ToastItem[] = [
        { id: notif.id, message: notif.message, created_at: notif.created_at },
        ...prev,
      ].slice(0, 3);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setForecast(null);
      setForecastError(null);
      setShowAlerts(false);
      return;
    }
    let cancelled = false;
    setForecastLoading(true);
    setForecastError(null);
    void fetchForecastCurrentWeather(forecastLatLon.lat, forecastLatLon.lon)
      .then((data) => {
        if (!cancelled) setForecast(data);
      })
      .catch(() => {
        if (!cancelled) {
          setForecast(null);
          setForecastError('Weather alerts unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setForecastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, forecastLatLon.lat, forecastLatLon.lon]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const base = getNotificationsBaseUrl();
    const wsBase = base.startsWith('https://')
      ? base.replace(/^https:\/\//, 'wss://')
      : base.startsWith('http://')
        ? base.replace(/^http:\/\//, 'ws://')
        : base;
    const wsUrl = `${wsBase.replace(/\/+$/, '')}/ws/notifications/?token=${encodeURIComponent(token)}`;

    let cancelled = false;
    let attempt = 0;

    const cleanup = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      cleanup();

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          attempt = 0;
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            const notif = msg?.notification as NotificationRow | undefined;
            if (notif && typeof notif.id === 'number' && typeof notif.message === 'string') {
              pushIncomingNotification(notif);
            }
          } catch {
            // ignore bad payloads
          }
        };

        ws.onclose = (_ev) => {
          if (cancelled) return;
          // reconnect with backoff (max ~30s)
          attempt += 1;
          const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, attempt)));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // allow onclose to handle reconnect
        };
      } catch {
        // schedule reconnect
        attempt += 1;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, attempt)));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const onDocDown = (ev: MouseEvent) => {
      if (!open) return;
      const el = panelWrapRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  useEffect(() => {
    if (toasts.length > 0) {
      document.body.classList.add('notif-modal-open');
    } else {
      document.body.classList.remove('notif-modal-open');
    }

    return () => {
      document.body.classList.remove('notif-modal-open');
    };
  }, [toasts.length]);

  // Don't render until profile is available (keep hooks above to avoid order issues)
  if (!profile) {
    return null;
  }

  return (
    <div className="farmer-info-bar">
      {toasts.length > 0 ? (
        <div className="notif-toast-overlay" aria-live="polite" aria-atomic="true">
          <div className="notif-toasts">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="notif-toast"
                role="alert"
                aria-live="assertive"
              >
                <div className="notif-toast-top">
                  <div className="notif-toast-symbol" aria-hidden="true">⚠</div>
                  <div className="notif-toast-title">{t.title || 'New message'}</div>
                </div>
                <div className="notif-toast-msg">{t.message}</div>
                <div className="notif-toast-meta">{new Date(t.created_at).toLocaleString()}</div>
                <button
                  type="button"
                  className="notif-toast-view-btn"
                  onClick={() => {
                    setToasts([]);
                    setOpen(true);
                    setShowAlerts(true);
                  }}
                >
                  View Alert
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="farmer-info-container">
        {/* Left: Farmer Name */}
        <div className="farmer-info-section farmer-info-left">
          <span className="farmer-name">{farmerName}</span>
        </div>

        {/* Center: Date + plantation + weight/price */}
        <div className="farmer-info-section farmer-info-center">
          <div className="farmer-center-stack">
            <span className="farmer-date">{getCurrentDate()}</span>
            <span className="farmer-meta-line">
              Weight: {headerWeight || '—'}
              {' | '}
              Price: {headerPrice || '—'}
            </span>
          </div>
        </div>

        {/* Right: Total Plots */}
        <div className="farmer-info-section farmer-info-right">
          <span className="farmer-plots">Total Plots: {totalPlots}</span>
          <div ref={panelWrapRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="notif-btn"
              title="Notifications"
              onClick={async () => {
                await ensureNotificationPermission();
                setOpen((p) => !p);
              }}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <span className="material-icons" style={{ fontSize: 20 }}>
                notifications
              </span>
              {unreadCount > 0 ? (
                <span className="notif-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {open ? (
              <div className="notif-panel" role="dialog" aria-label="Notifications">
                {showAlerts ? (
                  <div id="notif-alerts" className="notif-alerts-panel" aria-label="Alerts">
                    <div className="notif-weather-alerts" aria-label="Weather alerts">
                      {!alertsReady ? (
                        <div className="notif-weather-alerts-muted">Loading alerts…</div>
                      ) : forecastError ? (
                        <div className="notif-weather-alerts-muted">{forecastError}</div>
                      ) : forecast ? (
                        <>
                          {todayIrrigationAlert ? (
                            <div className="notif-weather-pill notif-weather-pill-warn">
                              <span className="notif-weather-pill-label">Today Alert</span>
                              <span className="notif-weather-pill-value">{todayIrrigationAlert}</span>
                            </div>
                          ) : null}
                          {cropHealthHighAlerts.length > 0 ? (
                            <div className="notif-weather-pill notif-weather-pill-warn">
                              <span className="notif-weather-pill-label">High Pest & Disease Risk</span>
                              <div className="notif-weather-pill-value">
                                <ul className="list-disc ml-4 space-y-1">
                                  {cropHealthHighAlerts.map((msg, idx) => (
                                    <li key={`crop-health-high-${idx}`}>{msg}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                          {typeof forecast.temperature_c === 'number' && isTemperatureHighAlert ? (
                            <div className="notif-weather-pill notif-weather-pill-warn">
                              <span className="notif-weather-pill-label">Temperature Alert</span>
                              <span className="notif-weather-pill-value">
                                {forecast.temperature_c}°C ({temperatureStressLabel(forecast.temperature_c)})
                              </span>
                            </div>
                          ) : null}

                          <div className="notif-weather-pill notif-weather-pill-rain">
                            <span className="notif-weather-pill-label">Rain</span>
                            <span className="notif-weather-pill-value">
                              {forecast.rain_alert ?? '—'}
                              {forecast.rain_probability ? ` (${forecast.rain_probability})` : ''}
                            </span>
                          </div>
                          <ForecastPeriodRows title="24 hrs prediction" prediction={forecast.next_24h_prediction} />
                          <ForecastPeriodRows title="48 hrs prediction" prediction={forecast.next_48h_prediction} />
                          {typeof forecast.humidity === 'number' ? (
                            <div className="notif-weather-pill">
                              <span className="notif-weather-pill-label">Humidity</span>
                              <span className="notif-weather-pill-value">{forecast.humidity}%</span>
                            </div>
                          ) : null}
                          {typeof forecast.temperature_c === 'number' && !isTemperatureHighAlert ? (
                            <div className="notif-weather-pill notif-weather-pill-temp">
                              <span className="notif-weather-pill-label">Temperature</span>
                              <span className="notif-weather-pill-value">
                                {forecast.temperature_c}°C ({temperatureStressLabel(forecast.temperature_c)})
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="notif-weather-alerts-muted">No alerts</div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="notif-panel-header">
                  <div className="notif-panel-header-main">
                    <div className="notif-panel-header-title-row">
                      <div className="notif-panel-header-title">Notifications</div>
                      <button
                        type="button"
                        className="notif-alert-btn"
                        onClick={() => setShowAlerts((p) => !p)}
                        aria-expanded={showAlerts}
                        aria-controls="notif-alerts"
                        title="Alerts"
                      >
                        Alert
                      </button>
                    </div>
                  </div>
                  <div className="notif-panel-actions">
                    <button
                      type="button"
                      className="notif-markall"
                      onClick={markAllRead}
                      disabled={items.length === 0 || unreadCount === 0}
                      title="Mark all as read"
                    >
                      Mark all read
                    </button>
                    <button
                      type="button"
                      className="notif-close"
                      onClick={() => setOpen(false)}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {!showAlerts && (
                  <>
                    <section className="notif-profile-completion" aria-label="Profile completion">
                      <div className="notif-profile-completion-heading">
                        <span>Profile Completion</span>
                        <strong>{profileCompletion.percentage}%</strong>
                      </div>
                      <div
                        className="notif-profile-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={profileCompletion.percentage}
                        aria-label="Profile completion percentage"
                      >
                        <span style={{ width: `${profileCompletion.percentage}%` }} />
                      </div>
                      {profileCompletion.missing.length > 0 ? (
                        <div className="notif-profile-incomplete">
                          <div className="notif-profile-incomplete-title">
                            <UserRound size={16} aria-hidden="true" />
                            <strong>Complete Your Profile</strong>
                            <span className="notif-profile-dot" aria-hidden="true" />
                          </div>
                          <p>Missing: {profileCompletion.missing.join(", ")}</p>
                          <button
                            type="button"
                            className="notif-profile-update"
                            onClick={() => openMyProfile(true)}
                          >
                            Update Profile <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <p className="notif-profile-complete">Your profile is complete.</p>
                      )}
                      <button
                        type="button"
                        className="notif-profile-open"
                        onClick={openMyProfile}
                      >
                        <UserRound size={15} aria-hidden="true" />
                        Go to My Profile
                      </button>
                    </section>

                    <div className="notif-list">
                      {loading ? (
                        <div className="notif-empty">Loading…</div>
                      ) : displayItems.length === 0 ? (
                        <div className="notif-empty">No notifications</div>
                      ) : (
                        displayItems.map((n) => {
                          const shouldNavigate =
                            isTaskLikeNotification(n) || isTaskFromFieldOfficer(n);
                          return (
                            <button
                              key={n.id}
                              type="button"
                              className="notif-item notif-item-click"
                              onClick={() => {
                                if (!shouldNavigate) return;
                                window.dispatchEvent(
                                  new CustomEvent("cropeye:navigate", {
                                    detail: { menu: "ViewList" },
                                  })
                                );
                                setOpen(false);
                              }}
                              title={shouldNavigate ? "Open My Task Checklist" : undefined}
                            >
                              <div className="notif-item-msg">{n.message}</div>
                              <div className="notif-item-meta">
                                {new Date(n.created_at).toLocaleString()}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerInfoBar;
