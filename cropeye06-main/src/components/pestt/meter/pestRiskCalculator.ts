import { Pest, WeatherData, PestRisk, RiskLevel } from '../meter/pest';
import { isMonthInRanges } from './riskDateUtils';

export interface PestDetectionData {
  chewing_affected_pixel_percentage: number;
  sucking_affected_pixel_percentage: number;
  SoilBorn_affected_pixel_percentage: number;
}

export interface PestWithStage {
  name: string;
  months: string[];
  stage?: { minDays: number; maxDays: number };
  category?: 'chewing' | 'sucking' | 'soil_borne';
}

/**
 * Assess pest risk level based on:
 * - High: stage match + legend circle (API % > 0) + month match
 * - Moderate: stage match + month match
 * - Low: month match only
 */
export function assessPestRiskLevel(
  pest: PestWithStage,
  daysSincePlantation: number,
  currentMonth: string,
  pestDetectionData?: PestDetectionData
): 'High' | 'Moderate' | 'Low' | null {
  const monthMatch = isMonthInRanges(pest.months, currentMonth);

  if (!monthMatch) {
    return null;
  }

  const stageMatch = pest.stage
    ? daysSincePlantation >= pest.stage.minDays && daysSincePlantation <= pest.stage.maxDays
    : true;

  let apiPercentage = 0;
  if (pestDetectionData && pest.category) {
    if (pest.category === 'chewing') {
      apiPercentage = pestDetectionData.chewing_affected_pixel_percentage || 0;
    } else if (pest.category === 'sucking') {
      apiPercentage = pestDetectionData.sucking_affected_pixel_percentage || 0;
    } else if (pest.category === 'soil_borne') {
      apiPercentage = pestDetectionData.SoilBorn_affected_pixel_percentage || 0;
    }
  }

  if (stageMatch && apiPercentage > 0) {
    return 'High';
  }
  if (stageMatch) {
    return 'Moderate';
  }
  return 'Low';
}

export const calculatePestRisk = (pest: Pest, weather: WeatherData, currentMonth: string): PestRisk => {
  let riskScore = 0;

  const isActiveMonth = pest.months.includes(currentMonth);
  if (!isActiveMonth) {
    return {
      pest,
      riskLevel: 'low',
      riskScore: 0
    };
  }

  const [minTemp, maxTemp] = pest.temperature.split('-').map(Number);
  const tempMatch = weather.temperature >= minTemp && weather.temperature <= maxTemp;

  const [minHumidity, maxHumidity] = pest.humidity.split('-').map(Number);
  const humidityMatch = weather.humidity >= minHumidity && weather.humidity <= maxHumidity;

  if (tempMatch && humidityMatch) {
    riskScore = 95;
  } else if (tempMatch || humidityMatch) {
    const tempDiff = Math.min(
      Math.abs(weather.temperature - minTemp),
      Math.abs(weather.temperature - maxTemp)
    );
    const humidityDiff = Math.min(
      Math.abs(weather.humidity - minHumidity),
      Math.abs(weather.humidity - maxHumidity)
    );
    const tempScore = Math.max(0, 50 - tempDiff * 2);
    const humidityScore = Math.max(0, 50 - humidityDiff);
    riskScore = Math.max(tempScore, humidityScore);
  } else {
    riskScore = Math.max(0, 30 - Math.abs(weather.temperature - (minTemp + maxTemp) / 2));
  }

  let riskLevel: RiskLevel;
  if (riskScore >= 95) {
    riskLevel = 'high';
  } else if (riskScore >= 80) {
    riskLevel = 'moderate';
  } else {
    riskLevel = 'low';
  }

  return {
    pest,
    riskLevel,
    riskScore
  };
};

export const getCurrentMonth = (): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[new Date().getMonth()];
};
