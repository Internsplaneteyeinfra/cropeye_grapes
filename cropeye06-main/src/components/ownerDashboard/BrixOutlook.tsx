import React from "react";
import type { RipeningOutlook } from "../../hooks/useGrapesStage";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${b.slice(0, 10)}T00:00:00`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000);

type Props = {
  ripening: RipeningOutlook;
  fruitPruningDate: string;
  /** Days since fruit pruning as of today; null when unknown. */
  todayDay: number | null;
};

/**
 * Shown while no Brix readings exist: the plot's timeline from fruit pruning to the veraison window,
 * when sugar starts accumulating and Brix sampling becomes meaningful.
 */
const BrixOutlook: React.FC<Props> = ({ ripening, fruitPruningDate, todayDay }) => {
  const windowStart = ripening.veraisonDay;
  const windowEnd = windowStart + Math.max(1, dayDiff(ripening.veraisonStart, ripening.veraisonEnd));
  const axisEnd = Math.max(windowEnd, todayDay ?? 0) * 1.05;
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / axisEnd) * 100))}%`;
  const progress = todayDay != null ? Math.min(todayDay, windowStart) : 0;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-700">Brix outlook</span>
        <span className="text-slate-400">No Brix readings yet</span>
      </div>

      <div className="relative mt-5 h-16">
        <div className="absolute left-0 right-0 top-5 h-2.5 rounded-full bg-slate-200" />
        <div
          className="absolute left-0 top-5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-700"
          style={{ width: pct(progress) }}
        />
        <div
          className="absolute top-3.5 h-5 rounded-md border border-emerald-500 bg-emerald-100/80"
          style={{ left: pct(windowStart), width: `calc(${pct(windowEnd)} - ${pct(windowStart)})` }}
          title={`${ripening.veraisonStage}: ${shortDate(ripening.veraisonStart)} – ${shortDate(ripening.veraisonEnd)}`}
        />
        <span
          className="absolute -top-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-emerald-700"
          style={{ left: `calc((${pct(windowStart)} + ${pct(windowEnd)}) / 2)` }}
        >
          Brix sampling window
        </span>

        {todayDay != null && (
          <div
            className={`absolute -top-1 flex flex-col ${todayDay / axisEnd < 0.12 ? "items-start" : "-translate-x-1/2 items-center"}`}
            style={{ left: pct(todayDay) }}
          >
            <span className="whitespace-nowrap text-[10px] font-semibold text-slate-900">Today · day {todayDay}</span>
            <div className="h-[18px] w-0.5 bg-slate-900" />
          </div>
        )}

        <span className="absolute left-0 top-9 text-[10px] text-slate-500">
          Fruit pruning
          <br />
          {shortDate(fruitPruningDate)}
        </span>
        <span className="absolute right-0 top-9 text-right text-[10px] text-slate-500">
          {ripening.veraisonStage}
          <br />
          {shortDate(ripening.veraisonStart)}
        </span>
      </div>

      <p className="mt-1 text-center text-[11px] leading-snug text-slate-500">
        {ripening.status === "before"
          ? `Sugar starts building at veraison (~day ${windowStart}). Brix readings expected from ${shortDate(ripening.veraisonStart)}.`
          : ripening.status === "ripening"
            ? `Veraison is under way since ${shortDate(ripening.veraisonStart)}; Brix readings should appear soon.`
            : `Veraison window ended ${shortDate(ripening.veraisonEnd)} but no Brix readings were recorded.`}
      </p>
    </div>
  );
};

export default BrixOutlook;
