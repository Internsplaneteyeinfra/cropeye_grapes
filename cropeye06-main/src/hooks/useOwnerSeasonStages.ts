import { useEffect, useMemo, useState } from "react";
import {
  daysAfterFruitPruningOf,
  fetchGrapesStages,
  foundationPruningDoneOf,
  stageNameOf,
} from "./useGrapesStage";

export type SeasonStage = {
  stageName: string | null;
  daysAfterFruitPruning: number | null;
  fruitPruningDate: string | null;
  foundationPruningDone: boolean | null;
  /** Pruning dates saved in /grapes-schedule; null when not saved (no stage-engine defaults). */
  savedFoundationPruningDate: string | null;
  savedFruitPruningDate: string | null;
};

const CONCURRENCY = 4;

/** Season stage per plot from GET /grapes/stages, the same source as the Crop Stage card. */
export function useOwnerSeasonStages(plotIds: string[]) {
  const ids = useMemo(() => Array.from(new Set(plotIds.filter(Boolean))).sort(), [plotIds]);
  const idsKey = ids.join("|");
  const [stages, setStages] = useState<Map<string, SeasonStage>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const pending = [...ids];
    // Keep prior results for the same ids while refreshing; only clear when the set changes.
    setStages((prev) => {
      const next = new Map<string, SeasonStage>();
      ids.forEach((id) => {
        const keep = prev.get(id);
        if (keep) next.set(id, keep);
      });
      return next;
    });
    setFailed(new Set());

    const worker = async () => {
      while (!cancelled && pending.length > 0) {
        const id = pending.shift()!;
        try {
          const data = await fetchGrapesStages(id);
          if (cancelled) return;
          setStages((prev) =>
            new Map(prev).set(id, {
              stageName: stageNameOf(data),
              daysAfterFruitPruning: daysAfterFruitPruningOf(data),
              fruitPruningDate: data.fruit_pruning_date?.slice(0, 10) ?? null,
              foundationPruningDone: foundationPruningDoneOf(data),
              savedFoundationPruningDate: data.saved_foundation_pruning_date ?? null,
              savedFruitPruningDate: data.saved_fruit_pruning_date ?? null,
            }),
          );
        } catch {
          if (cancelled) return;
          setFailed((prev) => new Set(prev).add(id));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, ids.length)) }, worker));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { stages, failed, loading: ids.length > 0 && stages.size + failed.size < ids.length };
}
