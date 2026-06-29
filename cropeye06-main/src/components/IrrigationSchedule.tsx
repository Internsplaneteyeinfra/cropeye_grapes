import React from "react";
import "./Irrigation/Irrigation.css";
import { Droplets, CloudRain } from "lucide-react";
import { useIrrigationSchedule } from "../hooks/useIrrigationSchedule";

const compactTime = (time: string) =>
  time
    .replace(/\b0\s*hrs?\s*0\s*mins?\b/i, "0m")
    .replace(/(\d+)\s*hrs?\s*(\d+)\s*mins?/i, "$1h $2m");

const IrrigationSchedule: React.FC = () => {
  const {
    schedule: scheduleData,
    totals,
    etLoading,
    loading,
    error,
    irrigationType,
    getETRangeColor,
  } = useIrrigationSchedule(true);

  return (
    <div className="irrigation-schedule-card bg-white rounded-2xl overflow-hidden shadow h-full min-h-[300px] min-w-0 w-full max-w-full flex flex-col">
      <div className="bg-white border-b border-gray-100 px-3 py-2.5 flex items-center shrink-0">
        <h2 className="text-sm font-semibold text-green-700">7-Day Irrigation Schedule</h2>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 border-b border-red-100">
          {error}
        </p>
      )}

      <div className="irrigation-schedule-table-wrap flex-1 min-h-0">
        {loading && scheduleData.length === 0 ? (
          <p className="text-xs text-gray-500 p-4">Loading irrigation schedule...</p>
        ) : (
        <table className="irrigation-schedule-table">
          <thead className="bg-green-100">
            <tr>
              <th>Date</th>
              <th className="text-center">Action</th>
              <th>ETO</th>
              <th>Rain(mm)</th>
              <th>Water(L)</th>
              <th title={`${irrigationType} Time`}>Drip</th>
            </tr>
          </thead>
          <tbody>
            {scheduleData.map((day, idx) => (
              <tr
                key={day.isoDate || idx}
                className={`${idx % 2 ? "bg-white" : "bg-gray-50"} ${
                  day.isToday ? "irrigation-schedule-today" : ""
                }`}
              >
                <td>
                  <div className="flex flex-col gap-0.5 items-start justify-center h-full">
                    <span className="whitespace-nowrap">{day.date}</span>
                    {day.isToday && (
                      <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] leading-none">
                        Today
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-center">
                  <span
                    className={`irrigation-action-badge ${
                      day.needsIrrigation ? "irrigate" : "skip"
                    }`}
                    title={
                      day.needsIrrigation
                        ? `Irrigate — ${day.time}`
                        : "No irrigation — rainfall covers water need"
                    }
                  >
                    {day.needsIrrigation ? (
                      <Droplets className="h-4 w-4" aria-hidden />
                    ) : (
                      <CloudRain className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                </td>
                <td>
                  {etLoading && day.isToday && day.etDisplayed <= 0 ? (
                    <div className="loading-spinner-small" />
                  ) : (
                    <span
                      className={`px-2 py-1 rounded-md font-semibold text-xs whitespace-nowrap ${getETRangeColor(
                        day.etRange
                      )}`}
                    >
                      {day.etRange}
                    </span>
                  )}
                </td>
                <td>
                  <span className="font-medium text-gray-500 tabular-nums">
                    {Number(day.rainfall).toFixed(1)}
                  </span>
                </td>
                <td>
                  <span
                    className={`font-semibold tabular-nums ${
                      day.waterRequired > 0 ? "text-blue-600" : "text-gray-400"
                    }`}
                    title={
                      day.waterRequired > 0
                        ? `${day.waterRequired.toLocaleString()} liters per acre`
                        : day.rainfall >= day.etDisplayed
                          ? `No irrigation — rainfall (${day.rainfall.toFixed(1)} mm) covers ET (${day.etDisplayed.toFixed(1)} mm)`
                          : "No irrigation needed"
                    }
                  >
                    {day.waterRequired > 0 ? day.waterRequired.toLocaleString() : "0"}
                  </span>
                </td>
                <td>
                  <strong className="tabular-nums" title={day.time}>
                    {compactTime(day.time)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="bg-green-50 border-t-2 border-green-300 font-semibold">
                <td colSpan={4}>7-Day Total</td>
                <td className="text-blue-700 tabular-nums">
                  {totals.totalWater.toLocaleString()} L
                </td>
                <td className="text-gray-900 tabular-nums" title={totals.totalDripFormatted}>
                  {compactTime(totals.totalDripFormatted)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        )}
      </div>
    </div>
  );
};

export default IrrigationSchedule;
