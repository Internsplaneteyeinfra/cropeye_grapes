import React from 'react';
import { WeatherData } from '../types';
import { Thermometer, Droplets, MapPin, Clock } from 'lucide-react';

interface WeatherPanelProps {
  weather: WeatherData;
  isLoading: boolean;
}

const WeatherPanel: React.FC<WeatherPanelProps> = ({ weather, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="flex space-x-6">
          <div className="h-10 bg-gray-200 rounded w-24"></div>
          <div className="h-10 bg-gray-200 rounded w-24"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 transition-all hover:shadow-lg">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex items-center">
          <MapPin size={18} className="text-green-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-800">{weather.location}</h2>
        </div>
        <div className="flex items-center text-sm text-gray-500">
          <Clock size={16} className="mr-1" />
          <span>Updated: {weather.lastUpdated}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center p-3 bg-green-50 rounded-lg">
          <Thermometer size={24} className="text-red-500 mr-3" />
          <div>
            <p className="text-sm text-gray-500">Temperature</p>
            <p className="text-xl font-semibold">{weather.temperature}°C</p>
          </div>
        </div>

        <div className="flex items-center p-3 bg-blue-50 rounded-lg">
          <Droplets size={24} className="text-blue-500 mr-3" />
          <div>
            <p className="text-sm text-gray-500">Humidity</p>
            <p className="text-xl font-semibold">{weather.humidity}%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherPanel;
