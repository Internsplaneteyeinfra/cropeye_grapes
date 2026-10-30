const VARIETY_LABELS: Record<string, string> = {
  thompson: "Thompson",
  thompson_seedless: "Thompson Seedless",
  sonaka: "Sonaka",
  super_sonaka: "Super Sonaka",
  tas_a_ganesh: "Tas-A-Ganesh",
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
  ard_35: "ARD 35",
  ard_36: "ARD 36",
  arra_35: "ARRA 35",
  arra_36: "ARRA 36",
  variety_1530: "1530",
  variety_1557: "1557",
};

/** Display label for a grape variety code saved at farmer registration (e.g. "super_sonaka"). */
export function grapeVarietyLabel(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (VARIETY_LABELS[key]) return VARIETY_LABELS[key];
  return value
    .trim()
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
