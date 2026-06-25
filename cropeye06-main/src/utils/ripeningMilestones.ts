import axios from "axios";
import { grapesPlotFormBody } from "./grapesEventsBundle";

/** Display e.g. `29 Mar 2026`; missing/invalid → `Not available`. */
export function formatMilestoneDate(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "Not available";
  const s = String(iso).trim();
  const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Not available";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type RipeningMilestoneAnalysis = {
  ripening_start_date?: string | null;
  harvest_ready_start_date?: string | null;
  crop_status?: string | null;
};

export type RipeningStageMilestoneResponse = {
  ripening_analysis?: RipeningMilestoneAnalysis | null;
};

/**
 * Fetches ripening analysis for the milestones card.
 * API requires plot_name as multipart form field (not query string).
 */
export async function fetchRipeningStageMilestones(
  baseUrl: string,
  plotName: string
): Promise<RipeningStageMilestoneResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/grapes/ripening-stage`;
  const res = await axios.post<RipeningStageMilestoneResponse>(
    url,
    grapesPlotFormBody(plotName),
    {
      timeout: 120000,
      headers: { Accept: "application/json" },
    }
  );
  return res.data;
}
