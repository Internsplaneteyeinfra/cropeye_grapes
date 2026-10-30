
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
        <div className="mb-3 font-semibold text-green-700 text-base">Organic Controls</div>
        <ul className="mb-4 space-y-2">
          {organicControls.length > 0 ? (
            organicControls.map((item: string, idx: number) => {
              const match = item.match(/^([A-Za-z\s\d.%]+)[\s:-]+(.+)$/);
              const name = match?.[1]?.trim() || item;
              const dosage = match?.[2]?.trim() || '';
              return (
                <li key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-1">
                    <span className="text-black">{name}</span>
                    <Info className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  {dosage && (
                    <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded ml-2 sm:ml-0">
                      {dosage}
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="text-gray-500 text-sm">No organic controls available</li>
          )}
        </ul>
        <div className="mb-3 font-semibold text-red-700 text-base">Chemical Controls</div>
        <ul className="space-y-2">
          {chemicalControls.length > 0 ? (
            chemicalControls.map((item: string, idx: number) => {
              const match = item.match(/^([A-Za-z\s\d.%]+)[\s:-]+(.+)$/);
              const name = match?.[1]?.trim() || item;
              const dosage = match?.[2]?.trim() || '';
              return (
                <li key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-1">
                    <span className="text-black">{name}</span>
                    <Info className="w-4 h-4 text-red-600 flex-shrink-0" />
                  </div>
                  {dosage && (
                    <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded ml-2 sm:ml-0">
                      {dosage}
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="text-gray-500 text-sm">No chemical controls available</li>
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
      <div className={`rounded-xl shadow-lg border-2 ${styles.bgColor} p-3 sm:p-4 md:p-6`}>
        <div className="flex flex-col gap-3">
          <div className="flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-black mb-2">
              {type === 'pest' ? 'Possible Pest' : 'Possible Disease'}: {name}
            </h2>
            <div className="text-xs sm:text-sm text-gray-800 space-y-1">
              <div><Clock className={`inline w-4 h-4 mr-1 ${styles.accentColor}`} /><span className="font-bold text-black">When:</span> {when ? when[riskLevel] : ''}</div>
              <div><MapPin className={`inline w-4 h-4 mr-1 ${styles.accentColor}`} /><span className="font-bold text-black">Where:</span> {where}</div>
              <div><Info className={`inline w-4 h-4 mr-1 ${styles.accentColor}`} /><span className="font-bold text-black">Why:</span> {why}</div>
              {fungiPercentage !== undefined && (
                <div>
                  {/* <span className="font-bold text-black">Fungi Affected:</span> {fungiPercentage.toFixed(2)}% */}
                </div>
              )}
              {months && months.length > 0 && (
                <div>
                  <Calendar className={`inline w-4 h-4 mr-1 ${styles.accentColor}`} />
                  <span className="font-bold text-black">Active Months:</span> {months.join(', ')}
                </div>
              )}
            </div>

            {/* Always show symptoms and identification */}
            <div className="mt-3 text-xs sm:text-sm bg-white border border-gray-300 rounded-md p-3">
              {symptoms.length > 0 && (
                <>
                  <p className="font-bold text-black mb-1">Symptoms:</p>
                  <ul className="list-disc pl-5 mb-2">
                    {symptoms.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </>
              )}
              {identification.length > 0 && (
                <>
                  <p className="font-bold text-black mb-1">Identification:</p>
                  <ul className="list-disc pl-5">
                    {identification.map((id: string, i: number) => <li key={i}>{id}</li>)}
                  </ul>
                </>
              )}
            </div>

            {/* Image moved to bottom after symptoms box */}
            <div className="relative w-full mt-3">
              <img
                src={image}
                alt={name}
                className="w-full h-48 object-cover rounded-md cursor-pointer"
                onClick={() => onImageClick(image, name)}
              />
              <button className="absolute top-1 right-1 p-1 bg-black bg-opacity-50 text-white rounded">
                <Maximize2 className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 text-center">
          <button
            onClick={() => setShowModal(true)}
            className="text-white bg-red-600 hover:bg-red-700 font-bold py-1 px-4 rounded text-sm"
          >
            ACTION
          </button>
        </div>




      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex justify-center items-center p-4">
          <div className="bg-white rounded-tl-lg rounded-tr-lg w-full max-w-sm sm:max-w-md relative">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-red-700">Action for {name}</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-2xl font-bold text-gray-600 hover:text-gray-800"
              >
                ×
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {renderActionItems()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
