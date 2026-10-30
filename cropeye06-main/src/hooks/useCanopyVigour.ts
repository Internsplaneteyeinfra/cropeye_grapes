import { useEffect, useState } from "react";
import { getCache, setCache } from "../utils/cache";
import { getGrapesAdminBaseUrl } from "../utils/serviceUrls";
import { grapesPlotFormBody } from "../utils/grapesEventsBundle";
import { toBackendPlotName } from "../utils/plotName";
import { parseCanopyVigourPixelSummary, type VigourPixelPct } from "../utils/canopyVigour";

const inflight = new Map<string, Promise<unknown>>();

/** POST /grapes/canopy-vigour1, cached under the same key the plot overview uses. */
function requestCanopyVigour(plot: string): Promise<unknown> {
  const pending = inflight.get(plot);
  if (pending) return pending;
  const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
  const request = fetch(`${base}/grapes/canopy-vigour1?plot_name=${encodeURIComponent(plot)}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: grapesPlotFormBody(plot),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`canopy-vigour1 ${res.status}`);
      return res.json();
    })
    .then((json) => {
      setCache(`canopyVigour_${plot}`, json);
      return json;
    })
    .finally(() => inflight.delete(plot));
  inflight.set(plot, request);
  return request;
}

/** Share of plot pixels in each canopy vigour class; `error` is set only when the request fails. */
export function useCanopyVigour(plotId: string | null) {
  const [data, setData] = useState<VigourPixelPct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!plotId) {
      setData(null);
      setLoading(false);
      return;
    }
    const plot = toBackendPlotName(plotId);
    const cached = parseCanopyVigourPixelSummary(getCache(`canopyVigour_${plot}`));
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setData(null);
    setLoading(true);
    requestCanopyVigour(plot)
      .then((json) => {
        if (!cancelled) setData(parseCanopyVigourPixelSummary(json));
      })
      .catch(() => {
        if (!cancelled) setError("Canopy vigour service is unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plotId]);

  return { data, loading, error };
}
