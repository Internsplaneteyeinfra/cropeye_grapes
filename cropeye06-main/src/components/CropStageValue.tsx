import React from "react";
import { Loader2 } from "lucide-react";
import { useGrapesStage } from "../hooks/useGrapesStage";

/** Value block for the dashboard "Crop Stage" card, backed by GET /grapes/stages. */
const CropStageValue: React.FC<{ plotId: string | null | undefined; className?: string }> = ({
  plotId,
  className = "text-lg",
}) => {
  const { loading, stageName, stageDays, seasonDays, seasonOver } =
    useGrapesStage(plotId);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin ml-auto" />;
  if (!stageName) return <span className={`${className} font-bold`}>-</span>;

  return (
    <div className="text-right">
      <div
        className={`${className} font-bold leading-tight`}
        style={{ color: "#212121", fontFamily: "Inter, Poppins, sans-serif" }}
      >
        {seasonOver ? "Season ended" : stageName}
      </div>
      {seasonOver ? (
        <div className="text-xs font-semibold mt-0.5 text-amber-700">
          Day {seasonDays ?? "-"} · update pruning dates
        </div>
      ) : (
        (stageDays || seasonDays) && (
          <div className="text-xs font-semibold mt-0.5" style={{ color: "#6bb043" }}>
            {stageDays ? `Stage day ${stageDays}` : ""}
            {stageDays && seasonDays ? " · " : ""}
            {seasonDays ? `Season ${seasonDays}` : ""}
          </div>
        )
      )}
    </div>
  );
};

export default CropStageValue;
