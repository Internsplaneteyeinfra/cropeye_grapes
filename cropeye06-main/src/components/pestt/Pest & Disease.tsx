import React, { useState, useEffect, useMemo } from 'react';
import { SingleCategoryRiskMeter } from './meter/SingleCategoryRiskMeter';
import { ImageModal } from './meter/ImageModal';
import { pestsData } from './meter/pestsData';
import { weedsData } from './meter/Weeds';
import { DetectionCard } from './meter/PestCard';
import {
  generateRiskAssessment,
  fetchFruitPruningDate,
  fetchPlantationDate,
  fetchCurrentWeather,
  fetchPestDetectionData,
  fetchRiskAssessmentFromApi,
  resolvePestRecord,
  resolveDiseaseRecord,
  resolveWeedRecord,
  RiskAssessmentResult,
  PestDetectionData
} from './meter/riskAssessmentService';
import { useAppContext } from '../../context/AppContext';
import { useFarmerProfile } from '../../hooks/useFarmerProfile';
import {
  getCurrentMonthLower,
  categorizeWeedsBySeason,
} from './meter/weedRiskUtils';
import { getCache, setCache } from '../utils/cache';
import './PestDisease.css';

export const PestDisease: React.FC = () => {
  const { selectedPlotName, setSelectedPlotName, selectedAnalysisDate } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const assessmentDate = selectedAnalysisDate || new Date().toISOString().split('T')[0];
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessmentResult | null>(null);
  const [pestDetectionData, setPestDetectionData] = useState<PestDetectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'Pests' | 'Diseases' | 'Weeds' | null>(null);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<'High' | 'Moderate' | 'Low' | null>(null);

  const [chemModal, setChemModal] = useState<{ open: boolean; title: string; chemicals: string[] }>({ open: false, title: '', chemicals: [] });

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `riskAssessment_${selectedPlotName}_${assessmentDate}`;
    const pestDataCacheKey = `pestDetectionData_${selectedPlotName}_${assessmentDate}_${assessmentDate}`;
    const cachedAssessment = selectedPlotName
      ? getCache(cacheKey, 30 * 60 * 1000)
      : null;
    const cachedPestData = selectedPlotName
      ? getCache(pestDataCacheKey, 30 * 60 * 1000)
      : null;

    if (cachedAssessment && cachedPestData) {
      setRiskAssessment(cachedAssessment);
      setPestDetectionData(cachedPestData);
      setIsLoading(false);
      const hasHigh =
        cachedAssessment.pests.High.length > 0 ||
        cachedAssessment.diseases.High.length > 0 ||
        (cachedAssessment.weeds?.High.length ?? 0) > 0;
      if (hasHigh) {
        setSelectedCategory(
          cachedAssessment.pests.High.length > 0
            ? 'Pests'
            : cachedAssessment.diseases.High.length > 0
              ? 'Diseases'
              : 'Weeds',
        );
        setSelectedRiskLevel('High');
      } else {
        setSelectedCategory(null);
        setSelectedRiskLevel(null);
      }
      return () => { cancelled = true; };
    }

    setRiskAssessment(null);
    setPestDetectionData(null);
    setSelectedCategory(null);
    setSelectedRiskLevel(null);
    void loadRiskAssessment(assessmentDate, () => cancelled);
    return () => { cancelled = true; };
  }, [selectedPlotName, selectedAnalysisDate]);

  const loadRiskAssessment = async (
    date: string,
    isCancelled: () => boolean,
  ) => {
    if (!selectedPlotName) {
      setIsLoading(false);
      return;
    }

    try {
      const cacheKey = `riskAssessment_${selectedPlotName}_${date}`;
      const pestDataCacheKey = `pestDetectionData_${selectedPlotName}_${date}_${date}`;

      const cachedAssessment = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
      const cachedPestData = getCache(pestDataCacheKey, 30 * 60 * 1000);

      if (cachedAssessment && cachedPestData) {
        console.log('✅ PestDisease: Using cached risk assessment for plot:', selectedPlotName);
        setRiskAssessment(cachedAssessment);
        setPestDetectionData(cachedPestData);
        setIsLoading(false);

        const wh2 = cachedAssessment.weeds?.High?.length ?? 0;
        if (
          cachedAssessment.pests.High.length > 0 ||
          cachedAssessment.diseases.High.length > 0 ||
          wh2 > 0
        ) {
          if (cachedAssessment.pests.High.length > 0) {
            setSelectedCategory('Pests');
          } else if (cachedAssessment.diseases.High.length > 0) {
            setSelectedCategory('Diseases');
          } else {
            setSelectedCategory('Weeds');
          }
          setSelectedRiskLevel('High');
        }
        return;
      }

      setIsLoading(true);

      const isToday = date === new Date().toISOString().split('T')[0];
      const apiResult = isToday
        ? await fetchRiskAssessmentFromApi(selectedPlotName)
        : null;
      if (isCancelled()) return;
      if (apiResult) {
        setCache(cacheKey, apiResult.assessment);
        setCache(pestDataCacheKey, apiResult.pestDetectionData);
        setRiskAssessment(apiResult.assessment);
        setPestDetectionData(apiResult.pestDetectionData);

        const a = apiResult.assessment;
        const hasHigh =
          a.pests.High.length > 0 ||
          a.diseases.High.length > 0 ||
          (a.weeds?.High.length ?? 0) > 0;
        if (hasHigh) {
          if (a.pests.High.length > 0) {
            setSelectedCategory('Pests');
          } else if (a.diseases.High.length > 0) {
            setSelectedCategory('Diseases');
          } else {
            setSelectedCategory('Weeds');
          }
          setSelectedRiskLevel('High');
        }
        return;
      }

      // Historical risk buckets are calculated locally because risk-assessment has no date parameter.
      const pruningDate = await fetchFruitPruningDate(selectedPlotName);
      if (isCancelled()) return;
      const weatherData = await fetchCurrentWeather(selectedPlotName || undefined);
      const pestData = await fetchPestDetectionData(
        selectedPlotName,
        date,
        date,
      );
      if (isCancelled()) return;

      const assessment = await generateRiskAssessment(
        pruningDate || await fetchPlantationDate(selectedPlotName),
        weatherData,
        selectedPlotName,
        date,
        pestData,
      );
      if (isCancelled()) return;

      setCache(cacheKey, assessment);
      setCache(pestDataCacheKey, pestData);

      setRiskAssessment(assessment);
      setPestDetectionData(pestData);

      if (assessment.pests.High.length > 0 || assessment.diseases.High.length > 0) {
        setSelectedCategory(assessment.pests.High.length > 0 ? 'Pests' : 'Diseases');
        setSelectedRiskLevel('High');
        console.log('✅ Auto-selected High risk level. Pests:', assessment.pests.High.length, 'Diseases:', assessment.diseases.High.length);
      }

    } catch (error) {
      if (!isCancelled()) console.error('Failed to load risk assessment:', error);
    } finally {
      if (!isCancelled()) setIsLoading(false);
    }
  };

  // Note: modifyAssessmentWithAPIData is no longer needed since the risk assessment
  // already includes API data, stage, and month matching in generateRiskAssessment.
  // This function is kept for backward compatibility but should not override the logic.
  const modifyAssessmentWithAPIData = (assessment: RiskAssessmentResult, pestData: PestDetectionData): RiskAssessmentResult => {
    // The assessment from generateRiskAssessment already has the correct logic:
    // - Only shows HIGH if API percentage > 0 AND stage matches AND month matches
    // - No need to modify it further
    return assessment;
  };

  const getRiskCounts = () => {
    if (!riskAssessment) return { counts: { high: 0, moderate: 0, low: 0 }, pestsByRisk: { high: [], moderate: [], low: [] } };

    const counts = {
      high: riskAssessment.pests.High.length,
      moderate: riskAssessment.pests.Moderate.length,
      low: riskAssessment.pests.Low.length
    };

    const pestsByRisk = {
      high: riskAssessment.pests.High,
      moderate: riskAssessment.pests.Moderate,
      low: riskAssessment.pests.Low
    };

    return { counts, pestsByRisk };
  };

  const getDiseaseRiskTags = () => {
    if (!riskAssessment) return { high: [], moderate: [], low: [] };

    const fungalDiseaseNames = [
      'Downy mildew',
      'Powdery mildew',
      'Anthracnose',
      'Fusarium wilt',
      'Rust',
      'Black rot',
      'Botrytis (Grey mold)',
      'Cercospora leaf spot',
    ];

    const mapNames = (names: string[]) =>
      names.map((name) => {
        const disease = resolveDiseaseRecord(name);
        const isFungal = fungalDiseaseNames.some(
          (fn) => fn.toLowerCase() === disease.name.toLowerCase()
        );
        return {
          ...disease,
          fungiPercentage:
            isFungal && pestDetectionData
              ? pestDetectionData.fungi_affected_pixel_percentage
              : undefined,
        };
      });

    return {
      high: mapNames(riskAssessment.diseases.High),
      moderate: mapNames(riskAssessment.diseases.Moderate),
      low: mapNames(riskAssessment.diseases.Low),
    };
  };

  const handleImageClick = (imageUrl: string, pestName: string) => {
    setSelectedImage({ url: imageUrl, name: pestName });
  };

  const closeImageModal = () => {
    setSelectedImage(null);
  };

  const { counts, pestsByRisk } = getRiskCounts();
  const diseasesByRisk = getDiseaseRiskTags();

  // Calculate actual detected counts (pests and diseases that have any risk level)
  const totalPestsDetected = riskAssessment ?
    riskAssessment.pests.High.length + riskAssessment.pests.Moderate.length + riskAssessment.pests.Low.length : 0;

  const totalDiseasesDetected = riskAssessment ?
    riskAssessment.diseases.High.length + riskAssessment.diseases.Moderate.length + riskAssessment.diseases.Low.length : 0;

  const currentMonthLower = useMemo(getCurrentMonthLower, []);
  const weedRiskBuckets = useMemo(() => {
    if (riskAssessment?.weeds) {
      return {
        high: riskAssessment.weeds.High.map((n) => resolveWeedRecord(n)),
        moderate: riskAssessment.weeds.Moderate.map((n) => resolveWeedRecord(n)),
        low: riskAssessment.weeds.Low.map((n) => resolveWeedRecord(n)),
      };
    }
    return categorizeWeedsBySeason(weedsData, currentMonthLower);
  }, [riskAssessment, currentMonthLower]);

  const handleRiskClick = (category: 'Pests' | 'Diseases' | 'Weeds', level: 'High' | 'Moderate' | 'Low') => {
    // If clicking the same category and level, deselect
    if (selectedCategory === category && selectedRiskLevel === level) {
      setSelectedCategory(null);
      setSelectedRiskLevel(null);
    } else {
      setSelectedCategory(category);
      setSelectedRiskLevel(level);
    }
  };

  const displayedPests = selectedRiskLevel
    ? pestsByRisk[selectedRiskLevel.toLowerCase() as 'high' | 'moderate' | 'low'].map((name: string) =>
        resolvePestRecord(name)
      )
    : [];

  const displayedDiseases = selectedRiskLevel
    ? diseasesByRisk[selectedRiskLevel.toLowerCase() as 'high' | 'moderate' | 'low']
    : [];

  if (!riskAssessment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-sm sm:text-base text-gray-600">Loading risk assessment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 xs:p-3 sm:p-4 md:p-6 lg:p-8 pest-disease-container">
      <div className="max-w-7xl mx-auto w-full">
        {/* Plot Selector - Top Left */}
        {profile && !profileLoading && (
          <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex flex-col xs:flex-row items-start xs:items-center gap-2 xs:gap-4">
              <label className="font-semibold text-gray-700 text-sm sm:text-base whitespace-nowrap">Select Plot:</label>
              <select
                value={selectedPlotName || ""}
                onChange={(e) => {
                  setSelectedPlotName(e.target.value);
                }}
                className="w-full xs:w-auto max-w-xs px-3 xs:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {profile.plots?.map(plot => {
                  let displayName = '';

                  if (plot.gat_number && plot.plot_number &&
                    plot.gat_number.trim() !== "" && plot.plot_number.trim() !== "" &&
                    !plot.gat_number.startsWith('GAT_') && !plot.plot_number.startsWith('PLOT_')) {
                    displayName = `${plot.gat_number}_${plot.plot_number}`;
                  } else if (plot.gat_number && plot.gat_number.trim() !== "" && !plot.gat_number.startsWith('GAT_')) {
                    displayName = plot.gat_number;
                  } else if (plot.plot_number && plot.plot_number.trim() !== "" && !plot.plot_number.startsWith('PLOT_')) {
                    displayName = plot.plot_number;
                  } else {
                    const village = plot.address?.village;
                    const taluka = plot.address?.taluka;

                    if (village) {
                      displayName = `Plot in ${village}`;
                      if (taluka) displayName += `, ${taluka}`;
                    } else {
                      displayName = 'Plot (No GAT/Plot Number)';
                    }
                  }

                  return (
                    <option key={plot.fastapi_plot_id} value={plot.fastapi_plot_id}>
                      {displayName}
                    </option>
                  );
                }) || []}
              </select>
            </div>
          </div>
        )}

        <div className="mb-4 sm:mb-6 md:mb-8">
          <h2 className="text-xl xs:text-2xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800 text-center mb-3 sm:mb-4 md:mb-6 px-2">
            Risk Assessment
          </h2>
          <p className="text-center text-sm text-gray-600 mb-3">
            Assessment date: <span className="font-semibold">{assessmentDate}</span>
          </p>
          <details className="mx-auto mb-4 max-w-4xl rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
            <summary className="cursor-pointer font-semibold text-blue-900">
              How pest and disease risk is calculated
            </summary>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
              <p>
                <strong>For today:</strong> the page uses the risk categories returned by the
                farm risk-assessment API. Those High, Moderate, and Low categories are displayed
                as returned; this screen does not recalculate them.
              </p>
              <p>
                <strong>For a past selected date:</strong> the page calculates risk locally.
                It checks whether the pest or disease is active in that date&apos;s month,
                whether the crop age on that date falls within its configured growth-stage
                window, and whether the matching pest-group or fungal pixel percentage is
                greater than zero.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>High:</strong> the active month and configured crop stage match,
                  and the relevant detection percentage is greater than zero.
                </li>
                <li>
                  <strong>Moderate:</strong> the active month and configured crop stage match,
                  but the relevant detection percentage is zero or unavailable.
                </li>
                <li>
                  <strong>Low:</strong> the active month matches, but the configured crop-stage
                  window does not.
                </li>
                <li>
                  Items outside their configured active months are not included. If no stage
                  window is configured for an item, its stage is treated as matching.
                </li>
              </ul>
              <p>
                Pest detection uses the matching chewing, sucking, or soil-borne pixel
                percentage. The disease detection check uses the fungi pixel percentage for
                configured fungal diseases. A value above zero raises the local category to
                High only when the month and crop stage also match; it is not a severity
                threshold.
              </p>
              <p>
                <strong>Historical-data limitation:</strong> the local calculation uses the
                selected date for month and crop age, and requests detection data for that
                date. Weather shown in the conditions is current weather; historical
                temperature and humidity are not currently used to calculate these local
                categories.
              </p>
            </div>
          </details>

          {/* Three Separate Risk Meters - One for each category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 xs:gap-4 sm:gap-5 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {/* Pests Risk Meter */}
            <SingleCategoryRiskMeter
              category="Pests"
              highCount={counts.high}
              moderateCount={counts.moderate}
              lowCount={counts.low}
              // icon="??"
              onRiskClick={handleRiskClick}
              selectedCategory={selectedCategory}
              selectedRiskLevel={selectedRiskLevel}
            />

            {/* Diseases Risk Meter */}
            <SingleCategoryRiskMeter
              category="Diseases"
              highCount={riskAssessment?.diseases.High.length || 0}
              moderateCount={riskAssessment?.diseases.Moderate.length || 0}
              lowCount={riskAssessment?.diseases.Low.length || 0}
              // icon="??"
              onRiskClick={handleRiskClick}
              selectedCategory={selectedCategory}
              selectedRiskLevel={selectedRiskLevel}
            />

            {/* Weeds Risk Meter */}
            <SingleCategoryRiskMeter
              category="Weeds"
              highCount={riskAssessment?.weeds ? riskAssessment.weeds.High.length : weedRiskBuckets.high.length}
              moderateCount={riskAssessment?.weeds ? riskAssessment.weeds.Moderate.length : weedRiskBuckets.moderate.length}
              lowCount={riskAssessment?.weeds ? riskAssessment.weeds.Low.length : weedRiskBuckets.low.length}
              // icon="??"
              onRiskClick={handleRiskClick}
              selectedCategory={selectedCategory}
              selectedRiskLevel={selectedRiskLevel}
            />
          </div>
        </div>

        {/* Conditionally Render Based on Selected Category and Risk Level */}
        {selectedCategory === 'Pests' && selectedRiskLevel && (
          <div className="mb-4 sm:mb-6 md:mb-10 px-1 xs:px-2 sm:px-0">
            <h3 className="text-lg xs:text-xl sm:text-xl md:text-2xl font-semibold text-gray-800 capitalize mb-3 sm:mb-4 text-center">
              {selectedRiskLevel} Risk Pests ({displayedPests.length})
            </h3>

            {displayedPests.length > 0 ? (
              <div className="pest-disease-grid items-start">
                {displayedPests.map((pest: any, index: number) => {
                  const cardKey = `pest-${pest.name}-${index}`;
                  return (
                    <div key={cardKey} className="w-full pest-disease-card">
                      <DetectionCard
                        type="pest"
                        data={pest}
                        riskLevel={selectedRiskLevel?.toLowerCase() as 'high' | 'moderate' | 'low'}
                        onImageClick={handleImageClick}
                        isExpanded={true}
                        onExpand={() => { }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 font-medium">No pest detected</p>
            )}
          </div>
        )}

        {/* Disease Cards */}
        {selectedCategory === 'Diseases' && selectedRiskLevel && (
          <div className="mb-4 sm:mb-6 md:mb-10 px-1 xs:px-2 sm:px-0">
            <h3 className="text-lg xs:text-xl sm:text-xl md:text-2xl font-semibold text-gray-800 capitalize mb-3 sm:mb-4 text-center">
              {selectedRiskLevel} Risk Diseases ({displayedDiseases.length})
            </h3>
            {displayedDiseases.length > 0 ? (
              <div className="pest-disease-grid items-start">
                {displayedDiseases.map((disease: any, index: number) => {
                  const cardKey = `disease-${disease.name}-${index}`;
                  return (
                    <div key={cardKey} className="w-full pest-disease-card">
                      <DetectionCard
                        type="disease"
                        data={disease}
                        riskLevel={selectedRiskLevel?.toLowerCase() as 'high' | 'moderate' | 'low'}
                        onImageClick={handleImageClick}
                        isExpanded={true}
                        onExpand={() => { }}
                        fungiPercentage={disease.fungiPercentage}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 font-medium">No disease detected</p>
            )}
          </div>
        )}

        {/* Weeds Cards */}
        {selectedCategory === 'Weeds' && selectedRiskLevel && (
          <div className="mb-4 sm:mb-6 md:mb-10 px-1 xs:px-2 sm:px-0">
            <h3 className="text-lg xs:text-xl sm:text-xl md:text-2xl font-semibold text-gray-800 capitalize mb-3 sm:mb-4 text-center">
              {selectedRiskLevel} Risk Weeds (
              {selectedRiskLevel === 'High'
                ? weedRiskBuckets.high.length
                : selectedRiskLevel === 'Moderate'
                  ? weedRiskBuckets.moderate.length
                  : weedRiskBuckets.low.length}
              )
            </h3>
            <div className="pest-disease-grid">
              {(() => {
                // Filter weeds based on selected risk level using month-based categorization
                const filteredWeeds = selectedRiskLevel === 'High'
                  ? weedRiskBuckets.high
                  : selectedRiskLevel === 'Moderate'
                    ? weedRiskBuckets.moderate
                    : weedRiskBuckets.low;

                return filteredWeeds.map((weed, index) => (
                  <div key={index} className="bg-[#fbf3ea] rounded-lg sm:rounded-xl p-3 xs:p-4 sm:p-5 md:p-6 shadow border border-orange-200 w-full pest-disease-card">
                    <div className="flex flex-col gap-3 xs:gap-4 w-full">
                      <div className="flex-1 w-full">
                        <h4 className="text-base xs:text-lg sm:text-xl font-bold text-gray-800 mb-2 break-words">
                          Weed predicted: {weed.name}
                        </h4>
                        <div className="text-xs xs:text-sm text-gray-800 mb-2">
                          <span className="font-semibold text-black">Active Months:</span> {Array.isArray(weed.months) ? weed.months.join(', ') : ''}
                        </div>
                        <ul className="text-xs xs:text-sm text-gray-700 space-y-1 list-disc ml-4 xs:ml-5">
                          {weed.when && <li className="break-words"><span className="font-semibold">When:</span> {weed.when}</li>}
                          {weed.where && <li className="break-words"><span className="font-semibold">Where:</span> {weed.where}</li>}
                          {weed.why && <li className="break-words"><span className="font-semibold">Why:</span> {weed.why}</li>}
                          
                          {weed.identification && weed.identification.length > 0 && (
                            <li className="break-words">
                              <span className="font-semibold">Identification:</span> {weed.identification.join(', ')}
                            </li>
                          )}
                          {weed.symptoms && weed.symptoms.length > 0 && (
                            <li className="break-words">
                              <span className="font-semibold">Symptoms:</span> {weed.symptoms.join(', ')}
                            </li>
                          )}
                          {weed["Organic Control"] && weed["Organic Control"].length > 0 && (
                            <li className="break-words">
                              <span className="font-semibold">Organic Control:</span> {weed["Organic Control"].join(', ')}
                            </li>
                          )}
                        </ul>
                      </div>
                      <div className="w-full mt-2 xs:mt-3 pest-disease-image-container">
                        <img
                          src={weed.image}
                          alt={weed.name}
                          className="w-full h-full object-cover rounded cursor-pointer border border-orange-200"
                          onClick={() => handleImageClick(weed.image, weed.name)}
                        />
                      </div>
                      <div className="mt-2 xs:mt-3 text-center">
                        <button
                          className="px-4 xs:px-5 sm:px-6 py-2 xs:py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded font-semibold text-xs xs:text-sm transition-colors touch-manipulation"
                          onClick={() => setChemModal({ open: true, title: weed.name, chemicals: Array.isArray(weed.chemical) ? weed.chemical : [] })}
                        >
                          ACTION
                        </button>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        <ImageModal
          isOpen={!!selectedImage}
          imageUrl={selectedImage?.url || ''}
          pestName={selectedImage?.name || ''}
          onClose={closeImageModal}
        />

        {chemModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-3 xs:p-4 pest-disease-modal">
            <div className="bg-white rounded-lg p-4 xs:p-5 sm:p-6 shadow-lg max-h-[90vh] flex flex-col pest-disease-modal-content">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h4 className="text-base xs:text-lg sm:text-xl font-bold text-gray-800">Chemical Recommendations</h4>
                <button
                  className="text-gray-500 hover:text-gray-700 active:text-gray-900 text-xl xs:text-2xl font-bold w-8 h-8 xs:w-10 xs:h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
                  onClick={() => setChemModal({ open: false, title: '', chemicals: [] })}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="text-sm xs:text-base text-gray-700 mb-3 font-semibold flex-shrink-0">{chemModal.title}</div>
              <div className="overflow-y-auto flex-1 min-h-0">
                <ul className="list-disc ml-5 xs:ml-6 text-xs xs:text-sm sm:text-base text-gray-700 space-y-1 xs:space-y-2">
                  {chemModal.chemicals.length ? chemModal.chemicals.map((c, i) => (
                    <li key={i} className="break-words">{c}</li>
                  )) : (
                    <li>No data</li>
                  )}
                </ul>
              </div>
              <div className="text-right mt-4 flex-shrink-0 pt-3 border-t border-gray-200">
                <button
                  className="px-4 xs:px-5 sm:px-6 py-2 xs:py-2.5 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded text-xs xs:text-sm sm:text-base font-semibold transition-colors touch-manipulation"
                  onClick={() => setChemModal({ open: false, title: '', chemicals: [] })}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
