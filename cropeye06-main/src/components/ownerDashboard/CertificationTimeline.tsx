import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Hourglass,
  Upload,
  FileText,
  Download,
  Eye,
  Check,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  X,
  FileCheck2,
  Loader2,
  ScanLine,
  AlertTriangle,
} from "lucide-react";
import type { OwnerPlotRecord } from "../../utils/ownerPortfolio";
import {
  GRAPE_REGISTRATION_OCR_DRAFT_KEY,
  parseGrapeRegistrationOcrDraft,
  makeGrapeRegistrationOcrDraft,
  type GrapeRegistrationOcrDraft,
  type RegistrationOcrResult,
  type RegistrationOcrFieldKey,
} from "../../utils/grapeRegistrationOcrMapping";
import {
  scanGrapeRegistrationForm,
} from "../../utils/grapeRegistrationOcr";
import { formatOcrError } from "../../utils/ocrRuntime";
import {
  createGrapeHarvestRecordBookPdf,
  type HarvestRecordBookFields,
} from "../../utils/grapeHarvestRecordBook";
import {
  uploadGrapesReport,
  getGrapesReports,
  ensureGrapesCertification,
  patchGrapesCertification,
  type GrapesCertificationRecord,
  type GrapesCertificationStatus,
} from "../../api";
import { getBackendApiBaseUrl } from "../../utils/serviceUrls";
import { GRAPES_VARIETY_LABELS } from "../../utils/grapesVarieties";

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

/** Part 11 – first 6 supporting documents (registration-relevant) from the Grape Farm Record Book */
const PART11_CHECKLIST_FIELDS = [
  {
    key: "docLandRecord712",
    remarksField: "docLandRecord712Remarks",
    label: "Land record / 7/12 extract",
  },
  {
    key: "docFarmPlotLayout",
    remarksField: "docFarmPlotLayoutRemarks",
    label: "Farm / plot layout",
  },
  {
    key: "docGrapeNetCertificate",
    remarksField: "docGrapeNetCertificateRemarks",
    label: "Official GrapeNet plot registration certificate",
  },
  {
    key: "docFieldActivityRecords",
    remarksField: "docFieldActivityRecordsRemarks",
    label: "Field activity records",
  },
  {
    key: "docFertilizerPurchaseRecords",
    remarksField: "docFertilizerPurchaseRecordsRemarks",
    label: "Fertilizer and input purchase records",
  },
  {
    key: "docPesticideRecords",
    remarksField: "docPesticideRecordsRemarks",
    label: "Pesticide application records and supporting labels / invoices",
  },
] as const;

const STEP1_FIELD_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600";

const REGISTRATION_FORM_STEPS = [
  { number: 1, title: "Farmer Details" },
  { number: 2, title: "Farm & Plot" },
  { number: 3, title: "GlobalG.A.P." },
  { number: 4, title: "Form 4B" },
  { number: 5, title: "Fertilizer & Irrigation" },
  { number: 6, title: "Pesticide Record" },
  { number: 7, title: "Documents" },
  { number: 8, title: "Packhouse & Export" },
] as const;

type RegistrationFormStep = (typeof REGISTRATION_FORM_STEPS)[number]["number"];

const REGISTRATION_REQUIRED_FIELDS: Record<
  RegistrationFormStep,
  { key: string; label: string }[]
> = {
  1: [
    { key: "farmerFirstName", label: "Farmer first name" },
    { key: "farmerLastName", label: "Farmer last name" },
    { key: "phone", label: "Mobile number" },
    { key: "address", label: "Postal address" },
    { key: "village", label: "Village" },
    { key: "taluka", label: "Taluka" },
    { key: "district", label: "District" },
    { key: "state", label: "State" },
    { key: "pinCode", label: "PIN code" },
  ],
  2: [
    { key: "gatNumber", label: "Survey / Gat number" },
    { key: "plotNumber", label: "Plot number" },
    { key: "areaAcres", label: "Area under grapes" },
    { key: "variety", label: "Grape variety" },
    { key: "plantingYear", label: "Planting year" },
    { key: "irrigationMethod", label: "Irrigation method" },
  ],
  3: [
    { key: "gapCertificateNumber", label: "GlobalG.A.P. certificate number" },
    { key: "gapCertifyingBody", label: "Certifying body" },
    { key: "gapIssueDate", label: "Certificate issue date" },
    { key: "gapValidUntil", label: "Valid until" },
    { key: "gapUploadName", label: "GlobalG.A.P. certificate upload" },
  ],
  4: [
    { key: "form4bGgnNumber", label: "GGN / producer number" },
    { key: "form4bProduct", label: "Product / crop" },
    { key: "form4bInspectionDate", label: "Inspection date" },
    { key: "form4bInspector", label: "Inspector / auditor" },
    { key: "form4bUploadName", label: "Form 4B  document upload" },
  ],
  5: [
    { key: "fertDate", label: "Fertilizer application date" },
    { key: "fertName", label: "Fertilizer / input name" },
    { key: "fertQuantity", label: "Quantity / dose" },
    { key: "irrDate", label: "Irrigation date" },
    { key: "irrMethod", label: "Irrigation method" },
    { key: "irrDuration", label: "Irrigation duration" },
  ],
  6: [
    { key: "pestAppDate", label: "Pesticide application date" },
    { key: "pestProductName", label: "Trade / product name" },
    { key: "pestActiveIngredient", label: "Active ingredient" },
    { key: "pestDose", label: "Dose and unit" },
    { key: "pestPhi", label: "Pre-harvest interval (PHI)" },
  ],
  7: PART11_CHECKLIST_FIELDS.map(({ key, label }) => ({ key, label })),
  8: [
    { key: "packhouseNamePart10", label: "Registered packhouse name" },
    { key: "packhouseRegNumber", label: "Packhouse registration number" },
    { key: "packhouseDeliveryDate", label: "Date of delivery to packhouse" },
    { key: "harvestLotBatch", label: "Harvest lot / batch number" },
    { key: "quantityDeliveredKg", label: "Quantity delivered (kg)" },
    { key: "destinationCountry", label: "Destination country" },
  ],
};

export type CertificationStatus =
  | "Pending"
  | "Under Review"
  | "Approved"
  | "Rejected"
  | "Expired";

export interface CertificateOption {
  id: string;
  name: string;
  code: string;
  authority: string;
  description: string;
  status: CertificationStatus;
  documentUrl?: string | null;
  documentName?: string | null;
  uploadedAt?: string | null;
  expiryDate?: string | null;
  certificateNumber?: string | null;
  remarks?: string | null;
  isRequired: boolean;
}

export interface TimelineStepState {
  stepNumber: 1 | 2 | 3;
  id: "registration" | "residue" | "export";
  title: string;
  shortTitle: string;
  subtitle: string;
  status: CertificationStatus;
  isUnlocked: boolean;
  selectedOptionId: string;
  options: CertificateOption[];
  formData: Record<string, string>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedPlot: OwnerPlotRecord | null;
  plots: OwnerPlotRecord[];
  onSelectPlot?: (plotKey: string) => void;
  /**
   * When true, sync POST/GET/PATCH /api/grapes-certification/.
   * Owner Review Registration only — never for Upload & Scan OCR, and not for farmer My Profile.
   */
  syncBackendCertification?: boolean;
}

const STATUS_CONFIG: Record<
  CertificationStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    icon: React.ReactNode;
    color: string;
  }
> = {
  Approved: {
    label: "Approved",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
    dotClass: "bg-emerald-500",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    color: "#16a34a",
  },
  "Under Review": {
    label: "Under Review",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
    dotClass: "bg-amber-500 animate-pulse",
    icon: <Clock className="h-4 w-4 text-amber-600" />,
    color: "#f59e0b",
  },
  Pending: {
    label: "Pending",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-400",
    icon: <Hourglass className="h-4 w-4 text-slate-500" />,
    color: "#64748b",
  },
  Rejected: {
    label: "Rejected",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-300",
    dotClass: "bg-rose-500",
    icon: <XCircle className="h-4 w-4 text-rose-600" />,
    color: "#ef4444",
  },
  Expired: {
    label: "Expired",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-300",
    dotClass: "bg-purple-500",
    icon: <AlertCircle className="h-4 w-4 text-purple-600" />,
    color: "#8b5cf6",
  },
};

const DEFAULT_OPTIONS_STEP1: CertificateOption[] = [
  {
    id: "grapenet-reg",
    name: "GrapeNet Farm Registration",
    code: "APEDA-GN-01",
    authority: "APEDA & State Department of Agriculture",
    description: "Official farmer and plot identity registration for export traceability.",
    status: "Pending",
    isRequired: true,
  },
  {
    id: "land-7-12",
    name: "Land Record (7/12 Extract & Gat)",
    code: "REV-712-02",
    authority: "Maharashtra Land Revenue Department",
    description: "Verified land ownership, Gat survey boundaries, and plot acreage.",
    status: "Pending",
    isRequired: true,
  },
  {
    id: "variety-auth",
    name: "Grape Variety Authenticity",
    code: "HORT-VAR-03",
    authority: "National Research Centre for Grapes (NRCG)",
    description: "Verification of grape variety, vine age, rootstock type, and plantation health.",
    status: "Pending",
    isRequired: false,
  },
];

const DEFAULT_OPTIONS_STEP2: CertificateOption[] = [
  {
    id: "residue-mrl",
    name: "Pesticide Residue Analysis (MRL)",
    code: "MRL-LAB-01",
    authority: "NABL Accredited Testing Laboratory (NRCG / Vimta)",
    description: "Screening of active agrochemical residues against EU / APEDA export MRL standards.",
    status: "Pending",
    isRequired: true,
  },
  {
    id: "soil-heavy-metals",
    name: "Soil Health & Heavy Metal Report",
    code: "SOIL-HM-02",
    authority: "Government Agricultural Chemistry Testing Lab",
    description: "Soil pH, EC, available NPK, and safe limits for lead, cadmium, and arsenic.",
    status: "Pending",
    isRequired: false,
  },
  {
    id: "water-quality",
    name: "Pre-Harvest Irrigation Water Quality",
    code: "WTR-QA-03",
    authority: "State Water Testing Laboratory",
    description: "Analysis of irrigation source water for salinity, boron, and biological purity.",
    status: "Pending",
    isRequired: false,
  },
];

const DEFAULT_OPTIONS_STEP3: CertificateOption[] = [
  {
    id: "phytosanitary",
    name: "Phytosanitary Export Certificate",
    code: "PSC-EXP-01",
    authority: "Directorate of Plant Protection, Quarantine & Storage",
    description: "Official declaration that consignment is free from quarantine pests and diseases.",
    status: "Pending",
    isRequired: true,
  },
  {
    id: "apeda-clearance",
    name: "APEDA Export Consignment Pass",
    code: "APEDA-PASS-02",
    authority: "Agricultural & Processed Food Products Export Development Authority",
    description: "Authorization for international shipment clearance and container stuffing.",
    status: "Pending",
    isRequired: true,
  },
  {
    id: "harvest-record-book",
    name: "Grape Farm Harvest Record Book",
    code: "REC-BOOK-03",
    authority: "CropEye & Field Officer Verification",
    description: "Comprehensive 15-page log of cultural practices, spraying, and harvest declaration.",
    status: "Pending",
    isRequired: true,
  },
];

function resolveBackendPlotId(plot: OwnerPlotRecord | null): number | null {
  if (!plot) return null;
  const n = Number(plot.plotId);
  if (Number.isFinite(n) && n > 0 && String(plot.plotId).trim() === String(n)) {
    return n;
  }
  return null;
}

function absolutizeMediaUrl(file: string | null | undefined): string {
  if (!file) return "";
  if (/^https?:\/\//i.test(file)) return file;
  const proxyHost = (
    import.meta.env.VITE_BACKEND_PROXY_TARGET as string | undefined
  )
    ?.trim()
    .replace(/\/+$/, "");
  if (proxyHost) {
    return `${proxyHost}${file.startsWith("/") ? "" : "/"}${file}`;
  }
  const base = getBackendApiBaseUrl().replace(/\/api\/?$/i, "").replace(/\/+$/, "");
  if (base.startsWith("/")) {
    return file.startsWith("/") ? file : `/${file}`;
  }
  return `${base}${file.startsWith("/") ? "" : "/"}${file}`;
}

function mapApiStatusToUi(status: GrapesCertificationStatus): CertificationStatus {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "complete" || s === "completed") return "Approved";
  if (s === "submitted" || s === "under_review" || s === "in_review") return "Under Review";
  if (s === "rejected" || s === "failed") return "Rejected";
  return "Pending";
}

export const CertificationTimeline: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedPlot,
  plots,
  onSelectPlot,
  syncBackendCertification = false,
}) => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [registrationFormStep, setRegistrationFormStep] =
    useState<RegistrationFormStep>(1);
  const [registrationValidationError, setRegistrationValidationError] =
    useState<string | null>(null);
  const [plotKey, setPlotKey] = useState<string>(selectedPlot?.key || "");
  const [isUploading, setIsUploading] = useState(false);
  const [isGapUploading, setIsGapUploading] = useState<"gap" | "form4b" | null>(
    null,
  );
  const [gapUploadError, setGapUploadError] = useState<string | null>(null);
  const [, setUploadMessage] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    title: string;
    isPdf: boolean;
  } | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isGeneratingRecordBook, setIsGeneratingRecordBook] = useState(false);
  const [, setRecordBookUrl] = useState<string | null>(null);
  const [backendCertification, setBackendCertification] =
    useState<GrapesCertificationRecord | null>(null);
  const [certApiSyncing, setCertApiSyncing] = useState(false);
  const [certApiError, setCertApiError] = useState<string | null>(null);

  // ──────── OCR Upload & Auto-Fill State ────────
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrProgressMessage, setOcrProgressMessage] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrScanResult, setOcrScanResult] = useState<RegistrationOcrResult | null>(null);
  const [ocrSourceName, setOcrSourceName] = useState("");
  const [showOcrReview, setShowOcrReview] = useState(false);
  const [ocrFirstName, setOcrFirstName] = useState("");
  const [ocrLastName, setOcrLastName] = useState("");
  const [ocrNameEdited, setOcrNameEdited] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync internal plotKey with selectedPlot
  useEffect(() => {
    if (selectedPlot?.key) {
      setPlotKey(selectedPlot.key);
    }
  }, [selectedPlot?.key]);

  useEffect(() => {
    setRegistrationFormStep(1);
    setRegistrationValidationError(null);
  }, [plotKey]);

  const currentPlot = useMemo(() => {
    return plots.find((p) => p.key === plotKey) || selectedPlot || plots[0] || null;
  }, [plots, plotKey, selectedPlot]);

  // Read OCR draft if available in sessionStorage
  const ocrDraft = useMemo<GrapeRegistrationOcrDraft | null>(() => {
    try {
      const raw = sessionStorage.getItem(GRAPE_REGISTRATION_OCR_DRAFT_KEY);
      if (!raw) return null;
      return parseGrapeRegistrationOcrDraft(JSON.parse(raw));
    } catch {
      return null;
    }
  }, []);

  // Storage key for persisting timeline status per plot
  const storageKey = useMemo(() => {
    const id = currentPlot?.plotId || currentPlot?.key || "default";
    return `cropeye_grapes_certification_v2_${id}`;
  }, [currentPlot]);

  // Initialize steps state
  const [steps, setSteps] = useState<Record<1 | 2 | 3, TimelineStepState>>(() => {
    return {
      1: {
        stepNumber: 1,
        id: "registration",
        title: "Farm & Plot Registration",
        shortTitle: "Registration",
        subtitle: "GrapeNet farmer and plot land identity",
        status: "Pending",
        isUnlocked: true,
        selectedOptionId: "grapenet-reg",
        options: DEFAULT_OPTIONS_STEP1,
        formData: {},
      },
      2: {
        stepNumber: 2,
        id: "residue",
        title: "Residue & Quality Clearance",
        shortTitle: "Residue Analysis",
        subtitle: "MRL agrochemical testing & lab certification",
        status: "Pending",
        isUnlocked: true,
        selectedOptionId: "residue-mrl",
        options: DEFAULT_OPTIONS_STEP2,
        formData: {},
      },
      3: {
        stepNumber: 3,
        id: "export",
        title: "Export & Phytosanitary",
        shortTitle: "Export Compliance",
        subtitle: "Phytosanitary clearance & harvest log",
        status: "Pending",
        isUnlocked: false,
        selectedOptionId: "phytosanitary",
        options: DEFAULT_OPTIONS_STEP3,
        formData: {},
      },
    };
  });

  // Load saved state or default state for the selected plot
  useEffect(() => {
    if (!currentPlot) return;

    let savedData: any = null;
    try {
      const savedStr = localStorage.getItem(storageKey);
      if (savedStr) savedData = JSON.parse(savedStr);
    } catch (e) {
      console.warn("Could not read saved certification status", e);
    }

    // Default form data pre-filled from plot + OCR draft (Grape Farm Record Book Parts 1–5 + Part 11)
    const defaultStep1Form = {
      // Part 1 – Farmer Information
      farmerFirstName: ocrDraft?.profile.first_name || currentPlot.farmerName.split(" ")[0] || "",
      farmerLastName: ocrDraft?.profile.last_name || currentPlot.farmerName.split(" ").slice(1).join(" ") || "",
      relativeName: ocrDraft?.supplemental.relativeName || "",
      phone: ocrDraft?.profile.phone_number || currentPlot.farmerPhone || "",
      altPhone: "",
      email: "",
      address: ocrDraft?.profile.address || "",
      village: ocrDraft?.plot.village || currentPlot.village || "",
      taluka: ocrDraft?.profile.taluka || currentPlot.taluka || "",
      district: ocrDraft?.profile.district || currentPlot.district || "",
      state: ocrDraft?.profile.state || currentPlot.state || "",
      pinCode: ocrDraft?.plot.pinCode || "",
      aadhaarId: "",
      growerId: "",
      // Part 2 – Farm and Plot Details
      gatNumber: ocrDraft?.plot.gatNumber || currentPlot.gatNumber || "",
      plotLocation: ocrDraft?.plot.plotLocation || ocrDraft?.supplemental.plotLocation || "",
      plotNumber: ocrDraft?.plot.plotNumber || currentPlot.plotLabel || "",
      totalLandArea: "",
      areaAcres: ocrDraft?.plot.areaAcres || String(currentPlot.areaAcres || ""),
      numberOfPlots: "",
      variety: ocrDraft?.plot.variety || currentPlot.variety || "",
      plantingYear: (currentPlot.plantationDate || currentPlot.agro?.plantationDate || "").slice(0, 4),
      vineCount: "",
      irrigationMethod: ocrDraft?.plot.irrigationDetails || currentPlot.irrigationType || "",
      waterSource: "",
      soilType: "",
      registrationNumber: "",
      registrationDate: "",
      registrationValidity: "",
      // Step 4 — GlobalG.A.P. (separate form + upload)
      gapCertificateNumber: "",
      gapCertifyingBody: "",
      gapIssueDate: "",
      gapValidUntil: "",
      gapCertificateScope: "",
      gapUploadName: "",
      gapUploadUrl: "",
      // Step 5 — Form 4b (separate form + upload)
      form4bGgnNumber: "",
      form4bProduct: "",
      form4bHarvestYear: "",
      form4bInspectionDate: "",
      form4bInspector: "",
      form4bResult: "",
      form4bRemarks: "",
      form4bUploadName: "",
      form4bUploadUrl: "",
      // Plantation dates (optional, kept with Form 4b)
      plantationDate: currentPlot.plantationDate || currentPlot.agro?.plantationDate || "",
      foundationPruningDate: currentPlot.pruningFoundationDate || "",
      fruitPruningDate: currentPlot.pruningFruitDate || "",
      budBreakDate: "",
      shootGrowthDate: "",
      floweringDate: "",
      fruitSettingDate: "",
      bunchThinningDate: "",
      berryDevelopmentDate: "",
      otherFieldActivity: "",
      part3Remarks: "",
      // Part 4 + 5 – Fertilizer & Irrigation (merged)
      fertDate: "",
      fertName: "",
      fertQuantity: "",
      fertMethod: "",
      fertPlotArea: "",
      fertOperator: "",
      irrDate: "",
      irrMethod: ocrDraft?.plot.irrigationDetails || currentPlot.irrigationType || "",
      irrDuration: "",
      irrPlot: ocrDraft?.plot.plotNumber || currentPlot.plotLabel || "",
      irrRemarks: "",
      // Part 6 – Pesticide and Plant Protection Record
      pestAppDate: "",
      pestPlotGrapenet: ocrDraft?.plot.plotNumber || currentPlot.plotLabel || "",
      pestProductName: "",
      pestActiveIngredient: "",
      pestManufacturer: "",
      pestBatchLot: "",
      pestTarget: "",
      pestDose: "",
      pestWaterQty: "",
      pestAreaTreated: "",
      pestEquipment: "",
      pestApplicator: "",
      pestPhi: "",
      pestEarliestHarvest: "",
      pestWeather: "",
      pestRemarks: "",
      // Part 11 – Supporting Document Checklist (first 6 registration docs)
      docLandRecord712: "",
      docLandRecord712Remarks: "",
      docFarmPlotLayout: "",
      docFarmPlotLayoutRemarks: "",
      docGrapeNetCertificate: "",
      docGrapeNetCertificateRemarks: "",
      docFieldActivityRecords: "",
      docFieldActivityRecordsRemarks: "",
      docFertilizerPurchaseRecords: "",
      docFertilizerPurchaseRecordsRemarks: "",
      docPesticideRecords: "",
      docPesticideRecordsRemarks: "",
      // Part 10 – Packhouse and Export Traceability (last)
      packhouseNamePart10: "",
      packhouseRegNumber: "",
      packhouseLocation: "",
      packhouseDeliveryDate: "",
      packhouseFarmPlot: ocrDraft?.plot.plotNumber || currentPlot.plotLabel || "",
      harvestLotBatch: "",
      quantityDeliveredKg: "",
      packhouseReceiptRef: "",
      exporterName: "",
      exporterRegDetails: "",
      destinationCountry: "",
      consignmentInvoiceRef: "",
      phytosanitaryCertRef: "",
      otherExportDocRefs: "",
    };

    const defaultStep2Form = {
      labName: "",
      sampleId: "",
      samplingDate: "",
      reportDate: "",
      mrlResult: "",
      testedChemicals: "",
      reviewerName: "",
      labNotes: "",
    };

    const defaultStep3Form = {
      certificateNumber: "",
      apedaLotId: "",
      inspectionDate: "",
      validUntilDate: "",
      certifiedQuantityKg: "",
      packhouseName: "",
      destinationMarket: "",
      inspectorName: "",
    };

    if (savedData && savedData.steps) {
      const savedSteps = savedData.steps as Record<1 | 2 | 3, TimelineStepState>;
      setSteps({
        1: {
          ...savedSteps[1],
          formData: { ...defaultStep1Form, ...(savedSteps[1]?.formData || {}) },
        },
        2: {
          ...savedSteps[2],
          formData: { ...defaultStep2Form, ...(savedSteps[2]?.formData || {}) },
        },
        3: {
          ...savedSteps[3],
          formData: { ...defaultStep3Form, ...(savedSteps[3]?.formData || {}) },
        },
      });
      if (savedData.activeStep) setActiveStep(savedData.activeStep);
    } else {
      setSteps({
        1: {
          stepNumber: 1,
          id: "registration",
          title: "Farm & Plot Registration",
          shortTitle: "Registration",
          subtitle: "GrapeNet farmer and plot land identity",
          status: "Pending",
          isUnlocked: true,
          selectedOptionId: "grapenet-reg",
          options: DEFAULT_OPTIONS_STEP1,
          formData: defaultStep1Form,
        },
        2: {
          stepNumber: 2,
          id: "residue",
          title: "Residue & Quality Clearance",
          shortTitle: "Residue Analysis",
          subtitle: "MRL agrochemical testing & lab certification",
          status: "Pending",
          isUnlocked: true,
          selectedOptionId: "residue-mrl",
          options: DEFAULT_OPTIONS_STEP2,
          formData: defaultStep2Form,
        },
        3: {
          stepNumber: 3,
          id: "export",
          title: "Export & Phytosanitary",
          shortTitle: "Export Compliance",
          subtitle: "Phytosanitary clearance & harvest log",
          status: "Pending",
          isUnlocked: false,
          selectedOptionId: "phytosanitary",
          options: DEFAULT_OPTIONS_STEP3,
          formData: defaultStep3Form,
        },
      });
    }

    // Try fetching existing backend reports for this plot
    if (currentPlot.plotId) {
      const plotIdNum = Number(currentPlot.plotId);
      getGrapesReports(Number.isFinite(plotIdNum) ? plotIdNum : undefined)
        .then((res) => {
          const reports = res?.data;
          if (Array.isArray(reports) && reports.length > 0) {
            setSteps((prev) => {
              const next = { ...prev };
              reports.forEach((rep: any) => {
                if (rep.file_type === "residue" && next[2]) {
                  const opts = next[2].options.map((o) =>
                    o.id === "residue-mrl"
                      ? {
                          ...o,
                          documentUrl: rep.file,
                          documentName: `Backend Residue Report #${rep.id}`,
                          uploadedAt: rep.uploaded_at,
                          status: "Approved" as CertificationStatus,
                        }
                      : o,
                  );
                  next[2] = { ...next[2], options: opts, status: "Approved", isUnlocked: true };
                  if (next[3]) next[3] = { ...next[3], isUnlocked: true };
                } else if (rep.file_type === "variety" && next[1]) {
                  const opts = next[1].options.map((o) =>
                    o.id === "variety-auth"
                      ? {
                          ...o,
                          documentUrl: rep.file,
                          documentName: `Backend Variety Document #${rep.id}`,
                          uploadedAt: rep.uploaded_at,
                          status: "Approved" as CertificationStatus,
                        }
                      : o,
                  );
                  next[1] = { ...next[1], options: opts, status: "Approved" };
                }
              });
              return next;
            });
          }
        })
        .catch(() => {
          // Backend call failure handled gracefully
        });
    }
  }, [currentPlot, storageKey, ocrDraft]);

  // Sync /api/grapes-certification/ — Owner Review Registration only (not OCR, not farmer side)
  useEffect(() => {
    if (!isOpen || !syncBackendCertification || !currentPlot) {
      if (!syncBackendCertification) {
        setBackendCertification(null);
        setCertApiError(null);
        setCertApiSyncing(false);
      }
      return;
    }
    const plotIdNum = resolveBackendPlotId(currentPlot);
    if (plotIdNum == null) {
      setBackendCertification(null);
      setCertApiError(
        "This plot needs a numeric backend plot id to sync grapes-certification.",
      );
      return;
    }

    let cancelled = false;
    setCertApiSyncing(true);
    setCertApiError(null);

    void ensureGrapesCertification(plotIdNum, {
      notes: "",
      createIfMissing: true,
    })
      .then((record) => {
        if (cancelled || !record) return;
        setBackendCertification(record);

        const checklist = record.checklist ?? [];
        setSteps((prev) => {
          const next = { ...prev };
          const overall = mapApiStatusToUi(record.status);

          for (const item of checklist) {
            const docs = item.documents ?? [];
            const latest = docs[docs.length - 1];
            const fileUrl = absolutizeMediaUrl(latest?.file);
            const uploadedOk = item.uploaded || docs.length > 0;

            if (item.file_type === "residue" && next[2]) {
              const opts = next[2].options.map((o) =>
                o.id === "residue-mrl"
                  ? {
                      ...o,
                      documentUrl: fileUrl || o.documentUrl,
                      documentName: latest
                        ? `${item.label} #${latest.id}`
                        : o.documentName,
                      uploadedAt: latest?.uploaded_at || o.uploadedAt,
                      status: (uploadedOk
                        ? "Approved"
                        : o.status) as CertificationStatus,
                    }
                  : o,
              );
              next[2] = {
                ...next[2],
                options: opts,
                status: uploadedOk
                  ? "Approved"
                  : overall === "Under Review"
                    ? "Under Review"
                    : next[2].status,
                isUnlocked: true,
              };
              if (uploadedOk && next[3]) {
                next[3] = { ...next[3], isUnlocked: true };
              }
            }

            if (item.file_type === "variety" && next[1]) {
              const opts = next[1].options.map((o) =>
                o.id === "variety-auth"
                  ? {
                      ...o,
                      documentUrl: fileUrl || o.documentUrl,
                      documentName: latest
                        ? `${item.label} #${latest.id}`
                        : o.documentName,
                      uploadedAt: latest?.uploaded_at || o.uploadedAt,
                      status: (uploadedOk
                        ? "Approved"
                        : o.status) as CertificationStatus,
                    }
                  : o,
              );
              next[1] = {
                ...next[1],
                options: opts,
                status:
                  overall === "Approved" || overall === "Under Review"
                    ? overall
                    : uploadedOk
                      ? next[1].status === "Pending"
                        ? "Under Review"
                        : next[1].status
                      : next[1].status,
              };
            }
          }

          if (overall === "Under Review" || overall === "Approved") {
            next[1] = { ...next[1], status: overall === "Approved" ? "Approved" : next[1].status };
            if (record.documents_complete) {
              next[2] = { ...next[2], status: "Approved", isUnlocked: true };
              next[3] = { ...next[3], isUnlocked: true };
            }
          }

          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Could not sync grapes-certification with the backend.";
        setCertApiError(message);
        setBackendCertification(null);
      })
      .finally(() => {
        if (!cancelled) setCertApiSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, syncBackendCertification, currentPlot?.plotId, currentPlot?.key]);

  // Persist state whenever steps change
  const saveTimelineState = (updatedSteps: Record<1 | 2 | 3, TimelineStepState>) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          plotId: currentPlot?.plotId,
          plotKey: currentPlot?.key,
          steps: updatedSteps,
          activeStep,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch (e) {
      console.warn("Failed to persist certification state", e);
    }
  };

  // Calculate overall progress percentage
  const progressPercent = useMemo(() => {
    let score = 0;
    // Step 1 weight: 33.3%
    if (steps[1].status === "Approved") score += 33.34;
    else if (steps[1].status === "Under Review") score += 20;
    else if (steps[1].status === "Pending") score += 10;

    // Step 2 weight: 33.3%
    if (steps[2].status === "Approved") score += 33.33;
    else if (steps[2].status === "Under Review") score += 20;
    else if (steps[2].status === "Pending") score += 0;

    // Step 3 weight: 33.3%
    if (steps[3].status === "Approved") score += 33.33;
    else if (steps[3].status === "Under Review") score += 20;
    else if (steps[3].status === "Pending") score += 0;

    return Math.min(100, Math.round(score));
  }, [steps]);

  // Handle active option selection within current step
  const currentStep = steps[activeStep];
  const getMissingRegistrationFields = (stepNumber: RegistrationFormStep) =>
    REGISTRATION_REQUIRED_FIELDS[stepNumber]
      .filter(({ key }) => !steps[1].formData[key]?.trim())
      .map(({ label }) => label);
  const canOpenRegistrationStep = (stepNumber: RegistrationFormStep) =>
    REGISTRATION_FORM_STEPS
      .filter((step) => step.number < stepNumber)
      .every((step) => getMissingRegistrationFields(step.number).length === 0);
  const handleRegistrationStepSelect = (stepNumber: RegistrationFormStep) => {
    if (
      stepNumber > registrationFormStep &&
      !canOpenRegistrationStep(stepNumber)
    ) {
      const firstIncompleteStep = REGISTRATION_FORM_STEPS.find(
        (step) =>
          step.number < stepNumber &&
          getMissingRegistrationFields(step.number).length > 0,
      );
      if (firstIncompleteStep) {
        setRegistrationFormStep(firstIncompleteStep.number);
        setRegistrationValidationError(
          `Complete ${firstIncompleteStep.title} before continuing.`,
        );
      }
      return;
    }

    setRegistrationFormStep(stepNumber);
    setRegistrationValidationError(null);
  };
  const activeOption = useMemo(() => {
    return (
      currentStep.options.find((o) => o.id === currentStep.selectedOptionId) ||
      currentStep.options[0]
    );
  }, [currentStep]);

  const handleSelectOption = (optionId: string) => {
    setSteps((prev) => ({
      ...prev,
      [activeStep]: {
        ...prev[activeStep],
        selectedOptionId: optionId,
      },
    }));
  };

  const handleFormFieldChange = (field: string, value: string) => {
    setRegistrationValidationError(null);
    setSteps((prev) => ({
      ...prev,
      [activeStep]: {
        ...prev[activeStep],
        formData: {
          ...prev[activeStep].formData,
          [field]: value,
        },
      },
    }));
  };

  const handleOptionStatusChange = (optionId: string, status: CertificationStatus) => {
    setSteps((prev) => {
      const step = prev[activeStep];
      const updatedOptions = step.options.map((opt) =>
        opt.id === optionId ? { ...opt, status } : opt,
      );

      // Derive step status from options
      let stepStatus: CertificationStatus = "Pending";
      const hasRejected = updatedOptions.some((o) => o.status === "Rejected");
      const hasExpired = updatedOptions.some((o) => o.status === "Expired");
      const hasUnderReview = updatedOptions.some((o) => o.status === "Under Review");
      const allRequiredApproved = updatedOptions
        .filter((o) => o.isRequired)
        .every((o) => o.status === "Approved");

      if (hasRejected) stepStatus = "Rejected";
      else if (hasExpired) stepStatus = "Expired";
      else if (allRequiredApproved) stepStatus = "Approved";
      else if (hasUnderReview) stepStatus = "Under Review";

      // If this step is approved or completed, unlock next step!
      const nextSteps = {
        ...prev,
        [activeStep]: {
          ...step,
          options: updatedOptions,
          status: stepStatus,
        },
      };

      if ((stepStatus === "Approved" || stepStatus === "Under Review") && activeStep < 3) {
        const nextStepNum = (activeStep + 1) as 2 | 3;
        nextSteps[nextStepNum] = {
          ...nextSteps[nextStepNum],
          isUnlocked: true,
        };
      }

      saveTimelineState(nextSteps);
      return nextSteps;
    });

    setSaveToast(`Updated ${activeOption.name} status to ${status}`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  /** Upload GlobalG.A.P. or Form 4b document via /grapse-reports/ (file_type: variety). */
  const handleGapCertificateUpload = async (
    which: "gap" | "form4b",
    file?: File,
  ) => {
    if (!file) return;
    setIsGapUploading(which);
    setGapUploadError(null);
    const nameKey = which === "gap" ? "gapUploadName" : "form4bUploadName";
    const urlKey = which === "gap" ? "gapUploadUrl" : "form4bUploadUrl";
    const label = which === "gap" ? "GlobalG.A.P. certificate" : "Form 4b document";

    try {
      const plotIdNumber = Number(currentPlot?.plotId);
      let uploadedUrl: string | null = null;
      let uploadedToServer = false;

      if (Number.isFinite(plotIdNumber) && plotIdNumber > 0) {
        try {
          const response = await uploadGrapesReport(plotIdNumber, "variety", file);
          uploadedUrl = response?.file || null;
          uploadedToServer = Boolean(uploadedUrl);
        } catch (apiErr) {
          console.warn(`${label} server upload failed, keeping local preview:`, apiErr);
        }
      }

      if (!uploadedUrl) {
        uploadedUrl = URL.createObjectURL(file);
      }

      setSteps((prev) => {
        const next = {
          ...prev,
          1: {
            ...prev[1],
            formData: {
              ...prev[1].formData,
              [nameKey]: file.name,
              [urlKey]: uploadedUrl || "",
            },
          },
        };
        saveTimelineState(next);
        return next;
      });

      setSaveToast(
        uploadedToServer
          ? `${label} "${file.name}" uploaded to server.`
          : `${label} "${file.name}" saved locally (server upload unavailable).`,
      );
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err: any) {
      setGapUploadError(err?.message || `Could not upload ${label}.`);
    } finally {
      setIsGapUploading(null);
    }
  };

  // Handle file upload for active certificate option
  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadMessage("Uploading certificate to server…");

    try {
      const plotIdNumber = Number(currentPlot?.plotId) || 1;
      const fileType = activeStep === 2 ? "residue" : "variety";

      let uploadedUrl: string | null = null;
      try {
        const response = await uploadGrapesReport(plotIdNumber, fileType, file);
        uploadedUrl = response?.file || null;
      } catch (apiErr) {
        console.warn("Backend report upload failed, using local blob preview:", apiErr);
        uploadedUrl = URL.createObjectURL(file);
      }

      setSteps((prev) => {
        const step = prev[activeStep];
        const updatedOptions = step.options.map((opt) =>
          opt.id === activeOption.id
            ? {
                ...opt,
                documentUrl: uploadedUrl || URL.createObjectURL(file),
                documentName: file.name,
                uploadedAt: new Date().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
                status: "Under Review" as CertificationStatus,
              }
            : opt,
        );

        const nextSteps = {
          ...prev,
          [activeStep]: {
            ...step,
            options: updatedOptions,
            status: "Under Review" as CertificationStatus,
          },
        };

        saveTimelineState(nextSteps);
        return nextSteps;
      });

      setUploadMessage(null);
      setSaveToast(`Certificate "${file.name}" uploaded successfully!`);
      setTimeout(() => setSaveToast(null), 3500);
    } catch (err: any) {
      setUploadMessage(err?.message || "File upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Generate official Harvest Record Book PDF for Step 3
  const handleGenerateRecordBook = async () => {
    if (!currentPlot) return;
    const previewWindow = window.open("", "_blank");
    setIsGeneratingRecordBook(true);
    try {
      const registrationDraft: GrapeRegistrationOcrDraft = ocrDraft || {
        profile: {
          first_name: steps[1].formData.farmerFirstName || currentPlot.farmerName.split(" ")[0] || "",
          last_name: steps[1].formData.farmerLastName || currentPlot.farmerName.split(" ").slice(1).join(" ") || "",
          phone_number: steps[1].formData.phone || currentPlot.farmerPhone || "",
          address: steps[1].formData.address || steps[1].formData.village || currentPlot.village || "",
          district: steps[1].formData.district || currentPlot.district || "",
          taluka: steps[1].formData.taluka || currentPlot.taluka || "",
          state: steps[1].formData.state || currentPlot.state || "",
        },
        plot: {
          village: steps[1].formData.village || currentPlot.village || "",
          pinCode: steps[1].formData.pinCode || "",
          gatNumber: steps[1].formData.gatNumber || currentPlot.gatNumber || "",
          plotNumber: steps[1].formData.plotNumber || currentPlot.plotLabel || "",
          variety: steps[1].formData.variety || currentPlot.variety || "",
          areaAcres: steps[1].formData.areaAcres || String(currentPlot.areaAcres || ""),
          plotAge: steps[1].formData.plantingYear || "",
          plotLocation:
            steps[1].formData.plotLocation ||
            `${steps[1].formData.taluka || ""}, ${steps[1].formData.district || ""}`.replace(/^,\s*|,\s*$/g, ""),
          irrigationDetails: steps[1].formData.irrigationMethod || steps[1].formData.irrMethod || "",
          pruningCycles: "",
        },
        supplemental: {
          relativeName: steps[1].formData.relativeName || "",
          plotLocation: steps[1].formData.plotLocation || "",
          areaAcres: steps[1].formData.areaAcres || "",
          pruningCycles: "",
        },
      };

      const recordFields: HarvestRecordBookFields = {
        plannedHarvestDate: steps[3].formData.plannedHarvestDate || "",
        preHarvestInspectionDate: steps[3].formData.inspectionDate || "",
        recordsReviewedBy: steps[2].formData.reviewerName || "",
        residueSampleId: steps[2].formData.sampleId || "",
        residueSamplingDate: steps[2].formData.samplingDate || "",
        laboratoryName: steps[2].formData.labName || "",
        laboratoryReportNumber: steps[2].formData.laboratoryReportNumber || "",
        laboratoryReportDate: steps[2].formData.reportDate || "",
        testResult: steps[2].formData.mrlResult || "",
        correctiveAction: steps[2].formData.correctiveAction || "",
        harvestDate: steps[3].formData.harvestDate || "",
        harvestPlotNumber: steps[1].formData.plotNumber || currentPlot.plotLabel || "",
        harvestLotId: steps[3].formData.apedaLotId || "",
        harvestVariety: steps[1].formData.variety || currentPlot.variety || "",
        harvestQuantityKg: steps[3].formData.certifiedQuantityKg || "",
        harvestSupervisor: steps[3].formData.inspectorName || "",
        totalHarvestedKg: steps[3].formData.totalHarvestedKg || "",
        rejectedQuantityKg: steps[3].formData.rejectedQuantityKg || "",
        quantitySentForPackingKg: steps[3].formData.quantitySentForPackingKg || "",
        declarationDate: steps[3].formData.declarationDate || "",
      };

      const pdfBytes = await createGrapeHarvestRecordBookPdf(registrationDraft, recordFields);
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(pdfBytes).buffer], { type: "application/pdf" }),
      );
      setRecordBookUrl(url);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        setPreviewFile({
          url,
          title: "Grape Farm Harvest Record Book",
          isPdf: true,
        });
      }

      // Attach to Option in Step 3
      setSteps((prev) => {
        const step3 = prev[3];
        const updatedOptions = step3.options.map((opt) =>
          opt.id === "harvest-record-book"
            ? {
                ...opt,
                documentUrl: url,
                documentName: "grape-farm-record-book-completed.pdf",
                uploadedAt: new Date().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
                status: "Approved" as CertificationStatus,
              }
            : opt,
        );

        const nextSteps = {
          ...prev,
          3: {
            ...step3,
            options: updatedOptions,
            status: "Under Review" as CertificationStatus,
          },
        };
        saveTimelineState(nextSteps);
        return nextSteps;
      });

      setSaveToast("15-Page Grape Harvest Record Book created and attached!");
      setTimeout(() => setSaveToast(null), 3500);
    } catch (e: any) {
      previewWindow?.close();
      console.error("PDF generation error:", e);
      setUploadMessage(e?.message || "Could not generate Record Book PDF.");
    } finally {
      setIsGeneratingRecordBook(false);
    }
  };

  // Save current step form details and advance timeline
  const handleSaveAndAdvance = () => {
    setSteps((prev) => {
      const step = prev[activeStep];
      // Mark current step as Approved if forms are populated
      const updatedStep = {
        ...step,
        status: "Approved" as CertificationStatus,
      };

      const nextSteps = {
        ...prev,
        [activeStep]: updatedStep,
      };

      // Enable next step if available
      if (activeStep < 3) {
        const nextStepNum = (activeStep + 1) as 2 | 3;
        nextSteps[nextStepNum] = {
          ...nextSteps[nextStepNum],
          isUnlocked: true,
        };
      }

      saveTimelineState(nextSteps);
      return nextSteps;
    });

    setSaveToast(`Step ${activeStep}: ${currentStep.title} saved & validated!`);
    setTimeout(() => setSaveToast(null), 3000);

    // If step 1 or 2, advance active step
    if (activeStep < 3) {
      setActiveStep((activeStep + 1) as 2 | 3);
      return;
    }

    // Step 3 finalize → PATCH /api/grapes-certification/{id}/ (owner sync only)
    if (!syncBackendCertification) return;

    const certId = backendCertification?.id;
    const plotIdNum = resolveBackendPlotId(currentPlot);
    if (certId == null || plotIdNum == null) {
      if (plotIdNum != null) {
        void ensureGrapesCertification(plotIdNum, { createIfMissing: true })
          .then((created) => {
            if (!created?.id) return;
            return patchGrapesCertification(created.id, {
              status: "submitted",
              notes: "All docs uploaded",
            }).then((updated) => {
              setBackendCertification(updated);
              setSaveToast(
                `Certification #${updated.id} submitted to backend (${updated.status}).`,
              );
              setTimeout(() => setSaveToast(null), 4000);
            });
          })
          .catch((err: unknown) => {
            setCertApiError(
              err instanceof Error
                ? err.message
                : "Failed to submit grapes-certification.",
            );
          });
      }
      return;
    }

    void patchGrapesCertification(certId, {
      status: "submitted",
      notes: "All docs uploaded",
    })
      .then((updated) => {
        setBackendCertification(updated);
        setSaveToast(
          `Certification #${updated.id} submitted to backend (${updated.status}).`,
        );
        setTimeout(() => setSaveToast(null), 4000);
      })
      .catch((err: unknown) => {
        setCertApiError(
          err instanceof Error
            ? err.message
            : "Failed to PATCH grapes-certification.",
        );
      });
  };

  // ──────── OCR Handlers ────────
  const handleOcrFileUpload = async (file?: File) => {
    if (!file) return;
    setOcrError(null);
    setOcrScanResult(null);
    setShowOcrReview(false);
    setOcrSourceName(file.name);
    setIsOcrScanning(true);
    setOcrProgress(0);
    setOcrProgressMessage("Preparing your form…");
    try {
      const result = await scanGrapeRegistrationForm(file, (msg: string, val: number) => {
        setOcrProgressMessage(msg);
        setOcrProgress(val);
      });
      setOcrScanResult(result);
      const nameParts = result.fullName.value.trim().split(/\s+/).filter(Boolean);
      setOcrFirstName(nameParts.shift() ?? "");
      setOcrLastName(nameParts.join(" "));
      setOcrNameEdited(false);
      setShowOcrReview(true);
    } catch (err) {
      setOcrError(
        err instanceof Error
          ? err.message
          : "Could not read this form. Try a clearer PDF or image.",
      );
    } finally {
      setIsOcrScanning(false);
    }
  };

  const updateOcrField = (key: RegistrationOcrFieldKey, value: string) => {
    setOcrScanResult((prev) =>
      prev ? { ...prev, [key]: { ...prev[key], value, manual: true } } : prev,
    );
  };

  const applyOcrToStep1Form = () => {
    if (!ocrScanResult) return;
    try {
      const draft = makeGrapeRegistrationOcrDraft(ocrScanResult, ocrFirstName, ocrLastName);
      // Persist draft to session storage so it's also available for other uses
      sessionStorage.setItem(GRAPE_REGISTRATION_OCR_DRAFT_KEY, JSON.stringify(draft));

      // Auto-fill Step 1 form fields
      setSteps((prev) => ({
        ...prev,
        1: {
          ...prev[1],
          formData: {
            ...prev[1].formData,
            farmerFirstName: draft.profile.first_name || prev[1].formData.farmerFirstName,
            farmerLastName: draft.profile.last_name || prev[1].formData.farmerLastName,
            relativeName: draft.supplemental.relativeName || prev[1].formData.relativeName,
            phone: draft.profile.phone_number || prev[1].formData.phone,
            address: draft.profile.address || prev[1].formData.address,
            district: draft.profile.district || prev[1].formData.district,
            taluka: draft.profile.taluka || prev[1].formData.taluka,
            state: draft.profile.state || prev[1].formData.state,
            village: draft.plot.village || prev[1].formData.village,
            pinCode: draft.plot.pinCode || prev[1].formData.pinCode,
            gatNumber: draft.plot.gatNumber || prev[1].formData.gatNumber,
            plotNumber: draft.plot.plotNumber || prev[1].formData.plotNumber,
            plotLocation: draft.plot.plotLocation || prev[1].formData.plotLocation,
            variety: draft.plot.variety || prev[1].formData.variety,
            areaAcres: draft.plot.areaAcres || prev[1].formData.areaAcres,
            irrigationMethod: draft.plot.irrigationDetails || prev[1].formData.irrigationMethod,
            irrMethod: draft.plot.irrigationDetails || prev[1].formData.irrMethod,
          },
        },
      }));

      setShowOcrReview(false);
      setSaveToast("OCR auto-fill applied to Step 1 registration form! Review and save.");
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      setOcrError("Could not apply OCR details to the form. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <main className="min-h-screen w-full bg-slate-50">
    <div
      className="min-h-screen w-full"
    >
      <section
        aria-labelledby="certification-timeline-title"
        className="relative flex min-h-screen w-full flex-col bg-white"
      >
        {/* ================= Header ================= */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3.5 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  APEDA · GrapeNet Compliance
                </span>
                <span className="text-xs font-semibold text-slate-400">·</span>
                <span className="text-xs font-medium text-slate-500">Export Timeline</span>
              </div>
              <h2
                id="certification-timeline-title"
                className="mt-0.5 truncate text-lg font-bold text-slate-900 sm:text-xl"
              >
                Grapes Certification Timeline
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Plot switcher dropdown */}
            {plots.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Plot:</span>
                <select
                  value={currentPlot?.key || ""}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setPlotKey(nextKey);
                    onSelectPlot?.(nextKey);
                  }}
                  className="bg-transparent font-semibold text-slate-900 outline-none cursor-pointer"
                >
                  {plots.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.plotLabel || p.gatNumber
                        ? `Plot ${p.plotLabel || p.gatNumber}`
                        : p.farmerName}{" "}
                      · {p.variety || "Grape"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Backend certification sync */}
            {certApiSyncing && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing certification…
              </span>
            )}
            {!certApiSyncing && backendCertification && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
                title="Certification details synced"
              >
                API #{backendCertification.id} · {backendCertification.status}
                {backendCertification.documents_complete ? " · docs complete" : ""}
              </span>
            )}
            {certApiError && (
              <span
                className="max-w-[220px] truncate rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900"
                title={certApiError}
              >
                Certification API: {certApiError}
              </span>
            )}

            {/* Overall status badge */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                progressPercent === 100
                  ? STATUS_CONFIG.Approved.badgeClass
                  : STATUS_CONFIG["Under Review"].badgeClass
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  progressPercent === 100 ? "bg-emerald-500" : "bg-amber-500 animate-ping"
                }`}
              />
              {progressPercent === 100 ? "Export Certified (100%)" : `${progressPercent}% In Progress`}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Owner Dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
          </div>
        </header>

        {/* ================= Notification Toast ================= */}
        {saveToast && (
          <div className="absolute top-16 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{saveToast}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
          {/* ================= Step Details Section ================= */}
          <div
            className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${
              activeStep === 1 ? "mx-auto max-w-5xl" : ""
            }`}
          >
            {activeStep !== 1 && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-xs font-bold text-emerald-800">
                    {currentStep.stepNumber}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                    {currentStep.title}
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{currentStep.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Step Status:</span>
                <select
                  value={currentStep.status}
                  onChange={(e) =>
                    handleOptionStatusChange(activeOption.id, e.target.value as CertificationStatus)
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                >
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
            </div>
            )}

            {activeStep === 1 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
                Complete each section in order. Required details are checked before you continue.
              </div>
            )}

            {/* Clickable Certificate Options within this step */}
            <div hidden={activeStep === 1} className="mt-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Clickable Certificate Options:
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {currentStep.options.map((option) => {
                  const isSelected = option.id === activeOption.id;
                  const cfg = STATUS_CONFIG[option.status];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectOption(option.id)}
                      className={`relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-600"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          {option.code}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                          {option.status}
                        </span>
                      </div>
                      <p className="mt-1 font-bold text-slate-900 text-xs sm:text-sm">
                        {option.name}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                        {option.description}
                      </p>
                      {option.documentName && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <FileText className="h-3 w-3" />
                          Attached
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Certificate Action & Upload Panel */}
            <div hidden={activeStep === 1} className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{activeOption.name}</h4>
                  <p className="text-xs text-slate-500">Issuing Authority: {activeOption.authority}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) void handleFileUpload(file);
                      e.currentTarget.value = "";
                    }}
                  />

                  {/* Upload button */}
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {isUploading
                      ? "Uploading…"
                      : activeOption.documentUrl
                        ? "Replace Document"
                        : "Upload Certificate"}
                  </button>

                  {/* Document Preview / Download if attached */}
                  {activeOption.documentUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        const isPdf = activeOption.documentName?.toLowerCase().endsWith(".pdf") || activeOption.documentUrl?.includes(".pdf");
                        setPreviewFile({
                          url: activeOption.documentUrl!,
                          title: activeOption.name,
                          isPdf: Boolean(isPdf),
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-500" />
                      Preview
                    </button>
                  )}

                  {/* Special Button for Step 3: Generate Record Book PDF */}
                  {activeStep === 3 && (
                    <button
                      type="button"
                      disabled={isGeneratingRecordBook}
                      onClick={() => void handleGenerateRecordBook()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      {isGeneratingRecordBook ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileCheck2 className="h-3.5 w-3.5" />
                      )}
                      {isGeneratingRecordBook ? "Creating Record Book…" : "Generate 15-Page Record Book"}
                    </button>
                  )}
                </div>
              </div>

              {/* Missing Certificate Banner */}
              {!activeOption.documentUrl && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      <b>Missing Certificate:</b> No digital copy has been uploaded for {activeOption.name}. Upload now to complete validation.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-bold text-amber-900 underline hover:text-amber-950 shrink-0 ml-2"
                  >
                    Upload Now
                  </button>
                </div>
              )}

              {/* Attached Document Summary */}
              {activeOption.documentUrl && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      <b>Uploaded Document:</b> {activeOption.documentName || "certificate.pdf"} · Verified on {activeOption.uploadedAt || "recent"}
                    </span>
                  </div>
                  <a
                    href={activeOption.documentUrl}
                    download={activeOption.documentName || "certificate.pdf"}
                    className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline shrink-0 ml-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              )}
            </div>

            {/* OCR lives on Owner Location + Farmer Dashboard — not on this registration page */}

            {/* ================= View / Edit Form Details ================= */}
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {activeStep === 1
                    ? "Registration Form"
                    : `Step ${activeStep} Form Details & Verifications:`}
                    </h4>
                <span className="text-xs text-slate-500">
                  {activeStep === 1
                    ? "Complete required fields before moving to the next section"
                    : "Edit fields to update compliance record"}
                </span>
                  </div>

              {activeStep === 1 && (
                <nav
                  aria-label="Registration form steps"
                  className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 py-5 sm:px-6"
                >
                  <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                    Step {registrationFormStep} of 8
                  </p>
                  <div className="relative mt-4 min-w-[960px]">
                    <div className="absolute left-[6.25%] right-[6.25%] top-4 h-0.5 bg-slate-200" />
                    <div
                      className="absolute left-[6.25%] top-4 h-0.5 bg-emerald-600 transition-all"
                      style={{
                        width: `${((registrationFormStep - 1) / 7) * 87.5}%`,
                      }}
                    />
                    <ol className="relative flex justify-between">
                      {REGISTRATION_FORM_STEPS.map((step) => {
                        const isCurrent = registrationFormStep === step.number;
                        const isComplete = step.number < registrationFormStep;
                        const isLocked =
                          step.number > registrationFormStep &&
                          !canOpenRegistrationStep(step.number);
                        return (
                          <li key={step.number} className="w-[12.5%]">
                    <button
                      type="button"
                              aria-current={isCurrent ? "step" : undefined}
                              disabled={isLocked}
                              title={
                                isLocked
                                  ? "Complete the previous registration section first"
                                  : undefined
                              }
                              onClick={() => handleRegistrationStepSelect(step.number)}
                              className="group flex w-full flex-col items-center gap-2 text-center disabled:cursor-not-allowed"
                            >
                              <span
                                className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                                  isCurrent
                                    ? "border-emerald-600 bg-emerald-600 text-white ring-4 ring-emerald-100"
                                    : isComplete
                                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-slate-100 text-slate-500 group-hover:border-emerald-300"
                                } ${isLocked ? "opacity-45" : ""}`}
                              >
                                {String(step.number).padStart(2, "0")}
                              </span>
                              <span
                                className={`max-w-24 text-[11px] font-semibold leading-tight ${
                                  isCurrent ? "text-emerald-800" : "text-slate-500"
                                }`}
                              >
                                {step.title}
                              </span>
                      </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </nav>
              )}

              {activeStep === 1 && registrationValidationError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                >
                  {registrationValidationError}
                  </div>
                )}

              {/* Form 1: Grape Farm Record Book — Parts 1–5 + Part 11 */}
              {activeStep === 1 && (
                <div className="space-y-5">
                  {/* PART 1 */}
                  <section hidden={registrationFormStep !== 1} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      1. Farmer Information
                    </h5>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Farmer First Name</span>
                        <input type="text" value={currentStep.formData.farmerFirstName || ""} onChange={(e) => handleFormFieldChange("farmerFirstName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Farmer Last Name</span>
                        <input type="text" value={currentStep.formData.farmerLastName || ""} onChange={(e) => handleFormFieldChange("farmerLastName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                        <span className="text-xs font-medium text-slate-600">Father&apos;s / Husband&apos;s Name</span>
                        <input type="text" value={currentStep.formData.relativeName || ""} onChange={(e) => handleFormFieldChange("relativeName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                        <span className="text-xs font-medium text-slate-600">Mobile Number</span>
                        <input type="text" value={currentStep.formData.phone || ""} onChange={(e) => handleFormFieldChange("phone", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                        <span className="text-xs font-medium text-slate-600">Alternate Mobile</span>
                        <input type="text" value={currentStep.formData.altPhone || ""} onChange={(e) => handleFormFieldChange("altPhone", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Email Address</span>
                        <input type="email" value={currentStep.formData.email || ""} onChange={(e) => handleFormFieldChange("email", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">Full Postal Address</span>
                        <input type="text" value={currentStep.formData.address || ""} onChange={(e) => handleFormFieldChange("address", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Village</span>
                        <input type="text" value={currentStep.formData.village || ""} onChange={(e) => handleFormFieldChange("village", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                        <span className="text-xs font-medium text-slate-600">Taluka</span>
                        <input type="text" value={currentStep.formData.taluka || ""} onChange={(e) => handleFormFieldChange("taluka", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">District</span>
                        <input type="text" value={currentStep.formData.district || ""} onChange={(e) => handleFormFieldChange("district", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">State</span>
                        <input type="text" value={currentStep.formData.state || ""} onChange={(e) => handleFormFieldChange("state", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">PIN Code</span>
                        <input type="text" value={currentStep.formData.pinCode || ""} onChange={(e) => handleFormFieldChange("pinCode", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Aadhaar / Other ID</span>
                        <input type="text" value={currentStep.formData.aadhaarId || ""} onChange={(e) => handleFormFieldChange("aadhaarId", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Farmer / Grower ID</span>
                        <input type="text" value={currentStep.formData.growerId || ""} onChange={(e) => handleFormFieldChange("growerId", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                    </div>
                  </section>

                  {/* PART 2 */}
                  <section hidden={registrationFormStep !== 2} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      2. Farm and Plot Details
                    </h5>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Survey / Gat Number</span>
                        <input type="text" value={currentStep.formData.gatNumber || ""} onChange={(e) => handleFormFieldChange("gatNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Plot Number / Label</span>
                        <input type="text" value={currentStep.formData.plotNumber || ""} onChange={(e) => handleFormFieldChange("plotNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-1">
                        <span className="text-xs font-medium text-slate-600">Village and Plot Location</span>
                        <input type="text" value={currentStep.formData.plotLocation || ""} onChange={(e) => handleFormFieldChange("plotLocation", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Total Land Area (ha / acres)</span>
                        <input type="text" value={currentStep.formData.totalLandArea || ""} onChange={(e) => handleFormFieldChange("totalLandArea", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Area under Grapes (acres)</span>
                        <input type="number" step="0.1" value={currentStep.formData.areaAcres || ""} onChange={(e) => handleFormFieldChange("areaAcres", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Number of Grape Plots</span>
                        <input type="text" value={currentStep.formData.numberOfPlots || ""} onChange={(e) => handleFormFieldChange("numberOfPlots", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Grape Variety</span>
                        <select value={currentStep.formData.variety || ""} onChange={(e) => handleFormFieldChange("variety", e.target.value)} className={`${STEP1_FIELD_INPUT_CLASS} bg-white`}>
                      <option value="">Select grape variety</option>
                      {Object.entries(GRAPES_VARIETY_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                        <span className="text-xs font-medium text-slate-600">Planting Year</span>
                        <input type="text" value={currentStep.formData.plantingYear || ""} onChange={(e) => handleFormFieldChange("plantingYear", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Approximate Number of Vines</span>
                        <input type="text" value={currentStep.formData.vineCount || ""} onChange={(e) => handleFormFieldChange("vineCount", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Irrigation Method</span>
                        <input type="text" value={currentStep.formData.irrigationMethod || ""} onChange={(e) => handleFormFieldChange("irrigationMethod", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Water Source</span>
                        <input type="text" value={currentStep.formData.waterSource || ""} onChange={(e) => handleFormFieldChange("waterSource", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Soil Type</span>
                        <input type="text" value={currentStep.formData.soilType || ""} onChange={(e) => handleFormFieldChange("soilType", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">GrapeNet Registration Number</span>
                        <input type="text" value={currentStep.formData.registrationNumber || ""} onChange={(e) => handleFormFieldChange("registrationNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Registration Date</span>
                        <input type="date" value={currentStep.formData.registrationDate || ""} onChange={(e) => handleFormFieldChange("registrationDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Registration Validity / Season</span>
                        <input type="text" value={currentStep.formData.registrationValidity || ""} onChange={(e) => handleFormFieldChange("registrationValidity", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">GAP / GlobalG.A.P. Certificate Number</span>
                        <input type="text" value={currentStep.formData.gapCertificateNumber || ""} onChange={(e) => handleFormFieldChange("gapCertificateNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                    </div>
                  </section>

                  {/* Step 5 — Fertilizer & Irrigation (after Form 4b) */}
                  <section hidden={registrationFormStep !== 5} className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                      <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Part 4 — Fertilizer and Nutrient Application Record
                      </h5>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Date</span>
                          <input type="date" value={currentStep.formData.fertDate || ""} onChange={(e) => handleFormFieldChange("fertDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Fertilizer / Input Name</span>
                          <input type="text" value={currentStep.formData.fertName || ""} onChange={(e) => handleFormFieldChange("fertName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Quantity / Dose</span>
                          <input type="text" value={currentStep.formData.fertQuantity || ""} onChange={(e) => handleFormFieldChange("fertQuantity", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Application Method</span>
                          <input type="text" value={currentStep.formData.fertMethod || ""} onChange={(e) => handleFormFieldChange("fertMethod", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Plot / Area</span>
                          <input type="text" value={currentStep.formData.fertPlotArea || ""} onChange={(e) => handleFormFieldChange("fertPlotArea", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Operator</span>
                          <input type="text" value={currentStep.formData.fertOperator || ""} onChange={(e) => handleFormFieldChange("fertOperator", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                      <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Part 5 — Irrigation Record
                      </h5>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Date</span>
                          <input type="date" value={currentStep.formData.irrDate || ""} onChange={(e) => handleFormFieldChange("irrDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Irrigation Method</span>
                          <input type="text" value={currentStep.formData.irrMethod || ""} onChange={(e) => handleFormFieldChange("irrMethod", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Duration / Water Quantity</span>
                          <input type="text" value={currentStep.formData.irrDuration || ""} onChange={(e) => handleFormFieldChange("irrDuration", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Plot</span>
                          <input type="text" value={currentStep.formData.irrPlot || ""} onChange={(e) => handleFormFieldChange("irrPlot", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-slate-600">Remarks</span>
                          <input type="text" value={currentStep.formData.irrRemarks || ""} onChange={(e) => handleFormFieldChange("irrRemarks", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                      </div>
                    </div>
                  </section>

                  {/* Step 3 — GlobalG.A.P. (separate form + upload) */}
                  <section hidden={registrationFormStep !== 3} className="rounded-xl border border-emerald-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      GlobalG.A.P. Certificate Form
                    </h5>
                    <p className="mb-3 text-[11px] text-slate-500">
                      Separate GlobalG.A.P. form — fill certificate fields and upload the certificate file.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">GlobalG.A.P. certificate number</span>
                        <input type="text" value={currentStep.formData.gapCertificateNumber || ""} onChange={(e) => handleFormFieldChange("gapCertificateNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Certifying body</span>
                        <input type="text" value={currentStep.formData.gapCertifyingBody || ""} onChange={(e) => handleFormFieldChange("gapCertifyingBody", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} placeholder="e.g. Control Union / SGS" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Certificate scope</span>
                        <input type="text" value={currentStep.formData.gapCertificateScope || ""} onChange={(e) => handleFormFieldChange("gapCertificateScope", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} placeholder="e.g. Fresh fruit — grapes" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Issue date</span>
                        <input type="date" value={currentStep.formData.gapIssueDate || ""} onChange={(e) => handleFormFieldChange("gapIssueDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Valid until</span>
                        <input type="date" value={currentStep.formData.gapValidUntil || ""} onChange={(e) => handleFormFieldChange("gapValidUntil", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">Upload GlobalG.A.P. certificate (PDF or image)</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
                            {isGapUploading === "gap" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            {isGapUploading === "gap"
                              ? "Uploading certificate…"
                              : currentStep.formData.gapUploadName
                                ? "Replace certificate file"
                                : "Upload GlobalG.A.P. certificate"}
                    <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="sr-only"
                              disabled={isGapUploading !== null}
                              onChange={(e) => {
                                const f = e.currentTarget.files?.[0];
                                void handleGapCertificateUpload("gap", f);
                                e.currentTarget.value = "";
                              }}
                    />
                  </label>
                          {currentStep.formData.gapUploadName && (
                            <span className="text-xs text-slate-600">
                              File: <b>{currentStep.formData.gapUploadName}</b>
                            </span>
                          )}
                          {currentStep.formData.gapUploadUrl && (
                            <a
                              href={currentStep.formData.gapUploadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View / download
                            </a>
                          )}
                        </div>
                        {gapUploadError && registrationFormStep === 3 && (
                          <p className="mt-2 text-xs text-red-700">{gapUploadError}</p>
                        )}
                      </label>
                    </div>
                  </section>

                  {/* Step 4 — Form 4b (separate form + upload) */}
                  <section hidden={registrationFormStep !== 4} className="space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-white p-3 sm:p-4">
                      <h5 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-900">
                        Form 4b — Producer / Inspection Record
                      </h5>
                      <p className="mb-3 text-[11px] text-slate-500">
                        Separate Form 4b — fill the fields below and upload the Form 4b supporting document.
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <label className="block">
                          <span className="text-xs font-medium text-slate-600">GGN / producer number</span>
                          <input type="text" value={currentStep.formData.form4bGgnNumber || ""} onChange={(e) => handleFormFieldChange("form4bGgnNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Product / crop</span>
                          <input type="text" value={currentStep.formData.form4bProduct || ""} onChange={(e) => handleFormFieldChange("form4bProduct", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Harvest year / season</span>
                          <input type="text" value={currentStep.formData.form4bHarvestYear || ""} onChange={(e) => handleFormFieldChange("form4bHarvestYear", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Inspection date</span>
                          <input type="date" value={currentStep.formData.form4bInspectionDate || ""} onChange={(e) => handleFormFieldChange("form4bInspectionDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Inspector / auditor</span>
                          <input type="text" value={currentStep.formData.form4bInspector || ""} onChange={(e) => handleFormFieldChange("form4bInspector", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Inspection result / status</span>
                          <input type="text" value={currentStep.formData.form4bResult || ""} onChange={(e) => handleFormFieldChange("form4bResult", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} placeholder="e.g. Compliant" />
                        </label>
                        <label className="block sm:col-span-2 md:col-span-3">
                          <span className="text-xs font-medium text-slate-600">Remarks</span>
                          <input type="text" value={currentStep.formData.form4bRemarks || ""} onChange={(e) => handleFormFieldChange("form4bRemarks", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block sm:col-span-2 md:col-span-3">
                          <span className="text-xs font-medium text-slate-600">Upload Form 4b document (PDF or image)</span>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-600 bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                              {isGapUploading === "form4b" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                              {isGapUploading === "form4b"
                                ? "Uploading Form 4b…"
                                : currentStep.formData.form4bUploadName
                                  ? "Replace Form 4b file"
                                  : "Upload Form 4b document"}
                    <input
                                type="file"
                                accept="application/pdf,image/*"
                                className="sr-only"
                                disabled={isGapUploading !== null}
                                onChange={(e) => {
                                  const f = e.currentTarget.files?.[0];
                                  void handleGapCertificateUpload("form4b", f);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </label>
                            {currentStep.formData.form4bUploadName && (
                              <span className="text-xs text-slate-600">
                                File: <b>{currentStep.formData.form4bUploadName}</b>
                              </span>
                            )}
                            {currentStep.formData.form4bUploadUrl && (
                              <a
                                href={currentStep.formData.form4bUploadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View / download
                              </a>
                            )}
                          </div>
                          {gapUploadError && registrationFormStep === 4 && (
                            <p className="mt-2 text-xs text-red-700">{gapUploadError}</p>
                          )}
                        </label>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                      <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Plantation and pruning dates (optional)
                      </h5>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Planting Date</span>
                          <input type="date" value={currentStep.formData.plantationDate || ""} onChange={(e) => handleFormFieldChange("plantationDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Foundation Pruning Date</span>
                          <input type="date" value={currentStep.formData.foundationPruningDate || ""} onChange={(e) => handleFormFieldChange("foundationPruningDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Fruit Pruning Date</span>
                          <input type="date" value={currentStep.formData.fruitPruningDate || ""} onChange={(e) => handleFormFieldChange("fruitPruningDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                        </label>
                      </div>
                    </div>
                  </section>

                  {/* Step 6 — Part 6 Pesticide */}
                  <section hidden={registrationFormStep !== 6} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Part 6 — Pesticide and Plant Protection Record
                    </h5>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Application date and time</span>
                        <input type="datetime-local" value={currentStep.formData.pestAppDate || ""} onChange={(e) => handleFormFieldChange("pestAppDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Plot / GrapeNet number</span>
                        <input type="text" value={currentStep.formData.pestPlotGrapenet || ""} onChange={(e) => handleFormFieldChange("pestPlotGrapenet", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Trade / product name</span>
                        <input type="text" value={currentStep.formData.pestProductName || ""} onChange={(e) => handleFormFieldChange("pestProductName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Active ingredient</span>
                        <input type="text" value={currentStep.formData.pestActiveIngredient || ""} onChange={(e) => handleFormFieldChange("pestActiveIngredient", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Manufacturer</span>
                        <input type="text" value={currentStep.formData.pestManufacturer || ""} onChange={(e) => handleFormFieldChange("pestManufacturer", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Batch / lot number</span>
                        <input type="text" value={currentStep.formData.pestBatchLot || ""} onChange={(e) => handleFormFieldChange("pestBatchLot", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Target pest or disease</span>
                        <input type="text" value={currentStep.formData.pestTarget || ""} onChange={(e) => handleFormFieldChange("pestTarget", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Dose and unit</span>
                        <input type="text" value={currentStep.formData.pestDose || ""} onChange={(e) => handleFormFieldChange("pestDose", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Water quantity used</span>
                        <input type="text" value={currentStep.formData.pestWaterQty || ""} onChange={(e) => handleFormFieldChange("pestWaterQty", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Area treated</span>
                        <input type="text" value={currentStep.formData.pestAreaTreated || ""} onChange={(e) => handleFormFieldChange("pestAreaTreated", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Equipment used</span>
                        <input type="text" value={currentStep.formData.pestEquipment || ""} onChange={(e) => handleFormFieldChange("pestEquipment", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Applicator name</span>
                        <input type="text" value={currentStep.formData.pestApplicator || ""} onChange={(e) => handleFormFieldChange("pestApplicator", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Pre-harvest interval (PHI)</span>
                        <input type="text" value={currentStep.formData.pestPhi || ""} onChange={(e) => handleFormFieldChange("pestPhi", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Earliest harvest date</span>
                        <input type="date" value={currentStep.formData.pestEarliestHarvest || ""} onChange={(e) => handleFormFieldChange("pestEarliestHarvest", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-medium text-slate-600">Weather / field conditions</span>
                        <input type="text" value={currentStep.formData.pestWeather || ""} onChange={(e) => handleFormFieldChange("pestWeather", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">Remarks / supporting invoice reference</span>
                        <input type="text" value={currentStep.formData.pestRemarks || ""} onChange={(e) => handleFormFieldChange("pestRemarks", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                    </div>
                  </section>

                  {/* Step 7 — Part 11 Documents */}
                  <section hidden={registrationFormStep !== 7} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Part 11 — Supporting Document Checklist
                    </h5>
                    <p className="mb-3 text-[11px] text-slate-500">
                      Tick each item when available or applicable (from Grape Farm Record Book).
                    </p>
                    <div className="space-y-2">
                      {PART11_CHECKLIST_FIELDS.map((doc) => (
                        <div
                          key={doc.key}
                          className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center"
                        >
                          <label className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-700">{doc.label}</span>
                            <select
                              value={currentStep.formData[doc.key] || ""}
                              onChange={(e) => handleFormFieldChange(doc.key, e.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                              aria-label={`${doc.label} availability`}
                            >
                              <option value="">Select availability</option>
                              <option value="yes">Available</option>
                              <option value="no">Not available</option>
                            </select>
                          </label>
                    <input
                            type="text"
                            placeholder="Remarks / date"
                            value={currentStep.formData[doc.remarksField] || ""}
                            onChange={(e) => handleFormFieldChange(doc.remarksField, e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 sm:w-56"
                          />
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Step 8 — Part 10 Packhouse (last) */}
                  <section hidden={registrationFormStep !== 8} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Part 10 — Packhouse and Export Traceability
                    </h5>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Registered packhouse name</span>
                        <input type="text" value={currentStep.formData.packhouseNamePart10 || ""} onChange={(e) => handleFormFieldChange("packhouseNamePart10", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Packhouse registration number</span>
                        <input type="text" value={currentStep.formData.packhouseRegNumber || ""} onChange={(e) => handleFormFieldChange("packhouseRegNumber", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Packhouse location</span>
                        <input type="text" value={currentStep.formData.packhouseLocation || ""} onChange={(e) => handleFormFieldChange("packhouseLocation", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Date of delivery to packhouse</span>
                        <input type="date" value={currentStep.formData.packhouseDeliveryDate || ""} onChange={(e) => handleFormFieldChange("packhouseDeliveryDate", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Farm / GrapeNet plot number</span>
                        <input type="text" value={currentStep.formData.packhouseFarmPlot || ""} onChange={(e) => handleFormFieldChange("packhouseFarmPlot", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Harvest lot / batch number</span>
                        <input type="text" value={currentStep.formData.harvestLotBatch || ""} onChange={(e) => handleFormFieldChange("harvestLotBatch", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Quantity delivered (kg)</span>
                        <input type="text" value={currentStep.formData.quantityDeliveredKg || ""} onChange={(e) => handleFormFieldChange("quantityDeliveredKg", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Packhouse receipt / lot reference</span>
                        <input type="text" value={currentStep.formData.packhouseReceiptRef || ""} onChange={(e) => handleFormFieldChange("packhouseReceiptRef", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Exporter name</span>
                        <input type="text" value={currentStep.formData.exporterName || ""} onChange={(e) => handleFormFieldChange("exporterName", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Exporter registration details</span>
                        <input type="text" value={currentStep.formData.exporterRegDetails || ""} onChange={(e) => handleFormFieldChange("exporterRegDetails", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Destination country in Europe</span>
                        <input type="text" value={currentStep.formData.destinationCountry || ""} onChange={(e) => handleFormFieldChange("destinationCountry", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Consignment / invoice reference</span>
                        <input type="text" value={currentStep.formData.consignmentInvoiceRef || ""} onChange={(e) => handleFormFieldChange("consignmentInvoiceRef", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Phytosanitary certificate reference</span>
                        <input type="text" value={currentStep.formData.phytosanitaryCertRef || ""} onChange={(e) => handleFormFieldChange("phytosanitaryCertRef", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                      </label>
                      <label className="block sm:col-span-2 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">Other export document references</span>
                        <input type="text" value={currentStep.formData.otherExportDocRefs || ""} onChange={(e) => handleFormFieldChange("otherExportDocRefs", e.target.value)} className={STEP1_FIELD_INPUT_CLASS} />
                  </label>
                    </div>
                  </section>
                </div>
              )}

              {/* Form 2: Residue & MRL Testing Details */}
              {activeStep === 2 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Accredited Testing Laboratory</span>
                    <input
                      type="text"
                      value={currentStep.formData.labName || ""}
                      onChange={(e) => handleFormFieldChange("labName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Lab Sample ID</span>
                    <input
                      type="text"
                      value={currentStep.formData.sampleId || ""}
                      onChange={(e) => handleFormFieldChange("sampleId", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Sampling Date</span>
                    <input
                      type="date"
                      value={currentStep.formData.samplingDate || ""}
                      onChange={(e) => handleFormFieldChange("samplingDate", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Report Issuance Date</span>
                    <input
                      type="date"
                      value={currentStep.formData.reportDate || ""}
                      onChange={(e) => handleFormFieldChange("reportDate", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Residue Test Result</span>
                    <select
                      value={currentStep.formData.mrlResult || ""}
                      onChange={(e) => handleFormFieldChange("mrlResult", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white font-semibold text-emerald-800"
                    >
                      <option value="">Select residue test result</option>
                      <option value="Pass · Compliant with EU MRL">Pass · Compliant with EU / APEDA MRL</option>
                      <option value="In Progress · Laboratory Testing">In Progress · Laboratory Testing</option>
                      <option value="Fail · Exceeds Maximum Residue Limit">Fail · Exceeds Maximum Residue Limit</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Active Chemical Residues Checked</span>
                    <input
                      type="text"
                      value={currentStep.formData.testedChemicals || ""}
                      onChange={(e) => handleFormFieldChange("testedChemicals", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Reviewing Agronomist</span>
                    <input
                      type="text"
                      value={currentStep.formData.reviewerName || ""}
                      onChange={(e) => handleFormFieldChange("reviewerName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                </div>
              )}

              {/* Form 3: Export & Phytosanitary Compliance Details */}
              {activeStep === 3 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Phytosanitary Certificate No.</span>
                    <input
                      type="text"
                      value={currentStep.formData.certificateNumber || ""}
                      onChange={(e) => handleFormFieldChange("certificateNumber", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono font-bold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">APEDA GrapeNet Lot ID</span>
                    <input
                      type="text"
                      value={currentStep.formData.apedaLotId || ""}
                      onChange={(e) => handleFormFieldChange("apedaLotId", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Certified Harvest Quantity (Kg)</span>
                    <input
                      type="number"
                      value={currentStep.formData.certifiedQuantityKg || ""}
                      onChange={(e) => handleFormFieldChange("certifiedQuantityKg", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-bold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Inspection &amp; Clearance Date</span>
                    <input
                      type="date"
                      value={currentStep.formData.inspectionDate || ""}
                      onChange={(e) => handleFormFieldChange("inspectionDate", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Valid Until / Expiry Date</span>
                    <input
                      type="date"
                      value={currentStep.formData.validUntilDate || ""}
                      onChange={(e) => handleFormFieldChange("validUntilDate", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Target Destination Market</span>
                    <input
                      type="text"
                      value={currentStep.formData.destinationMarket || ""}
                      onChange={(e) => handleFormFieldChange("destinationMarket", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Packhouse Name &amp; License</span>
                    <input
                      type="text"
                      value={currentStep.formData.packhouseName || ""}
                      onChange={(e) => handleFormFieldChange("packhouseName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Plant Protection Inspector</span>
                    <input
                      type="text"
                      value={currentStep.formData.inspectorName || ""}
                      onChange={(e) => handleFormFieldChange("inspectorName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= Footer ================= */}
        <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeStep === 1 && registrationFormStep === 1}
              onClick={() => {
                if (activeStep === 1 && registrationFormStep > 1) {
                  setRegistrationFormStep((registrationFormStep - 1) as RegistrationFormStep);
                  setRegistrationValidationError(null);
                } else if (activeStep > 1) {
                  setActiveStep((activeStep - 1) as 1 | 2);
                }
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400">
              {activeStep === 1
                ? `Registration ${registrationFormStep} of 8`
                : `Step ${activeStep} of 3`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeStep === 1) {
                  const missingFields =
                    getMissingRegistrationFields(registrationFormStep);
                  if (missingFields.length > 0) {
                    setRegistrationValidationError(
                      `Complete the required fields before continuing: ${missingFields.join(", ")}.`,
                    );
                    return;
                  }

                  setRegistrationValidationError(null);
                  if (registrationFormStep < 8) {
                    setRegistrationFormStep(
                      (registrationFormStep + 1) as RegistrationFormStep,
                    );
                    return;
                  }
                }

                handleSaveAndAdvance();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              {activeStep === 1 && registrationFormStep < 8 ? (
                <>
                  Next Registration Section
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                <>
              <Check className="h-4 w-4" />
              {activeStep === 3
                ? "Finalize All & Save Certification"
                : `Save & Proceed to Step ${activeStep + 1}`}
                </>
              )}
            </button>
          </div>
        </footer>

        {/* ================= OCR Review Modal (Inside Timeline) ================= */}
        {showOcrReview && ocrScanResult && (
          <div
            className="fixed inset-0 z-[1000100] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowOcrReview(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="ocr-review-title"
              className="my-auto max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                <div>
                  <div className="flex items-center gap-2 text-blue-700">
                    <ScanLine className="h-5 w-5" />
                    <span className="text-xs font-semibold uppercase tracking-wide">OCR Auto-Fill Review</span>
                  </div>
                  <h2 id="ocr-review-title" className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
                    Check the details read from your form
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 break-all max-w-2xl">
                    {ocrSourceName} · Scanned in this browser — document not sent to any server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOcrReview(false)}
                  aria-label="Close OCR review"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="space-y-4 px-4 py-4 sm:px-6">
                {/* Low-confidence warning */}
                {(() => {
                  const missingCount = OCR_FIELD_KEYS.filter((k) => !ocrScanResult[k].value.trim()).length;
                  const lowConfCount = OCR_FIELD_KEYS.filter(
                    (k) => ocrScanResult[k].value.trim() && !ocrScanResult[k].manual && ocrScanResult[k].confidence < 65,
                  ).length;
                  if (missingCount === 0 && lowConfCount === 0) return null;
                  return (
                    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        {missingCount > 0 && `${missingCount} field${missingCount === 1 ? " is" : "s are"} blank — OCR did not detect a value. `}
                        {lowConfCount > 0 && `${lowConfCount} field${lowConfCount === 1 ? " has" : "s have"} low confidence. `}
                        Review and correct before applying.
                      </p>
                    </div>
                  );
                })()}

                {/* Scanned fields grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {OCR_FIELD_KEYS.map((key) => {
                    const field = ocrScanResult[key];
                    const needsReview =
                      !field.value.trim() || (!field.manual && field.confidence < 65);
                    const isLong = ["address", "plotLocation", "irrigationDetails"].includes(key);
                    return (
                      <label key={key} className="block min-w-0">
                        <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-700">
                          <span>{OCR_FIELD_LABELS[key]}</span>
                          {field.value.trim() ? (
                            <span className={`text-[11px] ${needsReview ? "text-amber-700" : "text-emerald-700"}`}>
                              {field.manual
                                ? "Manually edited"
                                : needsReview
                                ? `Review · ${field.confidence}%`
                                : `${field.confidence}% confidence`}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700">Not detected</span>
                          )}
                        </span>
                        {isLong ? (
                          <textarea
                            rows={2}
                            value={field.value}
                            placeholder="Not detected — enter manually if available"
                            onChange={(e) => updateOcrField(key, e.target.value)}
                            className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 ${
                              needsReview ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
                            }`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={field.value}
                            placeholder="Not detected — enter manually if available"
                            onChange={(e) => updateOcrField(key, e.target.value)}
                            className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 ${
                              needsReview ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
                            }`}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>

                {/* Name split verification */}
                <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <h3 className="text-sm font-semibold text-amber-950">CropEye name fields — verify the suggested split</h3>
                  <p className="mt-1 text-xs text-amber-900">
                    The form has one full-name field. CropEye needs first and last names separately.
                    Check this split and correct it before applying.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700">First name</span>
                      <input
                        value={ocrFirstName}
                        onChange={(e) => { setOcrFirstName(e.target.value); setOcrNameEdited(true); }}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700">Last name</span>
                      <input
                        value={ocrLastName}
                        onChange={(e) => { setOcrLastName(e.target.value); setOcrNameEdited(true); }}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-amber-900" role="status">
                    {ocrNameEdited ? "Name split manually reviewed." : "Suggested from the full name; please verify."}
                  </p>
                </section>
              </div>

              <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={() => setShowOcrReview(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyOcrToStep1Form}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Sparkles className="h-4 w-4" />
                  Apply Auto-Fill to Step 1 Form
                </button>
              </footer>
            </section>
          </div>
        )}

        {/* ================= Document Preview Modal ================= */}
        {previewFile && (
          <div
            className="fixed inset-0 z-[1000050] flex items-center justify-center bg-slate-950/80 p-4"
            role="presentation"
            onClick={() => setPreviewFile(null)}
          >
            <div
              className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-bold text-slate-900">{previewFile.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="h-[70vh] w-full overflow-auto bg-slate-100 p-2 flex items-center justify-center">
                {previewFile.isPdf ? (
                  <iframe
                    src={previewFile.url}
                    title={previewFile.title}
                    className="h-full w-full rounded border border-slate-200"
                  />
                ) : (
                  <img
                    src={previewFile.url}
                    alt={previewFile.title}
                    className="max-h-full max-w-full object-contain rounded shadow"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
    </main>
  );
};

export default CertificationTimeline;
