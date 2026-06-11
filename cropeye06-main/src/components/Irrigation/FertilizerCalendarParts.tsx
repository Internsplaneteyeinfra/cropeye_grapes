import React from "react";
import { Sprout } from "lucide-react";
import type { GrapesScheduleRow } from "../../utils/grapesSchedule";

function cellText(v: string | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

export const FertilizerDayCell: React.FC<{
  row: GrapesScheduleRow;
  compact?: boolean;
}> = ({ row, compact }) => (
  <div
    className={`w-full text-left leading-snug ${
      compact ? "mt-0.5 space-y-0.5" : "mt-1 space-y-0.5"
    }`}
  >
    {row.stage && (
      <p
        className={`text-amber-800 font-semibold break-words ${
          compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
        }`}
      >
        {row.stage}
      </p>
    )}
    {row.scheduleType && (
      <p
        className={`text-gray-600 break-words ${
          compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
        }`}
      >
        Type: {row.scheduleType}
      </p>
    )}
    {row.issue && (
      <p
        className={`text-gray-700 break-words line-clamp-2 ${
          compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
        }`}
        title={row.issue}
      >
        {row.issue}
      </p>
    )}
  </div>
);

export const FertilizerDetailCard: React.FC<{
  row: GrapesScheduleRow;
}> = ({ row }) => (
  <div className="p-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 mb-4">
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="font-semibold text-gray-800 text-sm sm:text-base">
        Fertilizer Schedule — {row.date}
      </h3>
      <Sprout className="h-4 w-4 text-amber-700 shrink-0" aria-hidden />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
      <div>
        <p className="text-xs text-gray-500">Day</p>
        <p className="font-semibold text-gray-800">{cellText(row.days)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Stage</p>
        <p className="font-semibold text-gray-800">{cellText(row.stage)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Type</p>
        <p className="font-semibold text-gray-800">{cellText(row.scheduleType)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Issue</p>
        <p className="font-semibold text-gray-800">{cellText(row.issue)}</p>
      </div>
    </div>
    <div className="space-y-2 text-sm border-t border-amber-200 pt-3">
      <div>
        <p className="text-xs text-gray-500">Nutrient</p>
        <p className="text-gray-800 break-words">{cellText(row.nutrient)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Recommendation</p>
        <p className="text-gray-800 break-words">{cellText(row.recommendation)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Organic</p>
        <p className="text-gray-800 break-words whitespace-pre-wrap">
          {cellText(row.organic)}
        </p>
      </div>
    </div>
  </div>
);
