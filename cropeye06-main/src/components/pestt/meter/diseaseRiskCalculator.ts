export type RiskLevel = 'high' | 'moderate' | 'low';
import { isMonthInRanges } from './riskDateUtils';

export interface DiseaseDetectionData {
  fungi_affected_pixel_percentage: number;
}

export interface DiseaseWithStage {
  name: string;
  months: string[];
  stage?: { minDays: number; maxDays: number };
}

const FUNGAL_DISEASE_NAMES = [
  'Downy mildew',
  'Powdery mildew',
  'Anthracnose',
  'Fusarium wilt',
  'Rust',
  'Black rot',
  'Botrytis (Grey mold)',
  'Cercospora leaf spot',
];

/**
 * Assess disease risk level based on:
 * - High: stage match + legend circle (fungi % > 0) + month match
 * - Moderate: stage match + month match
 * - Low: month match only
 */
export function assessDiseaseRiskLevel(
  disease: DiseaseWithStage,
  daysSincePlantation: number,
  currentMonth: string,
  pestDetectionData?: DiseaseDetectionData
): 'High' | 'Moderate' | 'Low' | null {
  const monthMatch = isMonthInRanges(disease.months, currentMonth);

  if (!monthMatch) {
    return null;
  }

  const stageMatch = disease.stage
    ? daysSincePlantation >= disease.stage.minDays && daysSincePlantation <= disease.stage.maxDays
    : true;

  const isFungalDisease = FUNGAL_DISEASE_NAMES.includes(disease.name);
  const fungiPercentage = pestDetectionData?.fungi_affected_pixel_percentage ?? 0;

  if (stageMatch && fungiPercentage > 0 && isFungalDisease) {
    return 'High';
  }
  if (stageMatch) {
    return 'Moderate';
  }
  return 'Low';
}

export function calculateDiseaseRisk(disease: any, weather: any, month: string) {
  return {
    pest: disease,
    riskLevel: 'low' as RiskLevel
  };
}
