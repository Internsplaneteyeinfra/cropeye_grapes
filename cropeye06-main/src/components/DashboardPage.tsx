import React, { useState } from "react";
import Map from "./Map";
import Irrigation from "./Irrigation";

const DashboardPage = () => {
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [soilMoisture, setSoilMoisture] = useState<number>(0);
  const [waterUptake, setWaterUptake] = useState<number>(0);

  return (
    <div className="flex flex-col md:flex-row">
      <Map
        selectedPlotId={selectedPlotId}
        onSelectedPlotIdChange={setSelectedPlotId}
        onIrrigationStatsUpdate={({ waterUptake, soilMoisture }) => {
          setWaterUptake(waterUptake);
          setSoilMoisture(soilMoisture);
        }}
      />
      <Irrigation
        soilMoisturePercent={soilMoisture}
        waterUptakePercent={waterUptake}
      />
    </div>
  );
};

export default DashboardPage;
