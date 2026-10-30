import React from 'react';
import { Thermometer } from 'lucide-react';
import '../Irrigation.css';

interface TemperatureCardProps {
  value: number;
  lastUpdated: Date;
  minTemp?: number;
  maxTemp?: number;
}

const TemperatureCard: React.FC<TemperatureCardProps> = ({ value, lastUpdated, minTemp, maxTemp }) => {
  // Calculate minutes since last update
  const minutesSinceUpdate = Math.floor(
    (new Date().getTime() - lastUpdated.getTime()) / 60000
  );

  // Get temperature color based on value
  const getTemperatureColor = () => {
    if (value < 15) return '#3b82f6'; // Cold - blue
    if (value < 25) return '#22c55e'; // Pleasant - green
    if (value < 30) return '#eab308'; // Warm - yellow
    return '#ef4444'; // Hot - red
  };

  // Calculate temperature gauge position (15°C to 35°C range)
  const gaugePosition = ((value - 15) / 20) * 100;
  const clampedPosition = Math.min(Math.max(gaugePosition, 0), 100);

  return (
    <div className="irrigation-card">
      <div className="card-header">
        <Thermometer className="card-icon" size={30} />
        <h3>Temperature</h3>
      </div>

      <div className="card-content temperature">
        <div className="temp-icon">
          <Thermometer size={85} color={getTemperatureColor()} />
        </div>

        <div className="metric-value" style={{ color: getTemperatureColor() }}>
          <span className="value">{value}</span>
          <span className="unit">°C</span>
        </div>

        {(typeof minTemp === 'number' && typeof maxTemp === 'number') && (
          <div className="metric-update" style={{ fontSize: '1rem', color: '#475569' }}>
            Today: <b>Min {minTemp.toFixed(1)}°C</b> / <b>Max {maxTemp.toFixed(1)}°C</b>
          </div>
        )}

        <div className="temp-gauge">
          <div className="gauge-track">
            <div
              className="gauge-indicator"
              style={{ left: `${clampedPosition}%` }}
            ></div>
          </div>
          <div className="gauge-labels">
            <span>Min: {typeof minTemp === 'number' ? minTemp.toFixed(1) : '10'}°C</span>
            <span>Max: {typeof maxTemp === 'number' ? maxTemp.toFixed(1) : '45'}°C</span>
          </div>
        </div>


      </div>
    </div>
  );
};

export default TemperatureCard;
