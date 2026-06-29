import React, { useState, useEffect } from "react";

interface FieldHealthAnalysisProps {
  fieldAnalysisData: {
    plotName: string;
    overallHealth: number;
    healthStatus: string;
    statistics: {
      mean: number;
    };
  } | null;
}

function getStatusLabel(score: number): string {
  if (score >= 75 && score <= 100) return "Excellent";
  if (score >= 65 && score < 75) return "Good";
  if (score >= 55 && score < 65) return "Moderate";
  if (score >= 45 && score < 55) return "Poor";
  if (score >= 0 && score < 45) return "Very Poor";
  return "Unknown";
}

function getHealthColors(score: number) {
  if (score >= 75) {
    return {
      arc: "#16a34a",
      box: "bg-green-100 text-green-800 border border-green-300",
      range: "75-100"
    };
  }
  if (score >= 65 && score < 75) {
    return {
      arc: "#22c55e",
      box: "bg-green-50 text-green-700 border border-green-200",
      range: "65-74"
    };
  }
  if (score >= 55 && score < 65) {
    return {
      arc: "#eab308",
      box: "bg-yellow-100 text-yellow-800 border border-yellow-300",
      range: "55-64"
    };
  }
  if (score >= 45 && score < 55) {
    return {
      arc: "#f97316",
      box: "bg-orange-100 text-orange-800 border border-orange-300",
      range: "45-54"
    };
  }
  return {
    arc: "#ef4444",
    box: "bg-red-100 text-red-800 border border-red-300",
    range: "0-44"
  };
}

export const FieldHealthAnalysis: React.FC<FieldHealthAnalysisProps> = ({
  fieldAnalysisData,
}) => {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const targetPercent = fieldAnalysisData?.overallHealth ?? 0;

  useEffect(() => {
    const animationTimeout = setTimeout(() => {
      setAnimatedPercent(targetPercent);
    }, 100);
    return () => clearTimeout(animationTimeout);
  }, [targetPercent]);

  const computedStatus = getStatusLabel(targetPercent);
  const colors = getHealthColors(targetPercent);
  const remainingArcColor = "#f59e0b";

  return (
    <div className="card h-full flex flex-col min-h-[300px] overflow-hidden rounded-2xl bg-white shadow-md border border-gray-100">
      <div className="bg-white border-b border-gray-100 px-3 py-2.5 text-center shrink-0">
        <h2 className="text-sm font-semibold text-green-700">Field Score</h2>
        {fieldAnalysisData && (
          <p className="text-xs text-gray-600 mt-0.5 font-medium">
            PlotID : {fieldAnalysisData.plotName}
          </p>
        )}
      </div>

      <div
        className="card-body relative flex-1 min-h-0 p-4"
        style={{
          backgroundImage: "url('/Image/field_score.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 h-full flex flex-col">
          {fieldAnalysisData ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-44 h-44 relative">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831
                         a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#E5E7EB"
                      strokeWidth="3.8"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831
                         a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={colors.arc}
                      strokeWidth="3.8"
                      strokeDasharray={`${animatedPercent}, 100`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 1.5s ease-in-out" }}
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831
                         a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={remainingArcColor}
                      strokeWidth="3.8"
                      strokeDasharray={`${100 - animatedPercent}, 100`}
                      strokeDashoffset={`-${animatedPercent}`}
                      strokeLinecap="round"
                      style={{
                        transition: "all 1.5s ease-in-out",
                        strokeOpacity: 0.3,
                      }}
                    />
                    <text
                      x="18"
                      y="20.5"
                      textAnchor="middle"
                      className="fill-gray-800 text-[0.45rem] font-bold"
                    >
                      {targetPercent.toFixed(1)}%
                    </text>
                  </svg>
                </div>
              </div>

              <div className="mt-auto flex justify-center">
                <div className={`px-5 py-2.5 rounded-lg shadow text-center w-full max-w-xs ${colors.box}`}>
                  <div className="font-bold text-lg mb-0.5">
                    Status: {computedStatus}
                  </div>
                  <div className="text-sm">Optimal range: 60-80</div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-center py-8">
              No data available for the selected plot.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
