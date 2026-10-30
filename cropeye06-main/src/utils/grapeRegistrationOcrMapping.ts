export const GRAPE_REGISTRATION_OCR_DRAFT_KEY =
  "cropeye.grapes-registration-ocr-draft";

export type RegistrationOcrFieldKey =
  | "fullName"
  | "relativeName"
  | "address"
  | "mobile"
  | "plotLocation"
  | "gatNumber"
  | "plotNumber"
  | "village"
  | "taluka"
  | "district"
  | "state"
  | "pinCode"
  | "variety"
  | "areaAcres"
  | "plotAge"
  | "pruningCycles"
  | "irrigationDetails";

export type RegistrationOcrField = {
  value: string;
  confidence: number;
  manual?: boolean;
};

export type RegistrationOcrResult = Record<
  RegistrationOcrFieldKey,
  RegistrationOcrField
>;

export type HarvestWorkflowStep =
  | "confirm-harvest"
  | "record-book"
  | "registration";

export function getHarvestWorkflowStep(
  harvested: boolean | null,
): HarvestWorkflowStep {
  if (harvested === null) return "confirm-harvest";
  return harvested ? "record-book" : "registration";
}

export type GrapeRegistrationOcrDraft = {
  profile: {
    first_name: string;
    last_name: string;
    phone_number: string;
    address: string;
    state: string;
    district: string;
    taluka: string;
  };
  plot: {
    plotLocation: string;
    gatNumber: string;
    plotNumber: string;
    village: string;
    pinCode: string;
    variety: string;
    areaAcres: string;
    plotAge: string;
    irrigationDetails: string;
    pruningCycles: string;
  };
  supplemental: {
    relativeName: string;
    plotLocation: string;
    areaAcres: string;
    pruningCycles: string;
  };
};

type OcrLine = { text: string; confidence: number };

const FIELD_LABELS: Record<RegistrationOcrFieldKey, string[]> = {
  fullName: [
    "full name of grape grower",
    "name of grape grower",
    "grower's name",
    "name of occupant",
    "occupant name",
    "account holder",
    "holder name",
    "खातेदार",
    "occupant",
  ],
  relativeName: [
    "father's / husband's name",
    "father's or husband's name",
    "father's/husband's name",
    "father husband name",
    "father/husband name",
    "father's name",
    "husband's name",
    "वडिलांचे नाव",
  ],
  address: ["correspondence address", "postal address", "address"],
  mobile: ["mobile number", "mobile no", "phone number"],
  plotLocation: [
    "farm/plot location and survey no/gat number",
    "farm/plot location and survey",
    "farm/plot location",
    "farm plot location",
    "plot location",
  ],
  gatNumber: [
    "survey no./gat no",
    "survey / gat",
    "gat number",
    "gat no",
    "survey number",
    "survey no",
    "cts number",
    "cts no",
    "गट क्रमांक",
    "गट नंबर",
    "गट क्र",
  ],
  plotNumber: ["plot number", "plot no"],
  village: ["village", "गाव"],
  taluka: ["taluka", "तालुका"],
  district: ["district", "जिल्हा"],
  state: ["state", "राज्य"],
  pinCode: ["pin code", "pincode", "postal code", "पिनकोड"],
  variety: [
    "grape variety and area under variety",
    "grape variety",
    "variety",
    "crop grown",
    "पिकाचे नाव",
  ],
  areaAcres: [
    "grape variety and area under variety",
    "area under variety",
    "area (acres)",
    "area in acres",
    "area (hectare",
    "area in hectare",
    "area in ha",
    "total area",
    "क्षेत्रफळ",
    "क्षेत्र",
    "area",
  ],
  plotAge: [
    "age of plot / planting details",
    "age of plot",
    "plot age",
    "planting details",
  ],
  pruningCycles: ["number of pruning cycles", "pruning cycles"],
  irrigationDetails: [
    "details of drip/flood irrigation and drainage",
    "drip/flood irrigation",
    "irrigation and drainage",
    "irrigation",
  ],
};

const LAND_RECORD_HINTS = [
  "7/12",
  "7-12",
  "7_12",
  "7 12",
  "saat bara",
  "saatbara",
  "satbara",
  "saat-bara",
  "सातबारा",
  "सात बारा",
  "७/१२",
  "७-१२",
  "record of rights",
  "pahani",
  "land record",
  "खातेदार",
  "गट नंबर",
  "गट क्रमांक",
  "7/12 extract",
  "712 extract",
];

const HECTARE_TO_ACRES = 2.47105;

export function looksLikeLandRecord712(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[_]+/g, " ");
  return LAND_RECORD_HINTS.some((hint) =>
    normalized.includes(hint.toLowerCase()),
  );
}

export function countFilledRegistrationFields(
  result: RegistrationOcrResult,
): number {
  return (Object.keys(result) as RegistrationOcrFieldKey[]).filter((key) =>
    result[key].value.trim(),
  ).length;
}

const emptyField = (): RegistrationOcrField => ({ value: "", confidence: 0 });

function cleanOcrValue(value: string): string {
  return value
    .replace(/^[\s:;|,.\-–—]+/, "")
    .replace(/[\s|]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function takeValueAfterBilingualLabel(value: string): string {
  const cleaned = cleanOcrValue(value);
  const bilingual = cleaned.match(
    /^(?:\/\s*)?(?:[A-Za-z.][A-Za-z. /]{0,24}|[\u0900-\u097F.][\u0900-\u097F. ]{0,24})\s*[:：]\s*(.+)$/,
  );
  return bilingual?.[1] ? cleanOcrValue(bilingual[1]) : cleaned;
}

function extractInlineValue(line: OcrLine, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.text.match(new RegExp(escapedLabel, "i"));
  if (!match || match.index == null) return "";
  return takeValueAfterBilingualLabel(
    line.text.slice(match.index + match[0].length).replace(/^[\s:;|=–—-]+/, ""),
  );
}

function extractAreaAcres(value: string): string {
  const acres = value.match(/\b(\d+(?:[.,]\d+)?)\s*(?:acres?|ac)\b/i);
  if (acres?.[1]) return acres[1].replace(",", ".");
  const hectares = value.match(
    /(\d+(?:[.,]\d+)?)\s*(?:hectares?|ha\.?|हे\.?|हेक्टरे|हेक्टर)/i,
  );
  if (hectares?.[1]) {
    const n = Number(hectares[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(Math.round(n * HECTARE_TO_ACRES * 100) / 100);
  }
  return value.match(/^(\d+(?:[.,]\d+)?)/)?.[1]?.replace(",", ".") ?? "";
}

function extractGatNumber(value: string): string {
  return (
    value.match(/(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*)/)?.[1] ??
    cleanOcrValue(value)
  );
}

function extractVariety(value: string): string {
  const valueWithoutAcres = value.replace(/^\s*\(?acres?\)?\s*/i, "");
  const acreIndex = valueWithoutAcres.search(
    /\b\d+(?:[.,]\d+)?\s*(?:acres?|ac)\b/i,
  );
  const beforeArea =
    acreIndex >= 0 ? valueWithoutAcres.slice(0, acreIndex) : valueWithoutAcres;
  return cleanOcrValue(beforeArea.replace(/[;|–—-]+$/, ""));
}

export function mapRegistrationOcrLines(
  lines: OcrLine[],
): RegistrationOcrResult {
  const result = Object.fromEntries(
    Object.keys(FIELD_LABELS).map((key) => [key, emptyField()]),
  ) as RegistrationOcrResult;

  const labelEntries = Object.entries(FIELD_LABELS).sort(
    (a, b) =>
      Math.max(...b[1].map((label) => label.length)) -
      Math.max(...a[1].map((label) => label.length)),
  ) as [RegistrationOcrFieldKey, string[]][];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalizedLine = line.text.toLowerCase();
    for (const [key, labels] of labelEntries) {
      if (result[key].value) continue;
      const label = labels.find((candidate) =>
        normalizedLine.includes(candidate.toLowerCase()),
      );
      if (!label) continue;

      let rawValue = extractInlineValue(line, label);
      if (!rawValue && i + 1 < lines.length) {
        const next = lines[i + 1];
        const nextNorm = next.text.toLowerCase();
        const nextIsLabel = labelEntries.some(([, nextLabels]) =>
          nextLabels.some((candidate) =>
            nextNorm.includes(candidate.toLowerCase()),
          ),
        );
        if (!nextIsLabel && next.text.trim()) {
          rawValue = cleanOcrValue(next.text);
        }
      }

      const hasCombinedVarietyAreaLabel =
        label.toLowerCase() === "grape variety and area under variety";
      const value =
        hasCombinedVarietyAreaLabel && key === "variety"
          ? extractVariety(rawValue)
          : key === "areaAcres"
            ? extractAreaAcres(rawValue)
            : key === "gatNumber"
              ? extractGatNumber(rawValue)
              : rawValue;
      if (value) {
        result[key] = {
          value,
          confidence: Math.max(0, Math.min(100, Math.round(line.confidence))),
        };
      }
      break;
    }
  }
  return result;
}

function isStringRecord<T extends object>(
  value: unknown,
  keys: string[],
): value is T {
  return (
    !!value &&
    typeof value === "object" &&
    keys.every((key) => typeof (value as Record<string, unknown>)[key] === "string")
  );
}

export function parseGrapeRegistrationOcrDraft(
  value: unknown,
): GrapeRegistrationOcrDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const profile = candidate.profile;
  const plot = candidate.plot;
  const supplemental = candidate.supplemental;
  if (
    !isStringRecord<GrapeRegistrationOcrDraft["profile"]>(profile, [
      "first_name",
      "last_name",
      "phone_number",
      "address",
      "state",
      "district",
      "taluka",
    ]) ||
    !isStringRecord<GrapeRegistrationOcrDraft["plot"]>(plot, [
      "plotLocation",
      "gatNumber",
      "plotNumber",
      "village",
      "pinCode",
      "variety",
      "areaAcres",
      "plotAge",
      "irrigationDetails",
      "pruningCycles",
    ]) ||
    !isStringRecord<GrapeRegistrationOcrDraft["supplemental"]>(supplemental, [
      "relativeName",
      "plotLocation",
      "areaAcres",
      "pruningCycles",
    ])
  ) {
    return null;
  }
  return { profile, plot, supplemental };
}

export function makeGrapeRegistrationOcrDraft(
  fields: RegistrationOcrResult,
  firstName: string,
  lastName: string,
): GrapeRegistrationOcrDraft {
  return {
    profile: {
      first_name: firstName,
      last_name: lastName,
      phone_number: fields.mobile.value.replace(/\D/g, "").slice(-10),
      address: fields.address.value,
      state: fields.state.value,
      district: fields.district.value,
      taluka: fields.taluka.value,
    },
    plot: {
      plotLocation: fields.plotLocation.value,
      gatNumber: fields.gatNumber.value,
      plotNumber: fields.plotNumber.value,
      village: fields.village.value,
      pinCode: fields.pinCode.value.replace(/\D/g, "").slice(0, 6),
      variety: fields.variety.value,
      areaAcres: fields.areaAcres.value,
      plotAge: fields.plotAge.value,
      irrigationDetails: fields.irrigationDetails.value,
      pruningCycles: fields.pruningCycles.value,
    },
    supplemental: {
      relativeName: fields.relativeName.value,
      plotLocation: fields.plotLocation.value,
      areaAcres: fields.areaAcres.value,
      pruningCycles: fields.pruningCycles.value,
    },
  };
}
