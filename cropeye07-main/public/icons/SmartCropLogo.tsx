import React from 'react';
import { Plane as Plant } from 'lucide-react';

export const SmartCropLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`flex items-center ${className}`}>
      <Plant className="text-green-600 mr-2" size={32} />
      <span className="text-2xl font-bold text-gray-800">SmartCrop</span>
    </div>
  );
}
