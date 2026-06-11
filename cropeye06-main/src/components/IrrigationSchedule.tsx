import React from "react";
import "./Irrigation/Irrigation.css";
import { Droplets, CloudRain } from "lucide-react";
import { useIrrigationSchedule } from "../hooks/useIrrigationSchedule";

const IrrigationSchedule: React.FC = () => {
  const { schedule: scheduleData, loading, error, irrigationType, getETRangeColor } =
    useIrrigationSchedule(true);

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow h-full relative"
      style={{
        borderRadius: "1rem",
        position: "relative",
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 z-0"
        style={{
          height: "30%",
          backgroundImage: "url('/Image/irrigation schedule.png')",
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
          borderBottomLeftRadius: "1rem",
          borderBottomRightRadius: "1rem",
        }}
      />

      <div className="relative z-10 bg-white">
        <div className="bg-green-600 text-white p-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">7-Day Irrigation Schedule</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs h-full">
            <thead className="bg-green-100">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium">Date</th>
                <th className="px-2 py-2 text-center text-xs font-medium">Action</th>
                <th className="px-2 py-2 text-left text-xs font-medium">ETO</th>
                <th className="px-2 py-2 text-left text-xs font-medium">Rainfall(mm)</th>
                <th className="px-2 py-2 text-left text-xs font-medium">Water req.(L)</th>
                <th className="px-2 py-2 text-left text-xs font-medium">{irrigationType} Time</th>
              </tr>
            </thead>
            <tbody>
              {scheduleData.map((day, idx) => (
                <tr
                  key={day.isoDate || idx}
                  className={`${idx % 2 ? "bg-white" : "bg-gray-50"} ${
                    day.isToday ? "ring-2 ring-blue-300" : ""
                  }`}
                >
                  <td className="px-2 py-2 font-medium">
                    <div className="flex gap-1 items-center flex-wrap">
                      <span className="text-xs">{day.date}</span>
                      {day.isToday && (
                        <span className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                          Today
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
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
                        <Droplets className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <CloudRain className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {loading ? (
                      <div className="loading-spinner-small" />
                    ) : (
                      <span
                        className={`px-2 py-1 rounded-md font-semibold text-xs ${getETRangeColor(
                          day.etRange
                        )}`}
                      >
                        {day.etRange}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-xs text-gray-500">
                      {Number(day.rainfall).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-blue-600 font-semibold text-xs">
                    {day.waterRequired.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-gray-800 text-xs">
                    <strong>{day.time}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="error-message-small">{error}</div>}
      </div>
    </div>
  );
};

export default IrrigationSchedule;
