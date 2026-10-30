import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCheck2,
  Loader2,
  ScanLine,
  Upload,
  X,
} from "lucide-react";
import {
  GRAPE_REGISTRATION_OCR_DRAFT_KEY,
  looksLikeLandRecord712,
  makeGrapeRegistrationOcrDraft,
  scanGrapeRegistrationForm,
  type RegistrationOcrFieldKey,
  type RegistrationOcrResult,
} from "../../utils/grapeRegistrationOcr";
import { formatOcrError } from "../../utils/ocrRuntime";
import {
  looksLikeSoilAnalysisReport,
  scanSoilAnalysisReport,
  soilDetailsFromOcr,
} from "../../utils/soilAnalysisOcr";

const OCR_FIELD_LABELS: Record<RegistrationOcrFieldKey, string> = {
  fullName: "Full name of grape grower",
  relativeName: "Father's / husband's name",
  address: "Correspondence address",
  mobile: "Mobile number",
  plotLocation: "Farm / plot location",
  gatNumber: "Survey / Gat number",
  plotNumber: "Plot number",
  village: "Village",
  taluka: "Taluka",
  district: "District",
  state: "State",
  pinCode: "PIN code",
  variety: "Grape variety",
  areaAcres: "Area (acres)",
  plotAge: "Plot age / planting details",
  pruningCycles: "Number of pruning cycles",
  irrigationDetails: "Irrigation and drainage details",
};

const OCR_FIELD_KEYS = Object.keys(OCR_FIELD_LABELS) as RegistrationOcrFieldKey[];

type Props = {
  /** Opens the certification / registration form after OCR review */
  onOpenRegistration?: () => void;
  className?: string;
  /** Collapsed `<details>` (Owner Location). Farmer dashboards use the always-visible panel. */
  compact?: boolean;
  /** Force always-visible card (no `<details>`). Defaults to `!compact`. */
  alwaysOpen?: boolean;
};

/**
 * Shared browser OCR upload panel for Owner (Location) and Farmer dashboards.
 * Does not belong on the registration form page itself.
 */
const RegistrationOcrPanel: React.FC<Props> = ({
  onOpenRegistration,
  className = "",
  compact = false,
  alwaysOpen,
}) => {
  const showAsPanel = alwaysOpen ?? !compact;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [scanResult, setScanResult] = useState<RegistrationOcrResult | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setScanResult(null);
    setShowReview(false);
    setSourceName(file.name);
    setIsScanning(true);
    setProgress(0);
    setProgressMessage("Preparing your form…");
    try {
      // Soil lab PDFs must use Soil analysis OCR (selected farmer), not Registration OCR.
      // 7/12 land records are grower/plot documents and stay on this OCR path.
      if (/soil/i.test(file.name) && !looksLikeLandRecord712(file.name)) {
        setError(
          `"${file.name}" looks like a soil analysis report. Registration OCR only fills grower/plot registration fields. Select the farmer on the Owner Dashboard and use Soil analysis OCR under Water & soil — or upload the grape registration form here.`,
        );
        return;
      }

      const result = await scanGrapeRegistrationForm(file, (msg, val) => {
        setProgressMessage(msg);
        setProgress(val);
      });

      const filledReg = OCR_FIELD_KEYS.filter((k) => result[k].value.trim()).length;
      const landRecord = looksLikeLandRecord712(file.name);
      if (filledReg < 3 && !landRecord) {
        setProgressMessage("Checking if this is a soil lab report…");
        try {
          const soil = await scanSoilAnalysisReport(file, (msg, val) => {
            setProgressMessage(msg);
            setProgress(val);
          });
          const soilValues = soilDetailsFromOcr(soil);
          const soilFilled = Object.values(soilValues).filter((v) => String(v).trim()).length;
          const soilLike =
            soilFilled >= 2 ||
            looksLikeSoilAnalysisReport(
              Object.values(soil)
                .map((f) => f.value)
                .join(" "),
            );
          if (soilLike) {
            setError(
              "This file is a soil analysis report, not a grape registration form. That is why name/village fields are empty. Select the farmer → Water & soil → Upload soil report (OCR) to autofill and view NPK/pH for that farmer.",
            );
            return;
          }
        } catch {
          /* keep registration result below */
        }
      }

      setScanResult(result);
      const nameParts = result.fullName.value.trim().split(/\s+/).filter(Boolean);
      setFirstName(nameParts.shift() ?? "");
      setLastName(nameParts.join(" "));
      setShowReview(true);
    } catch (err) {
      setError(formatOcrError(err, "form"));
    } finally {
      setIsScanning(false);
    }
  };

  const applyAndOpen = () => {
    if (!scanResult) return;
    try {
      const draft = makeGrapeRegistrationOcrDraft(scanResult, firstName, lastName);
      sessionStorage.setItem(GRAPE_REGISTRATION_OCR_DRAFT_KEY, JSON.stringify(draft));
      setShowReview(false);
      onOpenRegistration?.();
    } catch {
      setError("Could not save OCR details. Please try again.");
    }
  };

  const panelBody = (
    <div className={showAsPanel ? "" : "mt-3"}>
      <div
        className={
          compact
            ? "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            : "flex flex-wrap items-center justify-between gap-3"
        }
      >
        <div className={compact ? "min-w-0" : "min-w-0 flex-1"}>
          <h4 className="flex items-center gap-2 text-sm font-bold text-blue-900">
            <ScanLine className="h-4 w-4 shrink-0 text-blue-600" />
            {compact
              ? "Upload & scan grape form"
              : "OCR: Upload Farmer Form & Auto-Fill"}
          </h4>
          <p className="mt-0.5 text-xs text-blue-700">
            {compact ? (
              <>
                Upload a <b>grape registration / GrapeNet form</b> or a <b>7/12 land
                record</b>. Review extracted grower, contact, location, plot, variety,
                and irrigation — then use the Registration card to open Review
                Registration. Scanned in your browser.
              </>
            ) : (
              <>
                Upload a completed GrapeNet registration form or 7/12 land record
                (PDF or image) to auto-populate registration fields. Scanned in your
                browser — no data is sent to a server.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*,.pdf"
            className="sr-only"
            aria-label="Upload farmer registration form for OCR scan"
            disabled={isScanning}
            onChange={(e) => {
              void handleFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            disabled={isScanning}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isScanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {isScanning ? "Scanning Form…" : "Upload & Scan Form"}
          </button>
          {scanResult && (
            <button
              type="button"
              onClick={() => setShowReview(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Eye className="h-3.5 w-3.5" />
              {compact ? "Review registration OCR" : "Review OCR Results"}
            </button>
          )}
          {onOpenRegistration && !compact && (
            <button
              type="button"
              onClick={onOpenRegistration}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Open Registration
            </button>
          )}
        </div>
      </div>

      {isScanning && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-blue-900">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{progressMessage}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="tabular-nums font-bold text-blue-700">{progress}%</span>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {scanResult && !isScanning && !error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            <b>Form scanned from:</b> {sourceName} — review results, then open registration.
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={className} data-testid="registration-ocr-panel">
      {showAsPanel ? (
        <div
          className={`rounded-xl border border-blue-200 bg-blue-50/60 ${compact ? "p-3" : "p-4"}`}
        >
          {panelBody}
        </div>
      ) : (
        <details
          className={`rounded-xl border border-blue-200 bg-blue-50/60 ${compact ? "p-3" : "p-4"}`}
        >
          <summary className="cursor-pointer text-sm font-semibold text-blue-900">
            {compact
              ? "Review registration OCR"
              : "OCR: Upload a registration form to auto-fill details"}
          </summary>
          {panelBody}
        </details>
      )}

      {showReview && scanResult && (
        <div
          className="fixed inset-0 z-[1000100] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowReview(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="OCR review"
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {compact ? "Registration OCR review" : "OCR review"}
                </h3>
                <p className="text-xs text-slate-500">
                  {sourceName} · scanned in this browser
                </p>
              </div>
              <button
                type="button"
                aria-label="Close OCR review"
                onClick={() => setShowReview(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-medium text-slate-600">First name</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </label>
              <label className="block text-xs">
                <span className="font-medium text-slate-600">Last name</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OCR_FIELD_KEYS.filter((k) => k !== "fullName").map((key) => (
                <label
                  key={key}
                  className={`block text-xs ${
                    key === "address" || key === "plotLocation" ? "sm:col-span-2" : ""
                  }`}
                >
                  <span className="font-medium text-slate-600">{OCR_FIELD_LABELS[key]}</span>
                  <input
                    type="text"
                    value={scanResult[key].value}
                    onChange={(e) =>
                      setScanResult((prev) =>
                        prev
                          ? {
                              ...prev,
                              [key]: { ...prev[key], value: e.target.value, manual: true },
                            }
                          : prev,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReview(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={applyAndOpen}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {onOpenRegistration ? "Apply & Open Registration" : "Save for Review"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default RegistrationOcrPanel;
