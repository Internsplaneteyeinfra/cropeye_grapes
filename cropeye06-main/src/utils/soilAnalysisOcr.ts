/**
 * Browser OCR / text extract for Field Officer soil analysis reports (PDF/image).
 * Autofills registration soil_details (+ optional farmer identity) — no OCR API.
 */

import { createBrowserOcrWorker, openPdfDocument } from "./ocrRuntime";

export const MAX_SOIL_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const FARMER_SOIL_OCR_STORAGE_PREFIX = "cropeye_farmer_soil_ocr_v1_";

export type SoilOcrFieldKey =
  | "nitrogen"
  | "phosphorus"
  | "potassium"
  | "soil_ph"
  | "cec"
  | "organic_carbon"
  | "bulk_density"
  | "fe"
  | "soil_organic_carbon"
  | "farmerName"
  | "mobile"
  | "village"
  | "gatNumber";

export type SoilOcrField = {
  value: string;
  confidence: number;
  manual?: boolean;
};

export type SoilAnalysisOcrResult = Record<SoilOcrFieldKey, SoilOcrField>;

export type FarmerSoilOcrRecord = {
  phone: string;
  farmerName: string;
  village?: string;
  gatNumber?: string;
  /** Backend farm IDs that received POST /soil-reports/ for this registration */
  farmIds?: number[];
  soil: {
    nitrogen: string;
    phosphorus: string;
    potassium: string;
    soil_ph: string;
    cec: string;
    organic_carbon: string;
    bulk_density: string;
    fe: string;
    soil_organic_carbon: string;
  };
  sourceName: string;
  scannedAt: string;
};

type ProgressCallback = (message: string, progress: number) => void;

type FieldSpec = {
  labels: RegExp[];
  /** Capture number from the same line / next tokens */
  valuePatterns: RegExp[];
  /** Soft range check — reject obvious OCR garbage */
  min?: number;
  max?: number;
  kind: "number" | "text" | "phone";
};

const FIELD_SPECS: Record<SoilOcrFieldKey, FieldSpec> = {
  nitrogen: {
    kind: "number",
    min: 0,
    max: 2000,
    labels: [
      /\bavailable\s*nitrogen\b/i,
      /\bnitrogen\s*\(?\s*n\s*\)?/i,
      /\bnitrogen\b/i,
      /\bavail\.?\s*n\b/i,
      /\bn\s*\(?\s*kg\s*\/?\s*ha\s*\)?/i,
    ],
    valuePatterns: [
      /([0-9]+(?:\.[0-9]+)?)\s*(?:kg\s*\/?\s*ha|ppm|mg)?/i,
    ],
  },
  phosphorus: {
    kind: "number",
    min: 0,
    max: 500,
    labels: [
      /\bavailable\s*phosphorus\b/i,
      /\bphosphorus\b/i,
      /\bphosphorous\b/i,
      /\bp\s*2?\s*o\s*5\b/i,
      /\bavail\.?\s*p\b/i,
      /\bp\s*\(?\s*kg\s*\/?\s*ha\s*\)?/i,
    ],
    valuePatterns: [
      /([0-9]+(?:\.[0-9]+)?)\s*(?:kg\s*\/?\s*ha|ppm|mg)?/i,
    ],
  },
  potassium: {
    kind: "number",
    min: 0,
    max: 2000,
    labels: [
      /\bavailable\s*potassium\b/i,
      /\bpotassium\b/i,
      /\bk\s*2?\s*o\b/i,
      /\bavail\.?\s*k\b/i,
      /\bk\s*\(?\s*kg\s*\/?\s*ha\s*\)?/i,
    ],
    valuePatterns: [
      /([0-9]+(?:\.[0-9]+)?)\s*(?:kg\s*\/?\s*ha|ppm|mg)?/i,
    ],
  },
  soil_ph: {
    kind: "number",
    min: 3,
    max: 11,
    labels: [/\bsoil\s*p\.?\s*h\.?\b/i, /\bp\.?\s*h\.?\s*(?:value|of\s*soil)?\b/i, /\bph\b/i],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)/],
  },
  cec: {
    kind: "number",
    min: 0,
    max: 100,
    labels: [
      /\bcation\s*exchange\s*capacity\b/i,
      /\bcec\b/i,
    ],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)/],
  },
  organic_carbon: {
    kind: "number",
    min: 0,
    max: 20,
    labels: [
      /\borganic\s*carbon\b/i,
      /\borg\.?\s*carbon\b/i,
      /\b\boc\b(?!\w)/i,
    ],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)\s*%?/],
  },
  bulk_density: {
    kind: "number",
    min: 0.5,
    max: 2.5,
    labels: [/\bbulk\s*density\b/i],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)/],
  },
  fe: {
    kind: "number",
    min: 0,
    max: 500,
    labels: [/\b(?:available\s*)?(?:iron|fe)\b/i],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)\s*(?:ppm|mg)?/i],
  },
  soil_organic_carbon: {
    kind: "number",
    min: 0,
    max: 20,
    labels: [
      /\bsoil\s*organic\s*carbon\b/i,
      /\bsoc\b(?!\w)/i,
    ],
    valuePatterns: [/([0-9]+(?:\.[0-9]+)?)\s*%?/],
  },
  farmerName: {
    kind: "text",
    labels: [
      /\bname\s*of\s*(?:the\s*)?farmer\b/i,
      /\bfarmer'?s?\s*name\b/i,
      /\bgrower'?s?\s*name\b/i,
      /\bcultivator\s*name\b/i,
      /\bfarmer\b/i,
      /\bgrower\b/i,
    ],
    valuePatterns: [/([A-Za-z][A-Za-z .']{1,60})/],
  },
  mobile: {
    kind: "phone",
    labels: [
      /\bmobile\s*(?:no\.?|number)?\b/i,
      /\bphone\s*(?:no\.?|number)?\b/i,
      /\bcontact\s*(?:no\.?|number)?\b/i,
      /\bcell\b/i,
    ],
    valuePatterns: [/([6-9]\d{9})/, /(\d{10})/],
  },
  village: {
    kind: "text",
    labels: [/\bvillage\b/i, /\bgav\b/i],
    valuePatterns: [/([A-Za-z][A-Za-z .']{1,40})/],
  },
  gatNumber: {
    kind: "text",
    labels: [
      /\bgat\s*(?:no\.?|number)?\b/i,
      /\bsurvey\s*(?:no\.?|number)?\b/i,
      /\bs\.?\s*no\.?\b/i,
    ],
    valuePatterns: [/([0-9]+(?:\s*\/\s*[0-9A-Za-z]+)?)/],
  },
};

function emptyResult(): SoilAnalysisOcrResult {
  const keys = Object.keys(FIELD_SPECS) as SoilOcrFieldKey[];
  return Object.fromEntries(
    keys.map((k) => [k, { value: "", confidence: 0 }]),
  ) as SoilAnalysisOcrResult;
}

function getSupportedFileType(file: File): "pdf" | "image" | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"];
  const imageExt = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp"];
  if (imageTypes.includes(file.type) || imageExt.includes(extension ?? "")) return "image";
  return null;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[|:;=]+/g, " : ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeNumber(raw: string, min?: number, max?: number): string | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  // Keep useful precision without trailing zeros noise
  const text = String(n);
  return text;
}

function sanitizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return /^[6-9]\d{9}$/.test(local) ? local : null;
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

function sanitizeText(raw: string): string | null {
  const value = raw
    .replace(/[:\-–—|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length < 2) return null;
  // Reject common header noise
  if (/^(name|value|result|unit|status|low|medium|high|parameter)$/i.test(value)) {
    return null;
  }
  return value;
}

function acceptValue(
  kind: FieldSpec["kind"],
  raw: string,
  spec: FieldSpec,
): string | null {
  if (kind === "number") return sanitizeNumber(raw, spec.min, spec.max);
  if (kind === "phone") return sanitizePhone(raw);
  return sanitizeText(raw);
}

function extractAfterLabel(line: string, label: RegExp): string {
  const match = line.match(label);
  if (!match || match.index == null) return "";
  return line.slice(match.index + match[0].length).replace(/^[\s:.\-–—|]+/, "").trim();
}

function firstNumberish(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  // Last resort: first standalone number on the remnant
  const loose = text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);
  return loose?.[1] ?? null;
}

/**
 * Map OCR / PDF lines → soil + identity fields.
 * Handles "Label : 12.3", table rows, and value on the next line.
 */
export function mapSoilAnalysisOcrLines(
  lines: { text: string; confidence: number }[],
): SoilAnalysisOcrResult {
  const result = emptyResult();
  const cleaned = lines
    .map((l) => ({
      text: normalizeOcrText(l.text),
      confidence: l.confidence || 50,
    }))
    .filter((l) => l.text.length > 0);

  const blob = cleaned.map((l) => l.text).join("\n");

  (Object.keys(FIELD_SPECS) as SoilOcrFieldKey[]).forEach((key) => {
    const spec = FIELD_SPECS[key];
    let best: { value: string; confidence: number } | null = null;

    for (let i = 0; i < cleaned.length; i += 1) {
      const line = cleaned[i];
      const labelHit = spec.labels.find((re) => re.test(line.text));
      if (!labelHit) continue;

      const sameLineTail = extractAfterLabel(line.text, labelHit);
      const candidates: { raw: string; confidence: number }[] = [];

      if (sameLineTail) {
        const fromSame =
          spec.kind === "number" || spec.kind === "phone"
            ? firstNumberish(sameLineTail, spec.valuePatterns)
            : sameLineTail.match(spec.valuePatterns[0])?.[1] || sameLineTail;
        if (fromSame) candidates.push({ raw: fromSame, confidence: line.confidence });
      }

      // Value often sits alone on the next line in lab tables (not on another parameter row)
      if (!candidates.length) {
        for (let j = 1; j <= 2 && i + j < cleaned.length; j += 1) {
          const next = cleaned[i + j];
          const looksLikeOtherLabel = (Object.keys(FIELD_SPECS) as SoilOcrFieldKey[]).some(
            (otherKey) =>
              otherKey !== key &&
              FIELD_SPECS[otherKey].labels.some((re) => re.test(next.text)),
          );
          if (looksLikeOtherLabel) break;

          const fromNext =
            spec.kind === "number" || spec.kind === "phone"
              ? firstNumberish(next.text, spec.valuePatterns)
              : next.text.match(spec.valuePatterns[0])?.[1];
          if (fromNext) {
            candidates.push({
              raw: fromNext,
              confidence: Math.min(line.confidence, next.confidence),
            });
            break;
          }
        }
      }

      for (const candidate of candidates) {
        const accepted = acceptValue(spec.kind, candidate.raw, spec);
        if (!accepted) continue;
        if (!best || candidate.confidence >= best.confidence) {
          best = { value: accepted, confidence: Math.round(candidate.confidence) };
        }
      }
      if (best) break;
    }

    // Whole-document fallback (digital PDFs with odd wrapping)
    if (!best) {
      for (const label of spec.labels) {
        const global = new RegExp(
          `${label.source}[\\s:.\-–—|]*([^\n]{0,40})`,
          label.flags.includes("i") ? "i" : "",
        );
        const m = blob.match(global);
        if (!m?.[1]) continue;
        const raw =
          spec.kind === "number" || spec.kind === "phone"
            ? firstNumberish(m[1], spec.valuePatterns)
            : m[1].match(spec.valuePatterns[0])?.[1] || m[1].trim();
        if (!raw) continue;
        const accepted = acceptValue(spec.kind, raw, spec);
        if (accepted) {
          best = { value: accepted, confidence: 45 };
          break;
        }
      }
    }

    if (best) {
      result[key] = best;
    }
  });

  // If SOC empty but OC found, mirror
  if (!result.soil_organic_carbon.value && result.organic_carbon.value) {
    result.soil_organic_carbon = { ...result.organic_carbon };
  }

  return result;
}

async function extractPdfTextLines(
  file: File,
  onProgress: ProgressCallback,
): Promise<{ text: string; confidence: number }[]> {
  const pdfDocument = await openPdfDocument(file);
  const lines: { text: string; confidence: number }[] = [];
  try {
    const pageCount = Math.min(pdfDocument.numPages, 8);
    for (let i = 1; i <= pageCount; i += 1) {
      onProgress(`Reading soil report text page ${i} of ${pageCount}`, Math.round((i / pageCount) * 40));
      const page = await pdfDocument.getPage(i);
      const content = await page.getTextContent();
      const rowMap = new Map<number, string[]>();
      for (const item of content.items) {
        if (!item || typeof item !== "object" || !("str" in item)) continue;
        const str = String((item as { str?: string }).str || "").trim();
        if (!str) continue;
        const transform = (item as { transform?: number[] }).transform;
        const y = transform && transform.length >= 6 ? Math.round(transform[5]) : 0;
        const bucket = rowMap.get(y) ?? [];
        bucket.push(str);
        rowMap.set(y, bucket);
      }
      [...rowMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, parts]) => {
          lines.push({ text: parts.join(" "), confidence: 92 });
        });
    }
    return lines;
  } finally {
    await pdfDocument.destroy();
  }
}

async function renderImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxPixels = 40_000_000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image for reading.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function renderPdfPages(
  file: File,
  onProgress: ProgressCallback,
): Promise<HTMLCanvasElement[]> {
  const pdfDocument = await openPdfDocument(file);
  const canvases: HTMLCanvasElement[] = [];
  try {
    const pageCount = Math.min(pdfDocument.numPages, 8);
    for (let i = 1; i <= pageCount; i += 1) {
      onProgress(`Preparing soil report page ${i} of ${pageCount}`, Math.round((i / pageCount) * 30));
      const page = await pdfDocument.getPage(i);
      const initialViewport = page.getViewport({ scale: 2 });
      const scale = Math.min(1, 3200 / initialViewport.width, 3200 / initialViewport.height);
      const viewport = page.getViewport({ scale: 2 * scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare a PDF page for reading.");
      await page.render({ canvasContext: context, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  } catch (error) {
    canvases.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    throw error;
  } finally {
    await pdfDocument.destroy();
  }
}

function countFilledSoilFields(result: SoilAnalysisOcrResult): number {
  return (
    ["nitrogen", "phosphorus", "potassium", "soil_ph", "cec", "organic_carbon", "bulk_density", "fe", "soil_organic_carbon"] as const
  ).filter((k) => result[k].value.trim()).length;
}

export async function scanSoilAnalysisReport(
  file: File,
  onProgress: ProgressCallback,
): Promise<SoilAnalysisOcrResult> {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_SOIL_DOCUMENT_BYTES) {
    throw new Error("The selected file is larger than 15 MB.");
  }
  const fileType = getSupportedFileType(file);
  if (!fileType) {
    throw new Error("Choose a PDF or image file (JPG, PNG, WebP, TIFF, or BMP).");
  }

  // 1) Prefer native PDF text — accurate autofill for digital lab reports
  if (fileType === "pdf") {
    try {
      const textLines = await extractPdfTextLines(file, onProgress);
      const fromText = mapSoilAnalysisOcrLines(textLines);
      if (countFilledSoilFields(fromText) >= 2 || textLines.join("").length > 120) {
        if (countFilledSoilFields(fromText) > 0) {
          onProgress("Preparing soil fields for review", 100);
          return fromText;
        }
      }
    } catch {
      /* fall through to image OCR */
    }
  }

  // 2) Image OCR / scanned PDF pages via Tesseract
  const canvases =
    fileType === "pdf"
      ? await renderPdfPages(file, onProgress)
      : [await renderImage(file)];
  let worker: Awaited<ReturnType<typeof createBrowserOcrWorker>> | null = null;

  try {
    worker = await createBrowserOcrWorker(onProgress, "Reading soil report text");

    const lines: { text: string; confidence: number }[] = [];
    for (let index = 0; index < canvases.length; index += 1) {
      onProgress(`Scanning page ${index + 1} of ${canvases.length}`, 0);
      const { data } = await worker.recognize(canvases[index]);
      const pageLines =
        data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.map((line) => ({
              text: line.text.trim(),
              confidence: line.confidence,
            })),
          ),
        ) ?? [];
      const fallback = data.text
        .split(/\r?\n/)
        .map((text) => ({ text: text.trim(), confidence: data.confidence }));
      lines.push(...(pageLines.length > 0 ? pageLines : fallback));
    }

    onProgress("Preparing soil fields for review", 100);
    const mapped = mapSoilAnalysisOcrLines(lines);
    if (countFilledSoilFields(mapped) === 0) {
      throw new Error(
        "Could not find soil values (N, P, K, pH, etc.) in this report. Try a clearer scan or typed PDF.",
      );
    }
    return mapped;
  } finally {
    try {
      await worker?.terminate();
    } finally {
      canvases.forEach((c) => {
        c.width = 0;
        c.height = 0;
      });
    }
  }
}

export function soilDetailsFromOcr(result: SoilAnalysisOcrResult) {
  return {
    nitrogen: result.nitrogen.value,
    phosphorus: result.phosphorus.value,
    potassium: result.potassium.value,
    soil_ph: result.soil_ph.value,
    cec: result.cec.value,
    organic_carbon: result.organic_carbon.value,
    bulk_density: result.bulk_density.value,
    fe: result.fe.value,
    soil_organic_carbon: result.soil_organic_carbon.value,
  };
}

/** True when OCR text looks like a soil lab report (not a grape registration form). */
export function looksLikeSoilAnalysisReport(
  lines: { text: string }[] | string,
): boolean {
  const blob = (typeof lines === "string" ? lines : lines.map((l) => l.text).join("\n")).toLowerCase();
  if (!blob.trim()) return false;
  const hits = [
    /soil\s*(health|analysis|test|report|sample)/i,
    /available\s*nitrogen/i,
    /available\s*phosphorus/i,
    /available\s*potassium/i,
    /\borganic\s*carbon\b/i,
    /\bcation\s*exchange\b/i,
    /\b(?:n|p|k)\s*\(?\s*kg\s*\/?\s*ha/i,
  ].filter((re) => re.test(blob)).length;
  const registrationHits = [
    /grape\s*grower/i,
    /pruning\s*cycle/i,
    /global\s*g\.?\s*a\.?\s*p/i,
  ].filter((re) => re.test(blob)).length;
  return hits >= 2 && hits > registrationHits;
}

/** Merge OCR soil into existing form values — only overwrite when OCR found a value. */
export function mergeSoilDetailsFromOcr<T extends Record<string, string>>(
  existing: T | null | undefined,
  ocr: ReturnType<typeof soilDetailsFromOcr>,
): T {
  const base = { ...(existing || {}) } as T;
  (Object.keys(ocr) as (keyof typeof ocr)[]).forEach((key) => {
    const value = String(ocr[key] ?? "").trim();
    if (value) (base as Record<string, string>)[key as string] = value;
  });
  return base;
}

export function saveFarmerSoilOcrRecord(record: FarmerSoilOcrRecord) {
  const phone = record.phone.replace(/\D/g, "");
  if (!phone) return;
  try {
    localStorage.setItem(
      `${FARMER_SOIL_OCR_STORAGE_PREFIX}${phone}`,
      JSON.stringify(record),
    );
  } catch {
    /* ignore */
  }
}

export function loadFarmerSoilOcrRecord(
  phone: string | null | undefined,
): FarmerSoilOcrRecord | null {
  const key = String(phone || "").replace(/\D/g, "");
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${FARMER_SOIL_OCR_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as FarmerSoilOcrRecord;
  } catch {
    return null;
  }
}
