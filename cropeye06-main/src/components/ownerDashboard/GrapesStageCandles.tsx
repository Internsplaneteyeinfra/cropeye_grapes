import React from "react";
import type { GrapesStagesResponse } from "../../hooks/useGrapesStage";

const RED = "#dc2626";
const BLUE = "#1d4ed8";
const GREEN = "#16a34a";
const NEUTRAL = "#94a3b8";

const DAY_MS = 86_400_000;
const W = 240;
const H = 56;

function dayOffset(from: Date, iso: string): number | null {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isFinite(d.getTime()) ? Math.round((d.getTime() - from.getTime()) / DAY_MS) : null;
}

/** First stage red, second bold blue, last two green; the rest neutral. */
function stageColor(index: number, total: number): string {
  if (index === 0) return RED;
  if (index === 1) return BLUE;
  if (index >= total - 2) return GREEN;
  return NEUTRAL;
}

/**
 * One candle per stage from GET /grapes/stages: the body spans the stage's start → end
 * season day, so the candles climb with the season. The dashed line marks today.
 */
const GrapesStageCandles: React.FC<{ data: GrapesStagesResponse | null }> = ({ data }) => {
  const stages = data?.stages ?? [];
  const seasonStart = data?.plantation_date
    ? new Date(`${data.plantation_date.slice(0, 10)}T00:00:00`)
    : stages[0]?.start_date
      ? new Date(`${stages[0].start_date.slice(0, 10)}T00:00:00`)
      : null;
  if (!seasonStart || !Number.isFinite(seasonStart.getTime()) || stages.length === 0) return null;

  const spans = stages.map((s) => ({
    stage: s,
    from: dayOffset(seasonStart, s.start_date),
    to: dayOffset(seasonStart, s.end_date),
  }));
  const maxDay = Math.max(
    data?.season_length_days ?? 0,
    ...spans.map((s) => s.to ?? 0),
    1
  );
  const y = (day: number) => H - 2 - (Math.max(0, Math.min(day, maxDay)) / maxDay) * (H - 4);
  const slot = W / stages.length;
  const bodyW = Math.max(4, Math.min(14, slot * 0.55));
  const today = data?.season_day ?? null;
  const currentIndex = stages.findIndex((s) => s.status === "current");
  const total = stages.length;

  const legend = [
    { color: RED, label: stages[0]?.stage_name },
    total > 1 ? { color: BLUE, label: stages[1]?.stage_name } : null,
    total > 3 ? { color: GREEN, label: stages.slice(-2).map((s) => s.stage_name).join(" · ") } : null,
  ].filter((l): l is { color: string; label: string } => !!l?.label);

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-600">
        <span>
          {data?.current_stage?.overdue
            ? "Season ended"
            : currentIndex >= 0
            ? `Stage ${stages[currentIndex].stage_number} of ${total}`
            : data?.not_started
              ? "Season not started"
              : `${total} stages`}
        </span>
        {today != null && <span className="text-slate-400">Season day {today}</span>}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-14 w-full"
        role="img"
        aria-label="Grapes growth stages over the season"
      >
        {today != null && (
          <line
            x1={0}
            x2={W}
            y1={y(today)}
            y2={y(today)}
            stroke="#0f172a"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {spans.map(({ stage, from, to }, i) => {
          if (from == null || to == null) return null;
          const color = stageColor(i, total);
          const cx = slot * i + slot / 2;
          const top = y(to);
          const bottom = y(from);
          const isCurrent = stage.status === "current";
          const upcoming = stage.status === "upcoming";
          return (
            <g key={stage.stage_number} opacity={upcoming ? 0.4 : 1}>
              <title>
                {`${stage.stage_number}. ${stage.stage_name} · ${stage.start_date} → ${stage.end_date} · ${stage.duration_days} days · ${stage.status}`}
              </title>
              <line
                x1={cx}
                x2={cx}
                y1={Math.max(0, top - 2)}
                y2={Math.min(H, bottom + 2)}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(2, bottom - top)}
                rx={1.5}
                fill={color}
                stroke={isCurrent ? "#0f172a" : color === BLUE ? BLUE : "none"}
                strokeWidth={isCurrent ? 2 : color === BLUE ? 1.5 : 0}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] leading-tight text-slate-500">
        {legend.map((l) => (
          <span key={l.color} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default GrapesStageCandles;
