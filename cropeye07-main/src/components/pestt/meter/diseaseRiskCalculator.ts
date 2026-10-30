import { RiskLevel } from './pest';

export function calculateDiseaseRisk(disease: any, weather: any, month: string) {
  // Simple logic: always low for demo, or use your own logic
  return {
    pest: disease, // for compatibility with PestRisk type
    riskLevel: 'low' as RiskLevel
  };
}
