import React from 'react';
import { Cloud } from 'lucide-react';
import '../Irrigation.css';

interface RainfallCardProps {
  value: number;
  lastUpdated: Date;
}

const RainfallCard: React.FC<RainfallCardProps> = ({ value, lastUpdated }) => {
  // Calculate minutes since last update
  const minutesSinceUpdate = Math.floor(
    (new Date().getTime() - lastUpdated.getTime()) / 60000
  );

  // Determine rainfall status based on value
  const hasRainfall = value > 0;
  const trend = hasRainfall ? 'Increasing' : 'Zero Rainfall Recorded';
  const trendSymbol = hasRainfall ? '\u2191' : '\u2193';
  const cloudColor = hasRainfall ? '#4287f5' : '#94a3b8'; // Blue if rainfall, gray if none

  return (
    <div className="irrigation-card">
      <div className="card-header">
        <Cloud className="card-icon" size={24} />
        <h3>Current Rainfall</h3>
      </div>

      <div className="card-content rainfall">
        <div className="rainfall-icon">
          <Cloud size={64} color={cloudColor} />
        </div>

        <div className="metric-value">
          <span className="value">{value.toFixed(1)}</span>
          <span className="unit">mm</span>
        </div>

        <div className="metric-trend">
          <span className={`trend ${hasRainfall ? 'increasing' : 'zero-rainfall'}`}>
            {trendSymbol} {trend}
          </span>
        </div>
      </div>

      <div className="card-footer">
        <span>Updated {minutesSinceUpdate} min ago</span>
      </div>
    </div>
  );
};

export default RainfallCard;
