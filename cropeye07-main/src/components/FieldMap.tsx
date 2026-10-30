import React from 'react';

interface FieldMapProps {}

export const FieldMap: React.FC<FieldMapProps> = () => {
  return (
    <div className="card h-full">
      <div className="card-header">
        <h2 className="card-title">Field Map View</h2>
      </div>
      <div className="h-64 grid grid-cols-3 grid-rows-3">
        {/* First row */}
        <div className="field-map-cell field-map-good"></div>
        <div className="field-map-cell field-map-good"></div>
        <div className="field-map-cell field-map-needs-irrigation"></div>

        {/* Second row */}
        <div className="field-map-cell field-map-good relative">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#FF5252" fillOpacity="0.2" stroke="#FF5252" strokeWidth="2"/>
              <path d="M12 13C13.1046 13 14 12.1046 14 11C14 9.89543 13.1046 9 12 9C10.8954 9 10 9.89543 10 11C10 12.1046 10.8954 13 12 13Z" fill="#FF5252" stroke="#FF5252" strokeWidth="2"/>
            </svg>
          </div>
        </div>
        <div className="field-map-cell field-map-needs-irrigation"></div>

        {/* Third row */}
        <div className="field-map-cell field-map-good"></div>
        <div className="field-map-cell field-map-needs-irrigation"></div>
        <div className="field-map-cell field-map-issue"></div>
      </div>
      <div className="p-3 text-xs flex gap-4 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-400 rounded"></div>
          <span>Good crop health</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-purple-300 rounded"></div>
          <span>Needs irrigation</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-300 rounded"></div>
          <span>Crop health issue</span>
        </div>
      </div>
    </div>
  );
};
