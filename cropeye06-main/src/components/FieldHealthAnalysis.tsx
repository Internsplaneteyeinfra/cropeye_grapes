import React, { useState, useEffect, useRef, useCallback } from "react";
import "./FieldHealthAnalysis.css";

interface FieldHealthAnalysisProps {
  fieldAnalysisData: {
    plotName: string;
    overallHealth: number;
    healthStatus: string;
    statistics: {
      mean: number;
    };
  } | null;
  loading?: boolean;
}

function getStatusLabel(score: number): string {
  if (score >= 75) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 55) return "Moderate";
  if (score >= 45) return "Poor";
  if (score >= 0) return "Very Poor";
  return "Unknown";
}

function getHealthColors(score: number) {
  if (score >= 75) {
    return {
      arc: "#16a34a",
      box: "bg-green-100 text-green-800 border border-green-300",
    };
  }
  if (score >= 65) {
    return {
      arc: "#22c55e",
      box: "bg-green-50 text-green-700 border border-green-200",
    };
  }
  if (score >= 55) {
    return {
      arc: "#eab308",
      box: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    };
  }
  if (score >= 45) {
    return {
      arc: "#f97316",
      box: "bg-orange-100 text-orange-800 border border-orange-300",
    };
  }
  return {
    arc: "#ef4444",
    box: "bg-red-100 text-red-800 border border-red-300",
  };
}

const GAUGE_R = 15.5;
const GAUGE_C = 2 * Math.PI * GAUGE_R;
const FIELD_SCORE_START_DELAY_MS = 80;
const FIELD_SCORE_COUNT_DURATION_MS = 1500;
export const FIELD_SCORE_ANIMATION_COMPLETE_MS =
  FIELD_SCORE_START_DELAY_MS + FIELD_SCORE_COUNT_DURATION_MS + 120;

export const FieldHealthAnalysis: React.FC<FieldHealthAnalysisProps> = ({
  fieldAnalysisData,
  loading = false,
}) => {
  const [displayPercent, setDisplayPercent] = useState(0);
  const [arcProgress, setArcProgress] = useState(0);
  const [reveal, setReveal] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const targetPercent = fieldAnalysisData?.overallHealth ?? 0;

  const runScoreAnimation = useCallback((to: number) => {
    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setReveal(false);
    setDisplayPercent(0);
    setArcProgress(0);

    const startDelay = window.setTimeout(() => {
      setReveal(true);
      const start = performance.now();
      const duration = FIELD_SCORE_COUNT_DURATION_MS;

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = to * eased;
        setDisplayPercent(value);
        setArcProgress(value);
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayPercent(to);
          setArcProgress(to);
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    }, FIELD_SCORE_START_DELAY_MS);

    return () => {
      window.clearTimeout(startDelay);
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading || !fieldAnalysisData) {
      setReveal(false);
      setDisplayPercent(0);
      setArcProgress(0);
      return;
    }
    return runScoreAnimation(targetPercent);
  }, [loading, fieldAnalysisData, targetPercent, runScoreAnimation]);

  const computedStatus = getStatusLabel(targetPercent);
  const colors = getHealthColors(targetPercent);
  const progress = Math.max(0, Math.min(100, arcProgress));
  const dashOffset = GAUGE_C - (progress / 100) * GAUGE_C;
  const meanValue = Number(fieldAnalysisData?.statistics?.mean ?? NaN);
  const statusText =
    fieldAnalysisData?.healthStatus &&
    fieldAnalysisData.healthStatus !== "Unknown"
      ? fieldAnalysisData.healthStatus
      : computedStatus;

  return (
    <div className="card field-score-card h-full flex flex-col min-h-[300px] overflow-hidden rounded-2xl bg-white shadow-md border border-gray-100">
      <div className="field-score-header shrink-0 px-3 py-2.5 text-center border-b border-gray-100">
        <h2 className="text-sm font-semibold text-green-700">Field Score</h2>
        {fieldAnalysisData && !loading && (
          <p className="text-xs text-gray-600 mt-0.5 font-medium field-score-plot-fade">
            PlotID : {fieldAnalysisData.plotName}
          </p>
        )}
      </div>

      <div className="card-body field-score-body relative flex-1 min-h-0 p-4">
        <div className="field-score-bg" aria-hidden />
        <div className="absolute inset-0 bg-white/50 pointer-events-none" />

        <div className="relative z-10 h-full flex flex-col">
          {loading ? (
            <div
              className="flex-1 flex items-center justify-center py-10 field-score-loading"
              aria-label="Field score is loading"
              aria-busy="true"
            >
              <span className="text-3xl font-semibold text-gray-400">—</span>
            </div>
          ) : fieldAnalysisData ? (
            <>
              <div className="flex justify-center mb-4">
                <div
                  className={`field-score-gauge ${reveal ? "is-revealed" : ""}`}
                  aria-label={`Field score ${targetPercent.toFixed(1)} percent`}
                  style={{ ["--score-color" as string]: colors.arc }}
                >
                  <div className="field-score-gauge-glow" aria-hidden />
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <circle
                      cx="18"
                      cy="18"
                      r={GAUGE_R}
                      fill="none"
                      stroke="#E5E7EB"
                      strokeWidth="3.4"
                    />
                    <circle
                      className="field-score-arc-main"
                      cx="18"
                      cy="18"
                      r={GAUGE_R}
                      fill="none"
                      stroke={colors.arc}
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      strokeDasharray={GAUGE_C}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 18 18)"
                    />
                    <text
                      x="18"
                      y="19"
                      textAnchor="middle"
                      className="field-score-value-text"
                      fill="#111827"
                    >
                      {displayPercent.toFixed(1)}%
                    </text>
                  </svg>
                </div>
              </div>

              {Number.isFinite(meanValue) && (
                <p
                  className={`text-center text-xs text-gray-600 mb-2 field-score-meta ${
                    reveal ? "is-revealed" : ""
                  }`}
                >
                  Mean: {meanValue.toFixed(2)}
                </p>
              )}

              <div className="mt-auto flex justify-center">
                <div
                  className={`field-score-status-box px-5 py-2.5 rounded-lg shadow text-center w-full max-w-xs ${
                    colors.box
                  } ${reveal ? "is-revealed" : ""}`}
                >
                  <div className="font-bold text-lg mb-0.5">
                    Status: {statusText}
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
