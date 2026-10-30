import { Pest, WeatherData, PestRisk, RiskLevel } from '../meter/pest';

export const calculatePestRisk = (pest: Pest, weather: WeatherData, currentMonth: string): PestRisk => {
  let riskScore = 0;

  // Check if current month is in pest active months
  const isActiveMonth = pest.months.includes(currentMonth);
  if (!isActiveMonth) {
    return {
      pest,
      riskLevel: 'low',
      riskScore: 0
    };
  }

  // Parse temperature range
  const [minTemp, maxTemp] = pest.temperature.split('-').map(Number);
  const tempMatch = weather.temperature >= minTemp && weather.temperature <= maxTemp;

  // Parse humidity range
  const [minHumidity, maxHumidity] = pest.humidity.split('-').map(Number);
  const humidityMatch = weather.humidity >= minHumidity && weather.humidity <= maxHumidity;

  // Calculate risk score based on conditions
  if (tempMatch && humidityMatch) {
    riskScore = 95; // Perfect conditions
  } else if (tempMatch || humidityMatch) {
    // Partial match - calculate based on how close the values are
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
    // No match - low risk
    riskScore = Math.max(0, 30 - Math.abs(weather.temperature - (minTemp + maxTemp) / 2));
  }

  // Determine risk level
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
