import budData from "../components/bud.json";

export type PruningCycle = "foundation" | "fruit" | "plantation";

export type GrapesKcInfo = {
  kc: number;
  stage: string;
  cycle: PruningCycle;
  pruningDate: string;
  daysAfterPruning: number;
  /** Day count is past the last stage range in bud.json. */
  stale: boolean;
};

type BudStage = { stage: string; days: string; kc?: number };

const BUD_STAGES: { stage: string; from: number; to: number; kc: number }[] = (() => {
  const first = (budData as { fertilizer_schedule?: { stages?: BudStage[] }[] })
    .fertilizer_schedule?.[0]?.stages ?? [];
  return first
    .map((s) => {
      const m = String(s.days).match(/(\d+)\D+(\d+)/);
      return m && s.kc != null
        ? { stage: s.stage, from: Number(m[1]), to: Number(m[2]), kc: Number(s.kc) }
        : null;
    })
    .filter((s): s is { stage: string; from: number; to: number; kc: number } => s != null);
})();

function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(`${value.trim().slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Stage and Kc from bud.json, counting days from the latest pruning date that is not in the
 * future (foundation or fruit), else from the plantation date.
 */
export function budKcFromDates(
  foundationPruningDate: unknown,
  fruitPruningDate: unknown,
  plantationDate?: unknown,
  today: Date = new Date(),
): GrapesKcInfo | null {
  if (BUD_STAGES.length === 0) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const candidates = (
    [
      ["foundation", parseDay(foundationPruningDate)],
      ["fruit", parseDay(fruitPruningDate)],
    ] as [PruningCycle, Date | null][]
  ).filter((c): c is [PruningCycle, Date] => c[1] != null && c[1].getTime() <= now.getTime());

  let ref: [PruningCycle, Date] | undefined = candidates.sort(
    (a, b) => b[1].getTime() - a[1].getTime(),
  )[0];
  if (!ref) {
    const p = parseDay(plantationDate);
    if (p && p.getTime() <= now.getTime()) ref = ["plantation", p];
  }
  if (!ref) return null;

  const [cycle, date] = ref;
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const last = BUD_STAGES[BUD_STAGES.length - 1];
  const band = BUD_STAGES.find((b) => days >= b.from && days <= b.to) ?? last;
  return {
    kc: band.kc,
    stage: band.stage,
    cycle,
    pruningDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    daysAfterPruning: days,
    stale: days > last.to,
  };
}

/** Kept for the Fertilizer page's "dates from a previous season" warning. */
export function grapesKcFromPruning(
  foundationPruningDate: unknown,
  fruitPruningDate: unknown,
  today: Date = new Date(),
): GrapesKcInfo | null {
  return budKcFromDates(foundationPruningDate, fruitPruningDate, undefined, today);
}
