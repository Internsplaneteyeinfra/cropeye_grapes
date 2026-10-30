import React, { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ScanLine, Upload } from "lucide-react";
import {
  scanSoilAnalysisReport,
  soilDetailsFromOcr,
  type SoilAnalysisOcrResult,
} from "../utils/soilAnalysisOcr";
import { formatOcrError } from "../utils/ocrRuntime";

export type SoilDetailsShape = {
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

type Props = {
  onApplied: (payload: {
    soil: SoilDetailsShape;
    farmerName?: string;
    mobile?: string;
    village?: string;
    gatNumber?: string;
    sourceName: string;
  }) => void;
  className?: string;
};

const PREVIEW_ROWS: { key: keyof SoilDetailsShape | "farmerName" | "mobile" | "village" | "gatNumber"; label: string }[] = [
  { key: "nitrogen", label: "N" },
  { key: "phosphorus", label: "P" },
  { key: "potassium", label: "K" },
  { key: "soil_ph", label: "pH" },
  { key: "organic_carbon", label: "OC" },
  { key: "soil_organic_carbon", label: "SOC" },
  { key: "cec", label: "CEC" },
  { key: "bulk_density", label: "BD" },
  { key: "fe", label: "Fe" },
  { key: "farmerName", label: "Name" },
  { key: "mobile", label: "Phone" },
  { key: "village", label: "Village" },
  { key: "gatNumber", label: "Gat" },
];

/**
 * Field Officer: OCR a soil analysis report (PDF/image) and autofill the registration form.
 */
const SoilAnalysisOcrPanel: React.FC<Props> = ({ onApplied, className = "" }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SoilAnalysisOcrResult | null>(null);
  const [sourceName, setSourceName] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setSourceName(file.name);
    setScanning(true);
    setProgress(0);
    setMessage("Reading soil report…");
    try {
      const scanned = await scanSoilAnalysisReport(file, (msg, val) => {
        setMessage(msg);
        setProgress(val);
      });
      setResult(scanned);
      const soil = soilDetailsFromOcr(scanned);
      const filledSoil = Object.values(soil).filter((v) => String(v).trim()).length;
      if (filledSoil === 0) {
        setError(
          "No soil values were found to autofill. Use a clearer PDF/image, or enter Soil Report values manually.",
        );
        return;
      }
      onApplied({
        soil,
        farmerName: scanned.farmerName.value || undefined,
        mobile: scanned.mobile.value || undefined,
        village: scanned.village.value || undefined,
        gatNumber: scanned.gatNumber.value || undefined,
        sourceName: file.name,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read this soil report. Try a clearer PDF or image.",
      );
    } finally {
      setScanning(false);
    }
  };

  const filledPreview = result
    ? PREVIEW_ROWS.filter((row) => {
        const value =
          row.key in (result as SoilAnalysisOcrResult)
            ? result[row.key as keyof SoilAnalysisOcrResult].value
            : "";
        return String(value).trim();
      })
    : [];

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4 ${className}`}
      data-testid="soil-analysis-ocr-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950">
            <ScanLine className="h-4 w-4 shrink-0 text-amber-700" />
            OCR autofill — soil analysis report
          </h3>
          <p className="mt-0.5 text-xs text-amber-900/80">
            Upload a soil lab report (PDF or image). Values are read here and autofilled into Soil
            Report and matching profile fields (name, phone, village, gat when present).
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*,.pdf"
            className="sr-only"
            aria-label="Upload soil analysis report for OCR autofill"
            disabled={scanning}
            onChange={(e) => {
              void handleFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            disabled={scanning}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-800 disabled:opacity-60"
            style={{ minHeight: 0 }}
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {scanning ? "Scanning…" : "Upload & Autofill"}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{message}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="tabular-nums font-bold">{progress}%</span>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && !scanning && !error && filledPreview.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Autofilled from <span className="truncate">{sourceName}</span> — review values below,
            then in Soil Report before submit.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filledPreview.map((row) => {
              const value = result[row.key as keyof SoilAnalysisOcrResult].value;
              return (
                <span
                  key={row.key}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-100 bg-white px-2 py-0.5 text-[11px] text-slate-800"
                >
                  <span className="font-semibold text-emerald-800">{row.label}</span>
                  <span className="tabular-nums">{value}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SoilAnalysisOcrPanel;
