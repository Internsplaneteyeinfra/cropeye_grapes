export const SOIL_REPORT_FIELDS = [
  "nitrogen",
  "phosphorus",
  "potassium",
  "soil_ph",
  "cec",
  "organic_carbon",
  "bulk_density",
  "fe",
  "soil_organic_carbon",
] as const;

export type SoilReportField = (typeof SOIL_REPORT_FIELDS)[number];

export type SoilReportPayload = {
  farm: number;
} & Partial<Record<SoilReportField, number>>;

export type SoilReportDetails = Partial<Record<SoilReportField, string | number | null>>;

function validId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = typeof value === "string" ? value.trim() : value;
  if (typeof normalized === "string" && !/^\d+$/.test(normalized)) return null;
  const id = typeof normalized === "number" ? normalized : Number(normalized);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function farmIdFromValue(value: unknown): number | null {
  if (Array.isArray(value)) return farmIdFromValue(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return validId(record.farm_id) ?? validId(record.id);
  }
  return validId(value);
}

/** Read only a farm ID from the all-in-one registration response. */
export function registeredFarmId(response: unknown): number | null {
  let current = response;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) break;
    const record = current as Record<string, unknown>;
    const ids =
      record.ids && typeof record.ids === "object"
        ? (record.ids as Record<string, unknown>)
        : null;
    const id =
      farmIdFromValue(ids?.farms) ??
      farmIdFromValue(ids?.farm) ??
      validId(ids?.farm_id) ??
      farmIdFromValue(record.farm) ??
      validId(record.farm_id);
    if (id != null) return id;
    current = record.data;
  }
  return null;
}

/** Build a create payload for POST /soil-reports/ from reviewed form values. */
export function createSoilReportPayload(
  farmId: number,
  details: SoilReportDetails | null | undefined,
): SoilReportPayload | null {
  const id = validId(farmId);
  if (id == null) throw new Error("A valid farm ID is required for the soil report.");

  const payload: SoilReportPayload = { farm: id };
  let hasValue = false;

  for (const field of SOIL_REPORT_FIELDS) {
    const rawValue = details?.[field];
    if (rawValue == null || String(rawValue).trim() === "") continue;
    const text = String(rawValue).trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
      throw new Error(`Soil report value for ${field.replace(/_/g, " ")} must be a number.`);
    }
    const numberValue = Number(text);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Soil report value for ${field.replace(/_/g, " ")} must be a number.`);
    }
    payload[field] = numberValue;
    hasValue = true;
  }

  return hasValue ? payload : null;
}
