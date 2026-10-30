import React, { useState } from 'react';
import './App.css';
import { Header } from './HeaderFarm';
import  SoilAnalysis  from './SoilAnalysis';
import { FieldHealthAnalysis } from './FieldHealthAnalysis';
import CropHealthAnalysis from './CropHealthAnalysis';
import FertilizerTable from './FertilizerTable';
import IrrigationSchedule from './IrrigationSchedule';
import WeatherForecast from './WeatherForecast';
import Map from './Map';
import Fertilizer from './Fertilizer';
import Irrigation from './Irrigation/Irrigation';
import SoilMoistureCard from './Irrigation/cards/SoilMoistureCard';

function FarmerHomeGrid() {
  const [healthData, setHealthData] = useState<{
    goodHealthPercent: number;
    needsAttentionPercent: number;
    totalArea: number;
    plotName: string;
  } | null>(null);

  interface SoilAnalysisProps {
    plotName: string;
    phValue: number | null;
    phStatistics?: {
      phh2o_0_5cm_mean_mean: number;
    };
  }

  const [soilData, setSoilData] = useState<{
    plotName: string;
    phValue: number | null;
    phStatistics?: {
      phh2o_0_5cm_mean_mean: number;
    };
    total_nitrogen?: number;
    nitrogen_0_5cm_mean?: number;
  } | null>(null);

  // New state for field analysis data
  const [fieldAnalysisData, setFieldAnalysisData] = useState<{
    plotName: string;
    overallHealth: number;
    healthStatus: string;
    statistics: {
      mean: number;
    };
  } | null>(null);

  // State to track selected plot name
  const [selectedPlotName, setSelectedPlotName] = useState<string | null>(null);

  // NEW: State for moist ground percent
  const [moistGroundPercent, setMoistGroundPercent] = useState<number | null>(null);

  const handleHealthDataChange = (data: {
    goodHealthPercent: number;
    needsAttentionPercent: number;
    totalArea: number;
    plotName: string;
  }) => {
    setHealthData(data);
  };

  const handleSoilDataChange = (data: {
    plotName: string;
    phValue: number | null;
    phStatistics?: {
      phh2o_0_5cm_mean_mean: number;
    };
    total_nitrogen?: number;
    nitrogen_0_5cm_mean?: number;
  }) => {
    setSoilData(data);
    setSelectedPlotName(data.plotName || null);
  };

  // New handler for field analysis data
  const handleFieldAnalysisChange = (data: {
    plotName: string;
    overallHealth: number;
    healthStatus: string;
    statistics: {
      mean: number;
    };
  }) => {
    setFieldAnalysisData(data);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto px-2 sm:px-4 py-2 sm:py-4 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 w-full">
          <div className="lg:col-span-2 w-full">
            <Map
              onHealthDataChange={handleHealthDataChange}
              onSoilDataChange={handleSoilDataChange}
              onFieldAnalysisChange={handleFieldAnalysisChange}
              onMoistGroundChange={setMoistGroundPercent} // NEW
            />
          </div>
          <div className="lg:col-span-1 w-full">
            <SoilAnalysis
              selectedPlotName={selectedPlotName}
              phValue={soilData?.phValue || null}
              phStatistics={soilData?.phStatistics}
            />
          </div>
          <div className="lg:col-span-1 h-full w-full">
            <FieldHealthAnalysis
              fieldAnalysisData={fieldAnalysisData}
            />
          </div>
          <div className="lg:col-span-1 h-full w-full">
            <CropHealthAnalysis />
          </div>
          <div className="lg:col-span-1 w-full">
            <IrrigationSchedule />
          </div>
          <div className="lg:col-span-3 w-full">
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2 sm:gap-4 items-stretch">
              <div className="w-full min-h-[420px]">
                <FertilizerTable />
              </div>
              <div className="w-full">
                <SoilMoistureCard optimalRange={[40, 60]} />
              </div>
            </div>
          </div>
          <div className="lg:col-span-3 w-full">
            <WeatherForecast />
          </div>
        </div>
      </main>
    </div>
  );
}

export default FarmerHomeGrid;
