import React, { useState, useEffect } from "react";
import { useAppContext } from "../../../context/AppContext";

const EvapotranspirationGraph: React.FC = () => {
  const { appState, getCached, selectedPlotName } = useAppContext();
  const trendData = Array.isArray(appState?.etTrendData) ? appState.etTrendData : [];
  const etValue = appState?.etValue ?? 0;

  // Get hourlyData from cache if available
  const [hourlyData, setHourlyData] = useState<Array<{time: string, value: number}>>([]);

  useEffect(() => {
    if (selectedPlotName) {
      const cacheKey = `etData_${selectedPlotName}`;
      const cached = getCached(cacheKey);
      if (cached?.hourlyData && Array.isArray(cached.hourlyData)) {
        setHourlyData(cached.hourlyData);
      }
    }
  }, [selectedPlotName, getCached]);

  // Chart dimensions
  const leftPadding = 60;
  const rightPadding = 60;
  const topPadding = 40;
  const bottomPadding = 60;
  const chartHeight = 300;

  // Make chart responsive
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector('.evapotranspiration-graph-container');
      if (container) {
        setContainerWidth(Math.min(container.clientWidth - 40, 1200));
      } else {
        // Fallback: use window width
        setContainerWidth(Math.min(window.innerWidth - 80, 1200));
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const responsiveChartWidth = Math.max(containerWidth, 600);

  // Determine the highest ET value and round the Y-axis max to a “nice” value
  const rawMaxValue =
    Array.isArray(trendData) && trendData.length > 0
      ? Math.max(...trendData.map((v: any) => Number(v) || 0), etValue)
      : Math.max(etValue, 0);

  // Helper: round up to a visually pleasing maximum (1, 2, 5, 10, 20, 50, etc.)
  const getNiceMax = (value: number): number => {
    const safeValue = value <= 0 ? 1 : value;
    const exponent = Math.floor(Math.log10(safeValue));
    const base = Math.pow(10, exponent);
    const fraction = safeValue / base;

    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;

    return niceFraction * base;
  };

  // Y-axis max: use only hourly bar data (exclude etValue – it's a daily total
  // and inflates the scale). Minimum ceiling is 2 mm for readability.
  const rawHourlyMax =
    Array.isArray(trendData) && trendData.length > 0
      ? Math.max(...trendData.map((v: any) => Number(v) || 0))
      : 0;
  const maxTrendValue = rawHourlyMax > 2 ? Math.ceil(rawHourlyMax) : 2;

  // Calculate bar width and spacing
  const barCount = trendData.length || 24;
  const availableWidth = responsiveChartWidth - leftPadding - rightPadding;
  const barWidth = Math.max(2, (availableWidth / barCount) - 2); // 2px gap between bars
  const barSpacing = availableWidth / barCount;

  const getBarX = (index: number) => {
    return leftPadding + (barSpacing * index) + (barSpacing - barWidth) / 2;
  };

  const getBarHeight = (value: number) => {
    const maxHeight = chartHeight - topPadding - bottomPadding;
    return (value / maxTrendValue) * maxHeight;
  };

  const getBarY = (value: number) => {
    const barHeight = getBarHeight(value);
    return chartHeight - bottomPadding - barHeight;
  };

  // Generate Y-axis ticks only (no full horizontal grid lines, just left axis “points”)
  const yTicks = Array.from({ length: 6 }).map((_, i) => {
    const value = (maxTrendValue / 5) * i;
    const y =
      topPadding +
      (chartHeight - topPadding - bottomPadding) * (1 - value / maxTrendValue);
    return (
      <g key={`ytick-${i}`}>
        {/* Small tick mark on Y-axis */}
        <line
          x1={leftPadding - 6}
          y1={y}
          x2={leftPadding}
          y2={y}
          stroke="#94a3b8"
          strokeWidth="1"
        />
        {/* Y-axis label */}
        <text
          x={leftPadding - 10}
          y={y + 4}
          textAnchor="end"
          fontSize="12"
          fill="#64748b"
        >
          {value.toFixed(1)}
        </text>
      </g>
    );
  });

  // Generate hour labels (X-axis) - show every 2-3 hours to avoid crowding
  const labelInterval = Math.ceil(barCount / 12); // Show about 12 labels
  const hourLabels = trendData.map((_, i: number) => {
    if (i % labelInterval !== 0 && i !== trendData.length - 1) return null;
    const x = getBarX(i) + barWidth / 2;
    const hour = i.toString().padStart(2, '0');
    return (
      <g key={`label-${i}`}>
        <line
          x1={x}
          y1={chartHeight - bottomPadding}
          x2={x}
          y2={chartHeight - bottomPadding + 5}
          stroke="#64748b"
          strokeWidth="1"
        />
        <text
          x={x}
          y={chartHeight - bottomPadding + 20}
          textAnchor="middle"
          fontSize="11"
          fill="#64748b"
        >
          {hour}:00
        </text>
      </g>
    );
  }).filter(Boolean);

  return (
    <div className="evapotranspiration-graph-container" style={{
      width: '100%',
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginTop: '20px'
    }}>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        24-Hour Evapotranspiration Trend
      </h3>

      {trendData.length > 0 ? (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            width={responsiveChartWidth}
            height={chartHeight}
            style={{ display: 'block', margin: '0 auto', minWidth: '600px' }}
          >
            {/* Y-axis ticks only (no full horizontal grid) */}
            {yTicks}

            {/* Bars */}
            {trendData.map((val: number, i: number) => {
              const numVal = Number(val) || 0;
              const barHeight = getBarHeight(numVal);
              const x = getBarX(i);
              const y = getBarY(numVal);

              // Get time from hourlyData if available
              const timeData = hourlyData[i] || null;
              const displayTime = timeData?.time
                ? new Date(timeData.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                : `${i.toString().padStart(2, '0')}:00`;

              return (
                <g key={`bar-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill="#3b82f6"
                    rx="2"
                    style={{ transition: 'all 0.3s ease' }}
                  >
                    <title>{`${displayTime} - ${numVal.toFixed(2)} mm`}</title>
                  </rect>
                </g>
              );
            })}

            {/* X-axis labels */}
            {hourLabels}

            {/* Y-axis label */}
            <text
              x={20}
              y={chartHeight / 2}
              textAnchor="middle"
              fontSize="12"
              fill="#64748b"
              transform={`rotate(-90, 20, ${chartHeight / 2})`}
            >
              Evapotranspiration (mm)
            </text>
          </svg>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#94a3b8',
          fontSize: '14px'
        }}>
          No evapotranspiration data available
        </div>
      )}
    </div>
  );
};

export default EvapotranspirationGraph;
