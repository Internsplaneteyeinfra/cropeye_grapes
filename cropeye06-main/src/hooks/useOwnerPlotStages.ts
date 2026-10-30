import { useEffect, useMemo, useState } from "react";
import { getCache, setCache } from "../utils/cache";
import { getEventsBaseUrl } from "../utils/serviceUrls";
import { fetchRipeningStageMilestones } from "../utils/ripeningMilestones";
import { ripeningMilestonesFromPayload } from "../utils/grapesEventsBundle";

export type PlotStage = {
  stage: string | null;
  ripeningStartDate: string | null;
  harvestReadyStartDate: string | null;
};

const STAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;

const cacheKey = (plotId: string) => `ownerPlotStage_v1_${plotId}`;

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadStage(plotId: string): Promise<PlotStage> {
  const cached = getCache(cacheKey(plotId), STAGE_CACHE_MS) as PlotStage | null;
  if (cached) return cached;
  const data = await fetchRipeningStageMilestones(getEventsBaseUrl(), plotId);
  const m = ripeningMilestonesFromPayload(data);
  const result: PlotStage = {
    stage: m.cropStatus ? titleCase(m.cropStatus) : null,
    ripeningStartDate: m.ripeningStartDate,
    harvestReadyStartDate: m.harvestReadyStartDate,
  };
  setCache(cacheKey(plotId), result);
  return result;
}

/**
 * Crop stage per plot from POST /grapes/ripening-stage (the same source as the
 * farmer dashboard "Crop Status" card). Loaded in the background a few plots at a
 * time; plots whose stage cannot be read are reported as failed, never guessed.
 */
export function useOwnerPlotStages(plotIds: string[]) {
  const ids = useMemo(
    () => Array.from(new Set(plotIds.filter(Boolean))).sort(),
    [plotIds],
  );
  const idsKey = ids.join("|");
  const [stages, setStages] = useState<Map<string, PlotStage>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const next = new Map<string, PlotStage>();
    const pending: string[] = [];
    ids.forEach((id) => {
      const cached = getCache(cacheKey(id), STAGE_CACHE_MS) as PlotStage | null;
      if (cached) next.set(id, cached);
      else pending.push(id);
    });
    setStages(new Map(next));
    setFailed(new Set());

    const worker = async () => {
      while (!cancelled && pending.length > 0) {
        const id = pending.shift()!;
        try {
          const stage = await loadStage(id);
          if (cancelled) return;
          setStages((prev) => new Map(prev).set(id, stage));
        } catch {
          if (cancelled) return;
          setFailed((prev) => new Set(prev).add(id));
        }
      }
    };
    void Promise.all(Array.from({ length: CONCURRENCY }, worker));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const done = stages.size + failed.size;
  return {
    stages,
    total: ids.length,
    done,
    loading: done < ids.length,
  };
}
