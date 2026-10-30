import React from "react";
import type { BrixTimeSeriesPoint } from "../../utils/grapesEventsBundle";

const W = 160;
const H = 40;
const PAD = 3;

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : iso;
}

/** Small Brix trend line; renders only real readings from /grapes/brix-time-series. */
const BrixSparkline: React.FC<{ points: BrixTimeSeriesPoint[] }> = ({ points }) => {
  const readings = points.filter((p): p is BrixTimeSeriesPoint & { brix: number } => p.brix != null);
  if (readings.length < 2) return null;

  const values = readings.map((p) => p.brix);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (readings.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = readings.map((p, i) => `${x(i).toFixed(1)},${y(p.brix).toFixed(1)}`).join(" ");
  const last = readings[readings.length - 1];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Brix trend from ${shortDate(readings[0].date)} to ${shortDate(last.date)}`}
      >
        <polygon
          points={`${x(0)},${H - PAD} ${line} ${x(readings.length - 1)},${H - PAD}`}
          fill="rgba(37,99,235,0.12)"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {readings.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.brix)} r={i === readings.length - 1 ? 2.6 : 1.6} fill="#2563eb">
            <title>{`${shortDate(p.date)}: ${p.brix.toFixed(2)} °Brix`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{shortDate(readings[0].date)}</span>
        <span>{shortDate(last.date)}</span>
      </div>
    </div>
  );
};

export default BrixSparkline;
