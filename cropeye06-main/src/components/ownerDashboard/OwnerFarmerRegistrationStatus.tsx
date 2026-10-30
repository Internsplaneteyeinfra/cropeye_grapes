import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, XCircle } from "lucide-react";
import type { OwnerPlotRecord } from "../../utils/ownerPortfolio";
import { loadFarmerSoilOcrRecord } from "../../utils/soilAnalysisOcr";

type CheckItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  group: "registration" | "soil" | "certification";
};

type Props = {
  plot: OwnerPlotRecord | null;
  phone?: string | null;
  onOpenCertification?: () => void;
};

function readCertificationSnapshot(plotId: string | null | undefined): {
  step1Status?: string;
  formData?: Record<string, string>;
} | null {
  if (!plotId) return null;
  try {
    const raw = localStorage.getItem(`cropeye_grapes_certification_v2_${plotId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      steps?: Record<string, { status?: string; formData?: Record<string, string> }>;
    };
    const step1 = parsed?.steps?.["1"] ?? parsed?.steps?.[1 as unknown as string];
    return {
      step1Status: step1?.status,
      formData: step1?.formData || {},
    };
  } catch {
    return null;
  }
}

/** Certification fields that FO registration does not create — owner must complete. */
const CERT_GAPS: { key: string; label: string }[] = [
  { key: "registrationNumber", label: "Official registration number" },
  { key: "registrationDate", label: "Registration date" },
  { key: "registrationValidity", label: "Registration validity" },
  { key: "gapCertificateNumber", label: "GlobalG.A.P. certificate number" },
  { key: "gapUploadName", label: "GlobalG.A.P. certificate upload" },
  { key: "form4bGgnNumber", label: "Form 4B / GGN number" },
  { key: "form4bUploadName", label: "Form 4B document upload" },
  { key: "aadhaarId", label: "Aadhaar / grower ID on certification form" },
];

/**
 * Owner view: registration fields captured at FO submit + what still needs certification work.
 */
const OwnerFarmerRegistrationStatus: React.FC<Props> = ({
  plot,
  phone,
  onOpenCertification,
}) => {
  const soilLocal = useMemo(
    () => loadFarmerSoilOcrRecord(phone || plot?.farmerPhone),
    [phone, plot?.farmerPhone],
  );

  const cert = useMemo(
    () => readCertificationSnapshot(plot?.plotId),
    [plot?.plotId],
  );

  if (!plot) return null;

  const registrationChecks: CheckItem[] = [
    {
      id: "farmer",
      label: "Farmer name",
      ok: !!plot.farmerName && plot.farmerName !== "Farmer not linked",
      detail: plot.farmerName,
      group: "registration",
    },
    {
      id: "phone",
      label: "Mobile number",
      ok: !!(phone || plot.farmerPhone),
      detail: phone || plot.farmerPhone || "Missing — soil OCR and owner lookup use phone",
      group: "registration",
    },
    {
      id: "location",
      label: "Village / taluka / district",
      ok: !!(plot.village || plot.taluka || plot.district),
      detail: [plot.village, plot.taluka, plot.district].filter(Boolean).join(", ") || "Missing",
      group: "registration",
    },
    {
      id: "gat",
      label: "Survey / Gat number",
      ok: !!plot.gatNumber,
      detail: plot.gatNumber || "Not in hierarchy for this plot",
      group: "registration",
    },
    {
      id: "plotNo",
      label: "Plot number / label",
      ok: !!(plot.plotNumber || plot.plotLabel),
      detail: plot.plotNumber || plot.plotLabel,
      group: "registration",
    },
    {
      id: "area",
      label: "Plot area",
      ok: plot.areaAcres > 0,
      detail: plot.areaAcres > 0 ? `${plot.areaAcres.toFixed(2)} acres` : "Not reported",
      group: "registration",
    },
    {
      id: "variety",
      label: "Grape variety",
      ok: !!plot.variety,
      detail: plot.variety || "Not entered at registration",
      group: "registration",
    },
    {
      id: "plantation",
      label: "Plantation date",
      ok: !!plot.plantationDate,
      detail: plot.plantationDate || "Missing",
      group: "registration",
    },
    {
      id: "irrigation",
      label: "Irrigation type",
      ok: !!plot.irrigationType,
      detail: plot.irrigationType || "Not linked on farm irrigation record",
      group: "registration",
    },
    {
      id: "pruning",
      label: "Foundation / fruit pruning dates",
      ok: !!(plot.pruningFoundationDate || plot.pruningFruitDate),
      detail:
        [plot.pruningFoundationDate, plot.pruningFruitDate].filter(Boolean).join(" / ") ||
        "Missing on farm record",
      group: "registration",
    },
    {
      id: "boundary",
      label: "Plot boundary on map",
      ok: !!(plot.boundary && plot.boundary.length >= 3),
      detail: plot.boundary?.length
        ? `${plot.boundary.length} vertices`
        : "Boundary not available in hierarchy",
      group: "registration",
    },
  ];

  const soilOk =
    !!plot.farmId ||
    !!(soilLocal && Object.values(soilLocal.soil).some((v) => String(v ?? "").trim()));
  const soilChecks: CheckItem[] = [
    {
      id: "soil",
      label: "Soil analysis report",
      ok: soilOk,
      detail: soilOk
        ? plot.farmId
          ? `Linked to farm #${plot.farmId}`
          : "Local FO OCR cache available"
        : "FO must enable Soil Report and enter/OCR values at registration",
      group: "soil",
    },
  ];

  const form = cert?.formData || {};
  const certChecks: CheckItem[] = CERT_GAPS.map((g) => {
    const val = String(form[g.key] ?? "").trim();
    return {
      id: g.key,
      label: g.label,
      ok: !!val,
      detail: val || "Complete in Review Registration / Certification Timeline",
      group: "certification" as const,
    };
  });

  const missing = [...registrationChecks, ...soilChecks, ...certChecks].filter((c) => !c.ok);
  const present = [...registrationChecks, ...soilChecks].filter((c) => c.ok);

  return (
    <div
      className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
      data-testid="owner-farmer-registration-status"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            Registration &amp; certification checklist
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {plot.farmerName} · {plot.plotLabel}
            {cert?.step1Status ? ` · cert step 1: ${cert.step1Status}` : " · certification not started"}
          </p>
        </div>
        {onOpenCertification && (
          <button
            type="button"
            onClick={onOpenCertification}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
            style={{ minHeight: 0 }}
          >
            Open Review Registration
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Captured at FO registration ({present.length})
          </p>
          <ul className="space-y-1">
            {present.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs text-slate-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  <span className="font-medium">{c.label}</span>
                  {c.detail ? (
                    <span className="text-slate-500"> — {c.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Still needed ({missing.length})
          </p>
          {missing.length === 0 ? (
            <p className="text-xs text-emerald-700">All tracked registration and cert fields look complete for this plot.</p>
          ) : (
            <ul className="space-y-1">
              {missing.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs text-slate-700">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {c.detail ? (
                      <span className="text-slate-500"> — {c.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerFarmerRegistrationStatus;
