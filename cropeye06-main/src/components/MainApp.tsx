import React, { useState, useEffect } from 'react';
import Map from './Map';
import SoilAnalysis from './SoilAnalysis';
import { useFarmerProfile } from '../hooks/useFarmerProfile';

interface HealthData {
  goodHealthPercent: number;
  needsAttentionPercent: number;
  totalArea: number;
  plotName: string;
}

const MainApp: React.FC = () => {
  const [selectedPlotName, setSelectedPlotName] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const { profile, loading: profileLoading } = useFarmerProfile();

  // Auto-select first plot from farmer profile when profile loads
  useEffect(() => {
    console.log('MainApp: Profile loading state:', profileLoading);
    console.log('MainApp: Profile data:', profile);
    console.log('MainApp: Profile plots:', profile?.plots);
    console.log('MainApp: Profile plots length:', profile?.plots?.length);
    console.log('MainApp: Current selectedPlotName:', selectedPlotName);
    
    if (!profileLoading && profile?.plots && profile.plots.length > 0 && !selectedPlotName) {
      const firstPlot = profile.plots[0];
      console.log('MainApp: First plot data:', firstPlot);
      const plotName = firstPlot.fastapi_plot_id || `${firstPlot.gat_number}_${firstPlot.plot_number}`;
      console.log('MainApp: Generated plot name:', plotName);
      setSelectedPlotName(plotName);
      console.log('MainApp: Auto-selected first plot:', plotName);
    } else {
      console.log('MainApp: Not auto-selecting plot. Reasons:');
      console.log('- profileLoading:', profileLoading);
      console.log('- profile exists:', !!profile);
      console.log('- plots exist:', !!profile?.plots);
      console.log('- plots length > 0:', (profile?.plots?.length ?? 0) > 0);
      console.log('- selectedPlotName is null:', selectedPlotName === null);
    }
  }, [profile, profileLoading, selectedPlotName]);

  // Get display name for the selected plot
  const getPlotDisplayName = (plotId: string | null) => {
    if (!plotId || !profile?.plots) return plotId;
    
    const plot = profile.plots.find(p => p.fastapi_plot_id === plotId);
    if (plot) {
      // Use gat_number or plot_number as display name, fallback to fastapi_plot_id
      return plot.gat_number || plot.plot_number || plot.fastapi_plot_id;
    }
    
    return plotId;
  };

  const plotDisplayName = getPlotDisplayName(selectedPlotName);

  const handlePlotChange = (plotName: string | null) => {
    setSelectedPlotName(plotName);
    // Reset health data when plot changes
    if (!plotName) {
      setHealthData(null);
    }
  };

  const handleHealthDataChange = (data: HealthData) => {
    setHealthData(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b w-full box-border">
        <div className="w-full py-4 pl-3 pr-3 sm:pl-4 sm:pr-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Agricultural Plot Analysis Dashboard
          </h1>
          {plotDisplayName && (
            <p className="text-sm text-gray-600 mt-1">
              Currently analyzing Plot: <span className="font-medium">{plotDisplayName}</span>
            </p>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Health Summary Cards */}
        {healthData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">Plot Health</div>
              <div className="mt-2 text-3xl font-bold text-green-600">
                {healthData.goodHealthPercent}%
              </div>
              <div className="text-sm text-gray-600">Good Health</div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">Needs Attention</div>
              <div className="mt-2 text-3xl font-bold text-orange-600">
                {healthData.needsAttentionPercent}%
              </div>
              <div className="text-sm text-gray-600">Requires Care</div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500">Total Area</div>
              <div className="mt-2 text-3xl font-bold text-blue-600">
                {healthData.totalArea.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">acre</div>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Plot Visualization</h2>
              <p className="text-sm text-gray-600">
                Select a plot and view vegetation indices analysis
              </p>
            </div>
            <div className="h-96">
              <Map 
                onHealthDataChange={handleHealthDataChange}
                onPlotChange={handlePlotChange}
              />
            </div>
          </div>

          {/* Soil Analysis Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Soil Analysis</h2>
              <p className="text-sm text-gray-600">
                Detailed nutrient and pH analysis for selected plot
              </p>
            </div>
            <div className="p-4">
              <SoilAnalysis plotName={selectedPlotName} phValue={null} />
            </div>
          </div>
        </div>

        {/* Instructions */}
        {!selectedPlotName && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100">
                  <span className="text-blue-600 font-semibold">i</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Getting Started
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p className="mb-2">Follow these steps to analyze your plots:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Select a plot from the dropdown in the map section</li>
                    <li>View the vegetation analysis and health metrics</li>
                    <li>Check the corresponding soil analysis data with live pH values</li>
                    <li>Use different vegetation layers (Growth, Water Uptake, Soil Moisture) for comprehensive analysis</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Available Plots Info */}
        {profile?.plots && profile.plots.length > 0 && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Available Plots</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {profile.plots.map((plot) => {
                const plotName = plot.fastapi_plot_id || `${plot.gat_number}_${plot.plot_number}`;
                const displayName = plot.gat_number || plot.plot_number || plot.fastapi_plot_id;
                return (
                  <div
                    key={plotName}
                    className={`text-center p-2 rounded border text-sm ${
                      selectedPlotName === plotName
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    {displayName}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MainApp;