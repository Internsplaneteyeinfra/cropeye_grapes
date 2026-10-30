/** Display names for the grape variety codes saved by farm registration (Add Farm). */
export const GRAPES_VARIETY_LABELS: Record<string, string> = {
  thompson: "Thompson",
  thompson_seedless: "Thompson Seedless",
  tas_a_ganesh: "Tas-A-Ganesh",
  sonaka: "Sonaka",
  super_sonaka: "Super Sonaka",
  manik_chaman: "Manik Chaman",
  flame_seedless: "Flame Seedless",
  crimson: "Crimson",
  crimson_seedless: "Crimson Seedless",
  red_globe: "Red Globe",
  sudhakar_seedless: "Sudhakar Seedless",
  sharad_seedless: "Sharad Seedless",
  mama_jambo: "Mama Jambo",
  raigad_purple: "Raigad Purple",
  nanasaheb_purple: "Nanasaheb Purple",
  ssn: "SSN",
  rk: "RK",
  allison: "Allison",
  timco: "Timco",
  timson: "Timson",
  anushka: "Anushka",
  clone: "Clone",
  ard_35: "ARD 35",
  ard_36: "ARD 36",
  arra_35: "ARRA 35",
  arra_36: "ARRA 36",
  variety_1530: "1530",
  variety_1557: "1557",
  other: "Other",
};

function varietyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Accepts a registration code ("super_sonaka") or free text ("super sonaka") and returns one label. */
export function grapesVarietyLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = varietyKey(raw);
  if (GRAPES_VARIETY_LABELS[key]) return GRAPES_VARIETY_LABELS[key];
  if (/^\d+$/.test(key) && GRAPES_VARIETY_LABELS[`variety_${key}`]) {
    return GRAPES_VARIETY_LABELS[`variety_${key}`];
  }
  return raw
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
