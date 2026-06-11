import React from "react";
import { Droplets, CloudRain } from "lucide-react";
import type { ETRange, IrrigationScheduleRow } from "../../hooks/useIrrigationSchedule";
import "./Irrigation.css";

type GetETRangeColor = (range: ETRange) => string;

export const IrrigationDayCell: React.FC<{
  row: IrrigationScheduleRow;
  compact?: boolean;
}> = ({ row, compact }) => (
  <div className={`w-full text-left leading-snug ${compact ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"}`}>
    <p className={`text-gray-600 break-words ${compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"}`}>
      Rainfall: <span className="font-medium">{Number(row.rainfall).toFixed(1)} mm</span>
    </p>
    <p className={`text-blue-700 font-semibold break-words ${compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"}`}>
      Water required: {row.waterRequired.toLocaleString()} L
    </p>
    <p
      className={`text-gray-700 break-words ${compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"}`}
      title={row.time}
    >
      Time: {row.time}
    </p>
  </div>
);

export const IrrigationDetailCard: React.FC<{
  row: IrrigationScheduleRow;
  irrigationType: string;
}> = ({ row, irrigationType }) => (
  <div
    className={`p-4 rounded-lg border-l-4 mb-4 ${
      row.needsIrrigation ? "bg-blue-50 border-blue-500" : "bg-gray-50 border-gray-400"
    }`}
  >
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="font-semibold text-gray-800 text-sm sm:text-base">
        Irrigation — {row.date}
        {row.isToday && (
          <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">Today</span>
        )}
      </h3>
      <span className={`irrigation-action-badge ${row.needsIrrigation ? "irrigate" : "skip"}`}>
        {row.needsIrrigation ? (
          <Droplets className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <CloudRain className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
      <div>
        <p className="text-xs text-gray-500">Rainfall</p>
        <p className="font-semibold text-gray-800">{Number(row.rainfall).toFixed(1)} mm</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Water req.</p>
        <p className="font-semibold text-blue-700">{row.waterRequired.toLocaleString()} L</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">{irrigationType} time</p>
        <p className="font-semibold text-gray-800">{row.time}</p>
      </div>
    </div>
  </div>
);

export const IrrigationScheduleTable: React.FC<{
  schedule: IrrigationScheduleRow[];
  irrigationType: string;
  getETRangeColor: GetETRangeColor;
  loading?: boolean;
  plotName?: string;
  error?: string | null;
}> = ({ schedule, irrigationType, getETRangeColor, loading, plotName, error }) => (
  <div className="mt-4 rounded-lg overflow-hidden border border-green-200 shadow-sm">
    <div className="bg-green-600 text-white px-3 py-2 text-sm font-semibold">
      7-Day Irrigation Schedule
    </div>
    {loading ? (
      <p className="text-xs text-gray-500 p-4">Loading irrigation schedule...</p>
    ) : !plotName ? (
      <p className="text-xs text-gray-500 p-4">No plot found — irrigation data unavailable.</p>
    ) : schedule.length === 0 ? (
      <p className="text-xs text-gray-500 p-4">No irrigation data for this plot yet.</p>
    ) : (
      <div className="overflow-x-auto bg-white">
        <table className="w-full text-xs">
          <thead className="bg-green-100">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-center font-medium">Action</th>
              <th className="px-2 py-2 text-left font-medium">ETO</th>
              <th className="px-2 py-2 text-left font-medium">Rainfall (mm)</th>
              <th className="px-2 py-2 text-left font-medium">Water req. (L)</th>
              <th className="px-2 py-2 text-left font-medium">{irrigationType} Time</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((day, idx) => (
              <tr
                key={day.isoDate || idx}
                className={`${idx % 2 ? "bg-white" : "bg-gray-50"} ${
                  day.isToday ? "ring-2 ring-inset ring-blue-300" : ""
                }`}
              >
                <td className="px-2 py-2 font-medium whitespace-nowrap">
                  <span>{day.date}</span>
                  {day.isToday && (
                    <span className="ml-1 bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-[10px]">
                      Today
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={`irrigation-action-badge ${
                      day.needsIrrigation ? "irrigate" : "skip"
                    }`}
                  >
                    {day.needsIrrigation ? (
                      <Droplets className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <CloudRain className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold ${getETRangeColor(day.etRange)}`}
                  >
                    {day.etRange}
                  </span>
                </td>
                <td className="px-2 py-2 text-gray-600 font-medium">
                  {Number(day.rainfall).toFixed(1)}
                </td>
                <td className="px-2 py-2 text-blue-600 font-semibold">
                  {day.waterRequired.toLocaleString()}
                </td>
                <td className="px-2 py-2 text-gray-800 font-medium whitespace-nowrap">{day.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {error && <p className="error-message-small mx-2 mb-2">{error}</p>}
  </div>
);
