import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, FlaskConical, Loader2 } from "lucide-react";
import { addSoilReport, getSoilReports } from "../../api";
import {
  loadFarmerSoilOcrRecord,
  saveFarmerSoilOcrRecord,
  type FarmerSoilOcrRecord,
} from "../../utils/soilAnalysisOcr";
import { createSoilReportPayload, SOIL_REPORT_FIELDS } from "../../utils/soilReportPayload";
import SoilAnalysisOcrPanel from "../SoilAnalysisOcrPanel";

type SoilMap = FarmerSoilOcrRecord["soil"];

type Props = {
  phone: string | null | undefined;
  farmerName?: string | null;
  /** Primary farm ID from selected plot */
  farmId?: number | null;
  /** All farm IDs for this farmer (try each when loading soil reports) */
  farmIds?: number[];
  village?: string | null;
  gatNumber?: string | null;
};

const LABELS: { key: keyof SoilMap; label: string }[] = [
  { key: "nitrogen", label: "N (Nitrogen)" },
  { key: "phosphorus", label: "P (Phosphorus)" },
  { key: "potassium", label: "K (Potassium)" },
  { key: "soil_ph", label: "Soil pH" },
  { key: "organic_carbon", label: "Organic carbon" },
  { key: "soil_organic_carbon", label: "SOC" },
  { key: "cec", label: "CEC" },
  { key: "bulk_density", label: "Bulk density" },
  { key: "fe", label: "Fe (Iron)" },
];

function emptySoil(): SoilMap {
  return {
    nitrogen: "",
    phosphorus: "",
    potassium: "",
    soil_ph: "",
    cec: "",
    organic_carbon: "",
    bulk_density: "",
    fe: "",
    soil_organic_carbon: "",
  };
}

function soilFromApiRow(row: Record<string, unknown>): SoilMap {
  const soil = emptySoil();
  for (const field of SOIL_REPORT_FIELDS) {
    const raw = row[field];
    if (raw == null || String(raw).trim() === "") continue;
    soil[field] = String(raw);
  }
  return soil;
}

function hasAnySoil(soil: SoilMap): boolean {
  return Object.values(soil).some((v) => String(v ?? "").trim());
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const record = data as { results?: unknown };
    if (Array.isArray(record.results)) return record.results as Record<string, unknown>[];
    return [data as Record<string, unknown>];
  }
  return [];
}

/**
 * Owner view: soil from FO registration API + local OCR, with Owner re-scan for this farmer.
 */
const OwnerFarmerSoilOcrCard: React.FC<Props> = ({
  phone,
  farmerName,
  farmId,
  farmIds,
  village,
  gatNumber,
}) => {
  const ids = useMemo(() => {
    const set = new Set<number>();
    if (farmId != null && farmId > 0) set.add(farmId);
    (farmIds || []).forEach((id) => {
      if (id != null && id > 0) set.add(id);
    });
    return [...set];
  }, [farmId, farmIds]);

  const [localRecord, setLocalRecord] = useState(() => loadFarmerSoilOcrRecord(phone));
  const [apiSoil, setApiSoil] = useState<SoilMap | null>(null);
  const [apiFarmId, setApiFarmId] = useState<number | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setLocalRecord(loadFarmerSoilOcrRecord(phone));
  }, [phone, reloadToken]);

  const loadFromApi = useCallback(async () => {
    if (ids.length === 0) {
      setApiSoil(null);
      setApiFarmId(null);
      setApiError(null);
      setApiLoading(false);
      return;
    }
    setApiLoading(true);
    setApiError(null);
    try {
      for (const id of ids) {
        const res = await getSoilReports(id);
        const rows = normalizeRows(res.data);
        for (const row of rows) {
          const mapped = soilFromApiRow(row);
          if (hasAnySoil(mapped)) {
            setApiSoil(mapped);
            setApiFarmId(id);
            setApiLoading(false);
            return;
          }
        }
      }
      setApiSoil(null);
      setApiFarmId(null);
    } catch (err: unknown) {
      setApiSoil(null);
      setApiFarmId(null);
      setApiError(
        err instanceof Error ? err.message : "Could not load soil report from server.",
      );
    } finally {
      setApiLoading(false);
    }
  }, [ids]);

  useEffect(() => {
    void loadFromApi();
  }, [loadFromApi, reloadToken]);

  const soil = apiSoil ?? localRecord?.soil ?? null;
  const sourceLabel = apiSoil
    ? `Farm soil report #${apiFarmId}`
    : localRecord?.sourceName || "Soil analysis report";
  const scannedAt = localRecord?.scannedAt;
  const displayVillage = localRecord?.village || village || "";
  const displayGat = localRecord?.gatNumber || gatNumber || "";

  const persistOcr = async (payload: {
    soil: SoilMap;
    farmerName?: string;
    mobile?: string;
    village?: string;
    gatNumber?: string;
    sourceName: string;
  }) => {
    const phoneKey = (payload.mobile || phone || "").replace(/\D/g, "");
    if (phoneKey.length >= 10) {
      saveFarmerSoilOcrRecord({
        phone: phoneKey,
        farmerName: payload.farmerName || farmerName || "Farmer",
        village: payload.village || village || undefined,
        gatNumber: payload.gatNumber || gatNumber || undefined,
        farmIds: ids,
        soil: payload.soil,
        sourceName: payload.sourceName,
        scannedAt: new Date().toISOString(),
      });
    }

    // Also push to backend when we know the farm (same path FO registration uses)
    const targetFarm = ids[0];
    if (targetFarm != null) {
      try {
        const body = createSoilReportPayload(targetFarm, payload.soil);
        if (body) await addSoilReport(body);
      } catch {
        /* local save still works */
      }
    }
    setReloadToken((n) => n + 1);
  };

  if (!phone?.trim() && ids.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
        <p className="flex items-center gap-2 font-medium text-slate-600">
          <FlaskConical className="h-3.5 w-3.5" />
          Soil analysis report
        </p>
        <p className="mt-1">
          Select a farmer (district → taluka → farmer) to load their soil report. Do not use
          Registration OCR for soil PDFs — that form is for grape registration only.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3" data-testid="owner-farmer-soil-ocr">
      <SoilAnalysisOcrPanel
        onApplied={(payload) => {
          void persistOcr(payload);
        }}
      />

      {apiLoading && !soil && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-slate-200">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <p className="min-w-0 pt-1 text-xs leading-5 text-slate-600">
            Loading soil report for this farmer…
          </p>
        </div>
      )}

      {!apiLoading && (!soil || !hasAnySoil(soil)) && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5 sm:py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">
              No soil values for {farmerName?.trim() || "this farmer"} yet
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              If the field officer already submitted a soil report, it is stored on the farm API by
              farm ID{ids.length ? ` (trying ${ids.join(", ")})` : ""}. Upload the soil lab PDF
              above with <b>Upload &amp; Autofill</b> — not Registration OCR.
            </p>
            {apiError && <p className="mt-1 text-xs leading-5 text-amber-700">{apiError}</p>}
          </div>
        </div>
      )}

      {soil && hasAnySoil(soil) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <FlaskConical className="h-4 w-4 text-emerald-700" />
                Soil analysis · {localRecord?.farmerName || farmerName || "Farmer"}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-emerald-900/70">
                <FileText className="h-3 w-3" />
                {sourceLabel}
                {scannedAt && !apiSoil
                  ? ` · scanned ${new Date(scannedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : ""}
                {apiSoil ? " · from farm API" : " · local OCR cache"}
              </p>
            </div>
            {(displayVillage || displayGat) && (
              <p className="text-[11px] text-amber-900/70">
                {[displayVillage, displayGat ? `Gat ${displayGat}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {LABELS.filter((row) => String(soil[row.key] ?? "").trim()).map((row) => (
              <div
                key={row.key}
                className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2"
              >
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {row.label}
                </p>
                <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-slate-900">
                  {soil[row.key]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerFarmerSoilOcrCard;
