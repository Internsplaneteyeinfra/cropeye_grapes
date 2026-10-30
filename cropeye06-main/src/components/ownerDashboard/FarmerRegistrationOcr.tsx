import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileText,
  FileCheck2,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { getUserRole } from "../../utils/auth";
import { getStoredUserIndustry } from "../../utils/userIndustry";
import { isGrapesOwnerHierarchyEligible } from "../grapesOwnerHierarchy/grapesOwnerEligibility";
import {
  GRAPE_REGISTRATION_OCR_DRAFT_KEY,
  makeGrapeRegistrationOcrDraft,
  scanGrapeRegistrationForm,
  type RegistrationOcrField,
  type RegistrationOcrFieldKey,
  type RegistrationOcrResult,
} from "../../utils/grapeRegistrationOcr";
import { getHarvestWorkflowStep } from "../../utils/grapeRegistrationOcrMapping";
import { formatOcrError } from "../../utils/ocrRuntime";
import {
  createGrapeHarvestRecordBookPdf,
  type HarvestRecordBookFields,
} from "../../utils/grapeHarvestRecordBook";

type Props = {
  onContinueToRegistration: () => void;
  onOpenCertificationTimeline?: () => void;
};

const FIELD_LABELS: Record<RegistrationOcrFieldKey, string> = {
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
  areaAcres: "Area under variety (acres)",
  plotAge: "Plot age / planting details",
  pruningCycles: "Number of pruning cycles",
  irrigationDetails: "Irrigation and drainage details",
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as RegistrationOcrFieldKey[];

const EMPTY_RECORD_BOOK_FIELDS: HarvestRecordBookFields = {
  plannedHarvestDate: "",
  preHarvestInspectionDate: "",
  recordsReviewedBy: "",
  residueSampleId: "",
  residueSamplingDate: "",
  laboratoryName: "",
  laboratoryReportNumber: "",
  laboratoryReportDate: "",
  testResult: "",
  correctiveAction: "",
  harvestDate: "",
  harvestPlotNumber: "",
  harvestLotId: "",
  harvestVariety: "",
  harvestQuantityKg: "",
  harvestSupervisor: "",
  totalHarvestedKg: "",
  rejectedQuantityKg: "",
  quantitySentForPackingKg: "",
  declarationDate: "",
};

const RECORD_BOOK_FIELD_GROUPS: {
  title: string;
  fields: Array<{
    key: keyof HarvestRecordBookFields;
    label: string;
    type?: "date" | "textarea";
  }>;
}[] = [
    {
      title: "Pre-harvest inspection and residue testing",
      fields: [
        { key: "plannedHarvestDate", label: "Planned harvest date", type: "date" },
        { key: "preHarvestInspectionDate", label: "Pre-harvest inspection date", type: "date" },
        { key: "recordsReviewedBy", label: "Who reviewed PHI and pesticide-use records?" },
        { key: "residueSampleId", label: "Residue sample ID" },
        { key: "residueSamplingDate", label: "Sampling date", type: "date" },
        { key: "laboratoryName", label: "Laboratory name" },
        { key: "laboratoryReportNumber", label: "Laboratory report number" },
        { key: "laboratoryReportDate", label: "Laboratory report date", type: "date" },
        { key: "testResult", label: "Test result / status" },
        { key: "correctiveAction", label: "Corrective action, if required", type: "textarea" },
      ],
    },
    {
      title: "Harvesting record",
      fields: [
        { key: "harvestDate", label: "Harvest date", type: "date" },
        { key: "harvestPlotNumber", label: "Plot number" },
        { key: "harvestLotId", label: "Harvest lot / batch ID" },
        { key: "harvestVariety", label: "Grape variety" },
        { key: "harvestQuantityKg", label: "Harvest quantity (kg)" },
        { key: "harvestSupervisor", label: "Harvest supervisor" },
        { key: "totalHarvestedKg", label: "Total quantity harvested (kg)" },
        { key: "rejectedQuantityKg", label: "Rejected / damaged quantity (kg)" },
        { key: "quantitySentForPackingKg", label: "Quantity sent for packing (kg)" },
      ],
    },
  ];

const FarmerRegistrationOcr: React.FC<Props> = ({
  onContinueToRegistration,
  onOpenCertificationTimeline,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<RegistrationOcrResult | null>(null);
  const [registrationFirstName, setRegistrationFirstName] = useState("");
  const [registrationLastName, setRegistrationLastName] = useState("");
  const [namePartsEdited, setNamePartsEdited] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showHarvestRecordBook, setShowHarvestRecordBook] = useState(false);
  const [harvested, setHarvested] = useState<boolean | null>(null);
  const [recordBookFields, setRecordBookFields] =
    useState<HarvestRecordBookFields>(EMPTY_RECORD_BOOK_FIELDS);
  const [recordBookUrl, setRecordBookUrl] = useState<string | null>(null);
  const [isCreatingRecordBook, setIsCreatingRecordBook] = useState(false);

  useEffect(
    () => () => {
      if (recordBookUrl) URL.revokeObjectURL(recordBookUrl);
    },
    [recordBookUrl],
  );

  if (
    !isGrapesOwnerHierarchyEligible(
      getUserRole(),
      getStoredUserIndustry().crop_type,
    )
  ) {
    return null;
  }

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setFields(null);
    setShowReview(false);
    setShowHarvestRecordBook(false);
    setHarvested(null);
    setRecordBookFields(EMPTY_RECORD_BOOK_FIELDS);
    setRecordBookUrl(null);
    setSourceName(file.name);
    setIsScanning(true);
    setProgress(0);
    setProgressMessage("Preparing your form");

    try {
      const result = await scanGrapeRegistrationForm(
        file,
        (message, value) => {
          setProgressMessage(message);
          setProgress(value);
        },
      );
      setFields(result);
      const nameParts = result.fullName.value
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      setRegistrationFirstName(nameParts.shift() ?? "");
      setRegistrationLastName(nameParts.join(" "));
      setNamePartsEdited(false);
      setShowReview(true);
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Could not read this form. Try a clearer PDF or image.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const updateField = (key: RegistrationOcrFieldKey, value: string) => {
    setFields((current) =>
      current
        ? {
          ...current,
          [key]: { ...current[key], value, manual: true },
        }
        : current,
    );
  };

  const applyReviewedDetailsToRegistration = () => {
    if (!fields || harvested === null) return;
    try {
      const reviewed = makeGrapeRegistrationOcrDraft(
        fields,
        registrationFirstName,
        registrationLastName,
      );
      sessionStorage.setItem(
        GRAPE_REGISTRATION_OCR_DRAFT_KEY,
        JSON.stringify(reviewed),
      );
      setShowReview(false);
      setShowHarvestRecordBook(false);
      if (onOpenCertificationTimeline) {
        onOpenCertificationTimeline();
      } else {
        onContinueToRegistration();
      }
    } catch (storageError) {
      console.error("Unable to prepare OCR registration details", storageError);
      setError(
        "Could not pass the reviewed details to the registration form. Please try again.",
      );
    }
  };

  const continueAfterReview = () => {
    if (!fields || harvested === null) return;
    setError(null);
    if (getHarvestWorkflowStep(harvested) === "record-book") {
      setRecordBookFields((current) => ({
        ...current,
        harvestPlotNumber:
          current.harvestPlotNumber || fields.plotNumber.value || fields.gatNumber.value,
        harvestVariety: current.harvestVariety || fields.variety.value,
      }));
      setShowReview(false);
      setShowHarvestRecordBook(true);
      return;
    }
    applyReviewedDetailsToRegistration();
  };

  const updateRecordBookField = (
    key: keyof HarvestRecordBookFields,
    value: string,
  ) => {
    setRecordBookFields((current) => ({ ...current, [key]: value }));
    setRecordBookUrl(null);
  };

  const createRecordBook = async () => {
    if (!fields) return;
    setError(null);
    setIsCreatingRecordBook(true);
    try {
      const registration = makeGrapeRegistrationOcrDraft(
        fields,
        registrationFirstName,
        registrationLastName,
      );
      const bytes = await createGrapeHarvestRecordBookPdf(
        registration,
        recordBookFields,
      );
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }),
      );
      setRecordBookUrl(url);
    } catch (pdfError) {
      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "Could not create the completed record-book PDF. Please try again.",
      );
    } finally {
      setIsCreatingRecordBook(false);
    }
  };

  const missingCount = fields
    ? FIELD_KEYS.filter((key) => !fields[key].value.trim()).length
    : 0;
  const lowConfidenceCount = fields
    ? FIELD_KEYS.filter(
      (key) =>
        fields[key].value.trim() &&
        !fields[key].manual &&
        fields[key].confidence < 65,
    ).length
    : 0;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf"
        className="sr-only"
        aria-label="Choose a completed Grapes farm registration form"
        disabled={isScanning}
        onChange={(event) => {
          void handleFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isScanning}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {isScanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {/* {isScanning ? "Scanning Form…" : "Upload Form & Auto-Fill with OCR"} */}
      </button>

      <button
        type="button"
        onClick={() => {
          if (onOpenCertificationTimeline) {
            onOpenCertificationTimeline();
          } else {
            onContinueToRegistration();
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        <FileCheck2 className="h-4 w-4 text-emerald-700" />
        Review Registration
      </button>

      {isScanning && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <p>{progressMessage}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="tabular-nums">{progress}%</span>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {showReview && fields && (
        <div
          className="fixed inset-0 z-[1000000] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowReview(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="farmer-ocr-review-title"
            className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-emerald-800">
                  <FileText className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    OCR review
                  </span>
                </div>
                <h2
                  id="farmer-ocr-review-title"
                  className="mt-1 text-lg font-bold text-slate-900 sm:text-xl"
                >
                  Check the details read from your form
                </h2>
                <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">
                  {sourceName} · OCR ran in this browser; the document was not
                  sent to a server.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReview(false)}
                aria-label="Close OCR review"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 px-4 py-4 sm:px-6">
              {(missingCount > 0 || lowConfidenceCount > 0) && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {missingCount > 0 &&
                      `${missingCount} field${missingCount === 1 ? " is" : "s are"} blank because OCR did not find a value. `}
                    {lowConfidenceCount > 0 &&
                      `${lowConfidenceCount} extracted field${lowConfidenceCount === 1 ? " has" : "s have"} low confidence. `}
                    Check and correct the details below. Missing information is
                    not filled in automatically.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {FIELD_KEYS.map((key) => {
                  const field: RegistrationOcrField = fields[key];
                  const needsReview =
                    !field.value.trim() ||
                    (!field.manual && field.confidence < 65);
                  const isLongText = ["address", "plotLocation", "irrigationDetails"].includes(key);
                  return (
                    <label key={key} className="block min-w-0">
                      <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
                        <span>{FIELD_LABELS[key]}</span>
                        {field.value.trim() ? (
                          <span
                            className={`text-xs ${needsReview ? "text-amber-700" : "text-emerald-700"}`}
                          >
                            {field.manual
                              ? "Manually reviewed"
                              : needsReview
                                ? `Review · ${field.confidence}%`
                                : `${field.confidence}% confidence`}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700">Not found</span>
                        )}
                      </span>
                      {isLongText ? (
                        <textarea
                          rows={2}
                          value={field.value}
                          placeholder="Not found — enter manually if available"
                          onChange={(event) => updateField(key, event.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 ${needsReview ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
                            }`}
                        />
                      ) : (
                        <input
                          type="text"
                          value={field.value}
                          placeholder="Not found — enter manually if available"
                          onChange={(event) => updateField(key, event.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 ${needsReview ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
                            }`}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <h3 className="text-sm font-semibold text-amber-950">
                  CropEye name fields — verify the suggested split
                </h3>
                <p className="mt-1 text-xs text-amber-900">
                  The document has one full-name field; CropEye asks for first
                  and last names. Check this split and correct it before
                  continuing.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      First name
                    </span>
                    <input
                      value={registrationFirstName}
                      onChange={(event) => {
                        setRegistrationFirstName(event.target.value);
                        setNamePartsEdited(true);
                      }}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Last name
                    </span>
                    <input
                      value={registrationLastName}
                      onChange={(event) => {
                        setRegistrationLastName(event.target.value);
                        setNamePartsEdited(true);
                      }}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-amber-900" role="status">
                  {namePartsEdited
                    ? "Name split manually reviewed."
                    : "Suggested from the full name; please verify."}
                </p>
              </section>

              <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <h3 className="text-sm font-semibold text-emerald-950">
                  Has harvesting happened for this plot?
                </h3>
                <p className="mt-1 text-xs text-emerald-900">
                  The registration form does not contain harvest status. Choose
                  based on what you know; CropEye will not infer it from OCR or
                  crop stage.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { value: true, label: "Yes, harvested" },
                    { value: false, label: "No, not harvested" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={harvested === option.value}
                      onClick={() => setHarvested(option.value)}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${harvested === option.value
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {harvested === true && (
                  <p className="mt-2 text-xs text-emerald-900">
                    Next, review the harvest and residue details for the
                    supplementary record book. Unknown values will remain blank.
                  </p>
                )}
              </section>
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setShowReview(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueAfterReview}
                disabled={harvested === null}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {harvested
                  ? "Continue to harvest record"
                  : "Review Registration"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showHarvestRecordBook && fields && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="harvest-record-book-title"
            className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-emerald-800">
                  <FileText className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Harvest record book
                  </span>
                </div>
                <h2
                  id="harvest-record-book-title"
                  className="mt-1 text-lg font-bold text-slate-900 sm:text-xl"
                >
                  Review the post-harvest details
                </h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-600">
                  Farmer and plot details already reviewed will be copied into
                  the record book. Enter harvest and lab facts from your records;
                  fields left blank stay blank.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHarvestRecordBook(false)}
                aria-label="Close harvest record-book form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-5 px-4 py-4 sm:px-6">
              {RECORD_BOOK_FIELD_GROUPS.map((group) => (
                <section
                  key={group.title}
                  className="rounded-xl border border-slate-200 p-3 sm:p-4"
                >
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    {group.title}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.fields.map(({ key, label, type }) => (
                      <label
                        key={key}
                        className={`block min-w-0 ${type === "textarea" ? "sm:col-span-2" : ""
                          }`}
                      >
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          {label}
                        </span>
                        {type === "textarea" ? (
                          <textarea
                            rows={2}
                            value={recordBookFields[key]}
                            onChange={(event) =>
                              updateRecordBookField(key, event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        ) : (
                          <input
                            type={type ?? "text"}
                            value={recordBookFields[key]}
                            onChange={(event) =>
                              updateRecordBookField(key, event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}

              <label className="block max-w-xs">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Farmer declaration date
                </span>
                <input
                  type="date"
                  value={recordBookFields.declarationDate}
                  onChange={(event) =>
                    updateRecordBookField("declarationDate", event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                This is a supplementary farm record book, not an official
                registration certificate or residue-test approval. Other
                sections in the template (such as field activities and
                packhouse/export details) remain available for manual completion.
              </p>
              {error && (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  {error}
                </p>
              )}
              {recordBookUrl && (
                <div className="flex flex-wrap gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <a
                    href={recordBookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open completed record book
                  </a>
                  <a
                    href={recordBookUrl}
                    download="grape-farm-record-book-completed.pdf"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </a>
                </div>
              )}
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-between sm:px-6">
              <button
                type="button"
                onClick={() => {
                  setShowHarvestRecordBook(false);
                  setShowReview(true);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to farmer details
              </button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void createRecordBook()}
                  disabled={isCreatingRecordBook}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {isCreatingRecordBook ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {isCreatingRecordBook ? "Creating PDF…" : "Create record-book PDF"}
                </button>
                <button
                  type="button"
                  onClick={applyReviewedDetailsToRegistration}
                  disabled={!recordBookUrl || isCreatingRecordBook}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Review Registration
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

export default FarmerRegistrationOcr;
