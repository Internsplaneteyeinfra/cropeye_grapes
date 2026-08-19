/** Shared canopy vigour chart helpers (Field Officer / Farmer / Manager / Owner). */

export const RECOVERY_QUALITY_CHART_PLOT_H = 150;

export type VigourPixelPct = {
  poor: number;
  moderate: number;
  good: number;
  excellent: number;
};

/** Fallback when API is unavailable (matches prior demo proportions). */
export const FALLBACK_VIGOUR_PCT: VigourPixelPct = {
  poor: 12,
  moderate: 28,
  good: 40,
  excellent: 20,
};

export function parseCanopyVigourPixelSummary(
  data: unknown
): VigourPixelPct | null {
  if (!data || typeof data !== "object") return null;
  const ps = (data as { pixel_summary?: Record<string, unknown> })
    .pixel_summary;
  if (!ps || typeof ps !== "object") return null;
  const n = (v: unknown) =>
    typeof v === "number" && !Number.isNaN(v) ? v : null;
  const poor = n(ps.poor_vigour_percentage);
  const moderate = n(ps.moderate_vigour_percentage);
  const good = n(ps.good_vigour_percentage);
  const excellent = n(ps.excellent_vigour_percentage);
  if (
    poor === null ||
    moderate === null ||
    good === null ||
    excellent === null
  ) {
    return null;
  }
  return { poor, moderate, good, excellent };
}

export function vigourToBarRows(v: VigourPixelPct): {
  pctLabel: string;
  color: string;
  label: string;
  heightPct: number;
}[] {
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  return [
    {
      label: "Poor",
      color: "#e74c3c",
      pctLabel: `${v.poor.toFixed(v.poor >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.poor),
    },
    {
      label: "Moderate",
      color: "#f39c12",
      pctLabel: `${v.moderate.toFixed(v.moderate >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.moderate),
    },
    {
      label: "Good",
      color: "#4a80e8",
      pctLabel: `${v.good.toFixed(v.good >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.good),
    },
    {
      label: "Excellent",
      color: "#57b86a",
      pctLabel: `${v.excellent.toFixed(v.excellent >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.excellent),
    },
  ];
}

export function dominantVigourCategory(v: VigourPixelPct): {
  name: string;
  pct: number;
  color: string;
} {
  const items: { name: string; pct: number; color: string }[] = [
    { name: "Poor", pct: v.poor, color: "#e74c3c" },
    { name: "Moderate", pct: v.moderate, color: "#f39c12" },
    { name: "Good", pct: v.good, color: "#4a80e8" },
    { name: "Excellent", pct: v.excellent, color: "#57b86a" },
  ];
  return items.reduce((a, b) => (b.pct > a.pct ? b : a));
}
