
import React, { useState } from 'react';
import { Pest, RiskLevel } from './pestsData';
import {
  Maximize2,
  Calendar,
  MapPin,
  Info,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Disease {
  name: string;
  symptoms: string[];
  identification?: string[];
  organic: string[];
  chemical: string[];
  image: string;
  when?: Record<string, string>;
  where?: string;
  why?: string;
  months?: string[];
}

interface DetectionCardProps {
  type: 'pest' | 'disease';
  data: Pest | Disease;
  riskLevel: RiskLevel;
  onImageClick: (imageUrl: string, name: string) => void;
  isExpanded: boolean;
  onExpand: () => void;
  fungiPercentage?: number;
}

export const DetectionCard: React.FC<DetectionCardProps> = ({
  type,
  data,
  riskLevel,
  onImageClick,
  isExpanded,
  onExpand,
  fungiPercentage,
}) => {
  const [showModal, setShowModal] = useState(false);

  const getRiskStyles = () => {
    switch (riskLevel) {
      case 'high':
        return { bgColor: 'bg-red-50', accentColor: 'text-red-600' };
      case 'moderate':
        return { bgColor: 'bg-orange-50', accentColor: 'text-orange-600' };
      default:
        return { bgColor: 'bg-green-50', accentColor: 'text-green-600' };
    }
  };

  const renderActionItems = () => {
    const organicControls = (data as any).organic || [];
    const chemicalControls = (data as any).chemical || [];

    return (
      <>
        <div className="mb-2 xs:mb-3 font-semibold text-green-700 text-sm xs:text-base">Organic Controls</div>
        <ul className="mb-3 xs:mb-4 space-y-1.5 xs:space-y-2">
          {organicControls.length > 0 ? (
            organicControls.map((item: string, idx: number) => {
              const match = item.match(/^([A-Za-z\s\d.%]+)[\s:-]+(.+)$/);
              const name = match?.[1]?.trim() || item;
              const dosage = match?.[2]?.trim() || '';
              return (
                <li key={idx} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-2">
                  <div className="flex items-start xs:items-center gap-1 xs:gap-2 flex-1">
                    <span className="text-black text-xs xs:text-sm break-words">{name}</span>
                    <Info className="w-3 h-3 xs:w-4 xs:h-4 text-green-600 flex-shrink-0 mt-0.5 xs:mt-0" />
                  </div>
                  {dosage && (
                    <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded self-start xs:self-auto">
                      {dosage}
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="text-gray-500 text-xs xs:text-sm">No organic controls available</li>
          )}
        </ul>
        <div className="mb-2 xs:mb-3 font-semibold text-red-700 text-sm xs:text-base">Chemical Controls</div>
        <ul className="space-y-1.5 xs:space-y-2">
          {chemicalControls.length > 0 ? (
            chemicalControls.map((item: string, idx: number) => {
              const match = item.match(/^([A-Za-z\s\d.%]+)[\s:-]+(.+)$/);
              const name = match?.[1]?.trim() || item;
              const dosage = match?.[2]?.trim() || '';
              return (
                <li key={idx} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-2">
                  <div className="flex items-start xs:items-center gap-1 xs:gap-2 flex-1">
                    <span className="text-black text-xs xs:text-sm break-words">{name}</span>
                    <Info className="w-3 h-3 xs:w-4 xs:h-4 text-red-600 flex-shrink-0 mt-0.5 xs:mt-0" />
                  </div>
                  {dosage && (
                    <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded self-start xs:self-auto">
                      {dosage}
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="text-gray-500 text-xs xs:text-sm">No chemical controls available</li>
          )}
        </ul>
      </>
    );
  };

  const styles = getRiskStyles();

  const name = data.name || 'Unknown';
  const image = (data as any).image || '/Image/wilt.png';
  const symptoms = data.symptoms || [];
  const identification = (data as any).identification || [];
  const when = (data as any).when || {};
  const where = (data as any).where || 'Unknown';
  const why = (data as any).why || 'Unknown';
  const months = (data as any).months || [];

  return (
    <>
      <div className={`rounded-lg xs:rounded-xl shadow-lg border-2 ${styles.bgColor} p-3 xs:p-4 sm:p-5 md:p-6 w-full pest-disease-card`}>
        <div className="flex flex-col gap-2 xs:gap-3">
          <div className="flex-1 w-full">
            <h2 className="text-base xs:text-lg sm:text-xl font-bold text-black mb-2 break-words">
              {type === 'pest' ? 'Pest predicated' : 'Disease predicated'}: {name}
            </h2>
            <div className="text-xs xs:text-sm text-gray-800 space-y-1 xs:space-y-1.5">
              <div className="flex items-start gap-1">
                <Clock className={`w-3 h-3 xs:w-4 xs:h-4 mt-0.5 flex-shrink-0 ${styles.accentColor}`} style={{ minWidth: '1em' }} />
                <span className="flex-1"><span className="font-bold text-black">When:</span> {when ? when[riskLevel] : ''}</span>
              </div>
              <div className="flex items-start gap-1">
                <MapPin className={`w-3 h-3 xs:w-4 xs:h-4 mt-0.5 flex-shrink-0 ${styles.accentColor}`} style={{ minWidth: '1em' }} />
                <span className="flex-1"><span className="font-bold text-black">Where:</span> {where}</span>
              </div>
              <div className="flex items-start gap-1">
                <Info className={`w-3 h-3 xs:w-4 xs:h-4 mt-0.5 flex-shrink-0 ${styles.accentColor}`} style={{ minWidth: '1em' }} />
                <span className="flex-1"><span className="font-bold text-black">Why:</span> {why}</span>
              </div>
              {fungiPercentage !== undefined && (
                <div>
                  {/* <span className="font-bold text-black">Fungi Affected:</span> {fungiPercentage.toFixed(2)}% */}
                </div>
              )}
              {months && months.length > 0 && (
                <div className="flex items-start gap-1">
                  <Calendar className={`w-3 h-3 xs:w-4 xs:h-4 mt-0.5 flex-shrink-0 ${styles.accentColor}`} style={{ minWidth: '1em' }} />
                  <span className="flex-1"><span className="font-bold text-black">Active Months:</span> {months.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Always show symptoms and identification */}
            <div className="mt-2 xs:mt-3 text-xs xs:text-sm bg-white border border-gray-300 rounded-md p-2 xs:p-3 w-full">
              {symptoms.length > 0 && (
                <>
                  <p className="font-bold text-black mb-1 text-xs xs:text-sm">Symptoms:</p>
                  <ul className="list-disc pl-4 xs:pl-5 mb-2 space-y-0.5 xs:space-y-1">
                    {symptoms.map((s: string, i: number) => <li key={i} className="break-words">{s}</li>)}
                  </ul>
                </>
              )}
              {identification.length > 0 && (
                <>
                  <p className="font-bold text-black mb-1 text-xs xs:text-sm">Identification:</p>
                  <ul className="list-disc pl-4 xs:pl-5 space-y-0.5 xs:space-y-1">
                    {identification.map((id: string, i: number) => <li key={i} className="break-words">{id}</li>)}
                  </ul>
                </>
              )}
            </div>

            {/* Image moved to bottom after symptoms box */}
            <div className="relative w-full mt-2 xs:mt-3 pest-disease-image-container">
              <img
                src={image}
                alt={name}
                className="w-full h-full object-cover rounded-md cursor-pointer"
                onClick={() => onImageClick(image, name)}
              />
              <button className="absolute top-1 right-1 xs:top-2 xs:right-2 p-1 xs:p-1.5 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded transition-colors touch-manipulation">
                <Maximize2 className="w-3 h-3 xs:w-4 xs:h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 xs:mt-4 text-center">
          <button
            onClick={() => setShowModal(true)}
            className="text-white bg-red-600 hover:bg-red-700 active:bg-red-800 font-bold py-2 xs:py-2.5 px-4 xs:px-5 sm:px-6 rounded text-xs xs:text-sm sm:text-base transition-colors touch-manipulation"
          >
            ACTION
          </button>
        </div>




      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex justify-center items-center p-3 xs:p-4">
          <div className="bg-white rounded-lg xs:rounded-tl-lg xs:rounded-tr-lg w-full max-w-sm sm:max-w-md md:max-w-lg relative max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-3 xs:p-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-base xs:text-lg sm:text-xl font-bold text-red-700 pr-2 break-words">Action for {name}</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-xl xs:text-2xl font-bold text-gray-600 hover:text-gray-800 active:text-gray-900 w-8 h-8 xs:w-10 xs:h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors touch-manipulation flex-shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-3 xs:p-4 max-h-[calc(90vh-80px)] overflow-y-auto flex-1 min-h-0">
              {renderActionItems()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
