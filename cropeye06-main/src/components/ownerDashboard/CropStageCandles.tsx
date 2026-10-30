import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGrapesStage, type GrapesStageItem } from "../../hooks/useGrapesStage";

export type StagePhase = "foundation" | "fruiting" | "ripening";

export const PHASE_COLOR: Record<StagePhase, string> = {
  foundation: "#dc2626",
  fruiting: "#1d4ed8",
  ripening: "#16a34a",
};

export type StageCandle = {
  stage: GrapesStageItem;
  phase: StagePhase;
  startDay: number;
  endDay: number;
};

export type PhaseGroup = { phase: StagePhase; label: string; from: number; to: number };

const DAY_MS = 86_400_000;

function dayIndex(iso: string, origin: number): number | null {
  const t = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(t) ? Math.round((t - origin) / DAY_MS) + 1 : null;
}

/**
 * Foundation cycle (before fruit pruning) is red, fruit pruning up to the last two stages is blue,
 * and the final two stages (berry development, veraison) are green.
 */
export function buildStageCandles(stages: GrapesStageItem[]): {
  candles: StageCandle[];
  groups: PhaseGroup[];
} {
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number);
  if (sorted.length === 0) return { candles: [], groups: [] };
  const origin = new Date(`${sorted[0].start_date.slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(origin)) return { candles: [], groups: [] };

  const n = sorted.length;
  const ripeningFrom = n >= 4 ? n - 2 : n;
  const fruitIdx = sorted.findIndex((s) => /fruit\s*prun/i.test(s.stage_name));
  const fruitingFrom =
    fruitIdx > 0 && fruitIdx < ripeningFrom ? fruitIdx : Math.ceil(ripeningFrom / 2);

  const phaseAt = (i: number): StagePhase =>
    i >= ripeningFrom ? "ripening" : i >= fruitingFrom ? "fruiting" : "foundation";

  const candles: StageCandle[] = [];
  sorted.forEach((stage, i) => {
    const startDay = dayIndex(stage.start_date, origin);
    const endDay = dayIndex(stage.end_date, origin);
    if (startDay == null || endDay == null) return;
    candles.push({ stage, phase: phaseAt(i), startDay, endDay });
  });

  const groups: PhaseGroup[] = (["foundation", "fruiting", "ripening"] as const)
    .map((phase) => {
      const members = candles.filter((c) => c.phase === phase).map((c) => c.stage);
      if (members.length === 0) return null;
      const first = members[0];
      const last = members[members.length - 1];
      const label =
        phase === "foundation"
          ? first.stage_name
          : phase === "ripening"
            ? members.map((s) => s.stage_name).join(" / ")
            : members.length > 1
              ? `${first.stage_name} – ${last.stage_name}`
              : first.stage_name;
      return { phase, label, from: first.stage_number, to: last.stage_number };
    })
    .filter((g): g is PhaseGroup => g != null);
  return { candles, groups };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type Row = {
  key: string;
  range: [number, number];
  name: string;
  phase: StagePhase;
  status: string;
  start: string;
  end: string;
  isCurrent: boolean;
};

const StageTooltip: React.FC<{ active?: boolean; payload?: { payload: Row }[] }> = ({ active, payload }) => {
  const r = active && payload?.[0]?.payload;
  if (!r) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow">
      <p className="font-semibold text-slate-800">
        {r.key} · {r.name}
        {r.isCurrent && <span className="ml-1 text-emerald-700">(current)</span>}
      </p>
      <p className="text-slate-600">
        Day {r.range[0]}–{r.range[1]} · {shortDate(r.start)} – {shortDate(r.end)}
      </p>
      <p className="capitalize text-slate-500">{r.status}</p>
    </div>
  );
};

const CURRENT_COLOR = "#1d4ed8";

/** Current stage: full-width bold blue bar; other stages: slim bars in their phase colour. */
const StageBar = (props: any): React.ReactElement => {
  const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: Row };
  if (![x, y, width, height].every(Number.isFinite)) return <g />;
  const h = Math.max(3, height);
  if (payload.isCurrent) {
    // Short stages (a week) would be a few pixels tall; keep the current one clearly visible.
    const ch = Math.max(28, h);
    const cy = y + h / 2 - ch / 2;
    const cw = Math.max(6, width * 0.5);
    const cx = x + width / 2 - cw / 2;
    return (
      <g>
        <rect x={cx - 2} y={cy - 2} width={cw + 4} height={ch + 4} rx={4} fill={CURRENT_COLOR} fillOpacity={0.18} />
        <rect x={cx} y={cy} width={cw} height={ch} rx={3} fill={CURRENT_COLOR} stroke="#0f172a" strokeWidth={1.5} />
      </g>
    );
  }
  const slim = Math.max(3, width * 0.3);
  const color = PHASE_COLOR[payload.phase];
  const done = payload.status === "completed";
  return (
    <rect
      x={x + (width - slim) / 2}
      y={y}
      width={slim}
      height={h}
      rx={2}
      fill={color}
      fillOpacity={done ? 0.6 : 0.2}
      stroke={color}
      strokeOpacity={done ? 0.8 : 0.4}
      strokeWidth={0.75}
    />
  );
};

/** Stage-by-stage season chart for the Crop Stage card, built from GET /grapes/stages. */
const CropStageCandles: React.FC<{ plotId: string | null | undefined }> = ({ plotId }) => {
  const { loading, stages, currentStageNumber, seasonDay, seasonOver } = useGrapesStage(plotId);
  const { candles } = useMemo(() => buildStageCandles(stages), [stages]);

  const rows = useMemo<Row[]>(
    () =>
      candles.map((c) => ({
        key: `S${c.stage.stage_number}`,
        range: [c.startDay, c.endDay],
        name: c.stage.stage_name,
        phase: c.phase,
        status: c.stage.status,
        start: c.stage.start_date,
        end: c.stage.end_date,
        isCurrent: c.stage.stage_number === currentStageNumber,
      })),
    [candles, currentStageNumber],
  );

  if (loading || rows.length === 0) return null;

  const totalDays = Math.max(...candles.map((c) => c.endDay));
  const current = rows.find((r) => r.isCurrent) ?? null;
  const today = seasonDay != null ? Math.min(seasonDay, totalDays) : null;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        {current ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CURRENT_COLOR }} />
            <span className="truncate">
              Current: {current.name} · {current.key} of {rows.length}
            </span>
          </span>
        ) : (
          <span className="font-semibold text-slate-500">{seasonOver ? "Season complete" : "Season not started"}</span>
        )}
        {today != null && <span className="shrink-0 text-slate-400">Day {today}/{totalDays}</span>}
      </div>

      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 6, left: -22, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="key" tick={{ fontSize: 9 }} interval={0} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} domain={[0, totalDays]} allowDecimals={false} />
            <Tooltip content={<StageTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
            {today != null && (
              <ReferenceLine
                y={today}
                stroke="#059669"
                strokeDasharray="3 3"
                label={{ value: `Today · day ${today}`, position: "insideTopLeft", fontSize: 9, fill: "#059669" }}
              />
            )}
            <Bar dataKey="range" isAnimationActive={false} shape={StageBar}>
              {rows.map((r) => (
                <Cell key={r.key} />
              ))}
              <LabelList
                dataKey="name"
                content={(props: any) => {
                  const r = rows[props.index];
                  if (!r?.isCurrent) return null;
                  const x = Number(props.x) + Number(props.width) / 2;
                  return (
                    <text
                      x={x}
                      y={Math.min(Number(props.y), Number(props.y) + Number(props.height) / 2 - 14) - 8}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={800}
                      fill={CURRENT_COLOR}
                    >
                      {r.name}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CropStageCandles;
