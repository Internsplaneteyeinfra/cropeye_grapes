import { pestsData } from './pestsData';
import type { Pest } from './pestsData';
import { diseasesData } from './diseasesData';
import type { Disease } from './diseasesData';
import { weedsData } from './Weeds';
import type { Weed } from './Weeds';
import { assessPestRiskLevel } from './pestRiskCalculator';
import { assessDiseaseRiskLevel } from './diseaseRiskCalculator';
import { getFarmerMyProfile } from '../../../api';
import { getCache, setCache } from '../../utils/cache';
import { getAuthToken } from '../../../utils/auth';

export interface WeatherData {
  temperature: number;
  humidity: number;
  month: string;
}

export interface PestDetectionData {
  fungi_affected_pixel_percentage: number;
  chewing_affected_pixel_percentage: number;
  sucking_affected_pixel_percentage: number;
  SoilBorn_affected_pixel_percentage: number;
}

export interface RiskAssessmentResult {
  stage: string;
  current_conditions: {
    month: string;
    temperature: string;
    humidity: string;
  };
  pests: {
    High: string[];
    Moderate: string[];
    Low: string[];
  };
  diseases: {
    High: string[];
    Moderate: string[];
    Low: string[];
  };
  /** Present when data comes from the grapes-admin risk-assessment API */
  weeds?: {
    High: string[];
    Moderate: string[];
    Low: string[];
  };
}

const GRAPES_ADMIN_BASE = 'https://cropeye-grapes-admin-production.up.railway.app';

export interface RiskAssessmentApiResponse {
  plot_name: string;
  risk: {
    pests: { High: string[]; Moderate: string[]; Low: string[] };
    diseases: { High: string[]; Moderate: string[]; Low: string[] };
    weeds: { High: string[]; Moderate: string[]; Low: string[] };
  };
  pixel_data?: {
    fungi?: number;
    chewing?: number;
    sucking?: number;
    soilborne?: number;
  };
}

function mapPixelDataToPestDetection(pixel?: RiskAssessmentApiResponse['pixel_data']): PestDetectionData {
  if (!pixel) {
    return {
      fungi_affected_pixel_percentage: 0,
      chewing_affected_pixel_percentage: 0,
      sucking_affected_pixel_percentage: 0,
      SoilBorn_affected_pixel_percentage: 0,
    };
  }
  return {
    fungi_affected_pixel_percentage: Number(pixel.fungi) || 0,
    chewing_affected_pixel_percentage: Number(pixel.chewing) || 0,
    sucking_affected_pixel_percentage: Number(pixel.sucking) || 0,
    SoilBorn_affected_pixel_percentage: Number(pixel.soilborne) || 0,
  };
}

function assessmentFromApiPayload(body: RiskAssessmentApiResponse): RiskAssessmentResult {
  const r = body.risk;
  return {
    stage: 'API',
    current_conditions: {
      month: '—',
      temperature: '—',
      humidity: '—',
    },
    pests: {
      High: [...(r.pests?.High || [])],
      Moderate: [...(r.pests?.Moderate || [])],
      Low: [...(r.pests?.Low || [])],
    },
    diseases: {
      High: [...(r.diseases?.High || [])],
      Moderate: [...(r.diseases?.Moderate || [])],
      Low: [...(r.diseases?.Low || [])],
    },
    weeds: {
      High: [...(r.weeds?.High || [])],
      Moderate: [...(r.weeds?.Moderate || [])],
      Low: [...(r.weeds?.Low || [])],
    },
  };
}

/**
 * Fetch risk buckets from grapes-admin; maps names to local detail data via resolvePestRecord / resolveDiseaseRecord / resolveWeedRecord.
 */
export async function fetchRiskAssessmentFromApi(
  plotName: string
): Promise<{ assessment: RiskAssessmentResult; pestDetectionData: PestDetectionData } | null> {
  if (!plotName?.trim()) return null;

  const token = getAuthToken();
  const url = `${GRAPES_ADMIN_BASE}/risk-assessment?plot_name=${encodeURIComponent(plotName.trim())}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      console.warn('Risk assessment API:', response.status, response.statusText);
      return null;
    }

    const body = (await response.json()) as RiskAssessmentApiResponse;
    if (!body?.risk) {
      return null;
    }

    const assessment = assessmentFromApiPayload(body);
    const pestDetectionData = mapPixelDataToPestDetection(body.pixel_data);

    console.log('✅ Risk assessment from API:', { plot: body.plot_name, assessment });

    return { assessment, pestDetectionData };
  } catch (e) {
    console.warn('Risk assessment API request failed:', e);
    return null;
  }
}

function createStubPest(name: string): Pest {
  return {
    name,
    months: [],
    temperature: '',
    humidity: '',
    image: '/Image/wilt.png',
    symptoms: ['No detailed profile found in the local catalog for this pest.'],
    identification: [],
    where: '—',
    why: '—',
    when: { high: '—', moderate: '—', low: '—' },
    organic: [],
    chemical: [],
  };
}

function createStubDisease(name: string): Disease {
  return {
    name,
    months: [],
    symptoms: ['No detailed profile found in the local catalog for this disease.'],
    where: '—',
    why: '—',
    when: { high: '—', moderate: '—', low: '—' },
    organic: [],
    chemical: [],
    image: '/Image/wilt.png',
  };
}

function createStubWeed(name: string): Weed {
  return {
    name,
    months: [],
    when: '—',
    where: '—',
    why: '—',
    image: '/Image/wilt.png',
    chemical: [],
  };
}

/** Resolve API pest name to full Pest row from pestsData (fuzzy match) or a readable stub. */
export function resolvePestRecord(name: string): Pest {
  const t = name.trim();
  const exact = pestsData.find((p) => p.name === t);
  if (exact) return exact;
  const ci = pestsData.find((p) => p.name.toLowerCase() === t.toLowerCase());
  if (ci) return ci;
  const partial = pestsData.find(
    (p) =>
      t.toLowerCase().includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(t.toLowerCase())
  );
  if (partial) return partial;
  return createStubPest(t);
}

/** Resolve API disease name to diseasesData row or stub. */
export function resolveDiseaseRecord(name: string): Disease {
  const t = name.trim();
  const exact = diseasesData.find((d) => d.name === t);
  if (exact) return exact;
  const ci = diseasesData.find((d) => d.name.toLowerCase() === t.toLowerCase());
  if (ci) return ci;
  const partial = diseasesData.find(
    (d) =>
      t.toLowerCase().includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(t.toLowerCase())
  );
  if (partial) return partial;
  return createStubDisease(t);
}

/** Resolve API weed name to weedsData row or stub. */
export function resolveWeedRecord(name: string): Weed {
  const t = name.trim();
  const normalize = (v: string) =>
    v
      .toLowerCase()
      .replace(/[–—-]/g, ' ')
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const aliases: Record<string, string> = {
    'congress grass': 'congress grass',
    'gajar gavat': 'congress grass',
    'pigweed': 'math',
    'math': 'math',
    'doob grass': 'hararali',
    'harali': 'hararali',
    'hararali': 'hararali',
    'dudhi': 'dudhi',
    'chiktya': 'chiktya',
  };

  const exact = weedsData.find((w) => w.name === t);
  if (exact) return exact;
  const ci = weedsData.find((w) => w.name.toLowerCase() === t.toLowerCase());
  if (ci) return ci;
  const normalizedInput = normalize(t);
  if (normalizedInput) {
    const normalizedExact = weedsData.find((w) => normalize(w.name) === normalizedInput);
    if (normalizedExact) return normalizedExact;

    const aliasHit = Object.entries(aliases).find(([k]) => normalizedInput.includes(k))?.[1];
    if (aliasHit) {
      const aliasMatch = weedsData.find((w) => normalize(w.name).includes(aliasHit));
      if (aliasMatch) return aliasMatch;
    }
  }
  const partial = weedsData.find(
    (w) =>
      t.toLowerCase().includes(w.name.toLowerCase()) ||
      w.name.toLowerCase().includes(t.toLowerCase()) ||
      t.split(/[(),]/).some((part) => {
        const p = part.trim().toLowerCase();
        return p && w.name.toLowerCase().includes(p);
      })
  );
  if (partial) return partial;
  if (normalizedInput) {
    const inputTokens = normalizedInput.split(' ').filter((x) => x.length >= 4);
    const tokenMatch = weedsData.find((w) => {
      const wn = normalize(w.name);
      return inputTokens.some((tok) => wn.includes(tok));
    });
    if (tokenMatch) return tokenMatch;
  }
  return createStubWeed(t);
}

export interface SugarcaneStage {
  name: string;
  minDays: number;
  maxDays: number;
}

export const SUGARCANE_STAGES: SugarcaneStage[] = [
  {
    name: "Germination & Early Growth",
    minDays: 0,
    maxDays: 45
  },
  {
    name: "Tillering & Early Stem Elongation",
    minDays: 46,
    maxDays: 120
  },
  {
    name: "Grand Growth Phase",
    minDays: 121,
    maxDays: 210
  },
  {
    name: "Ripening & Maturity",
    minDays: 211,
    maxDays: 365
  }
];

/**
 * Calculate grapes stage based on plantation date
 */
export function calculateSugarcaneStage(plantationDate: string): string {
  const today = new Date();
  const plantation = new Date(plantationDate);
  
  const daysSincePlantation = Math.floor((today.getTime() - plantation.getTime()) / (1000 * 60 * 60 * 24));
  
  for (const stage of SUGARCANE_STAGES) {
    if (daysSincePlantation >= stage.minDays && daysSincePlantation <= stage.maxDays) {
      return stage.name;
    }
  }
  
  // If beyond 365 days, return the last stage
  return "Ripening & Maturity";
}

/**
 * Check if temperature and humidity fall within pest/disease ranges
 */
export function checkTemperatureHumidityMatch(
  pestTemp: string,
  pestHumidity: string,
  currentTemp: number,
  currentHumidity: number
): { tempMatch: boolean; humidityMatch: boolean } {
  // Parse temperature range (e.g., "28-32" -> min: 28, max: 32)
  const tempRange = pestTemp.split('-').map(t => parseFloat(t.trim()));
  const tempMin = tempRange[0];
  const tempMax = tempRange[1];
  
  // Parse humidity range (e.g., "70-80" -> min: 70, max: 80)
  const humidityRange = pestHumidity.split('-').map(h => parseFloat(h.trim()));
  const humidityMin = humidityRange[0];
  const humidityMax = humidityRange[1];
  
  const tempMatch = currentTemp >= tempMin && currentTemp <= tempMax;
  const humidityMatch = currentHumidity >= humidityMin && currentHumidity <= humidityMax;
  
  return { tempMatch, humidityMatch };
}

/**
 * Calculate days since plantation
 */
export function calculateDaysSincePlantation(plantationDate: string): number {
  const today = new Date();
  const plantation = new Date(plantationDate);
  
  if (isNaN(plantation.getTime())) {
    // Try parsing different date formats
    const parts = plantationDate.split("-");
    if (parts.length === 3) {
      plantation.setFullYear(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  
  const daysSincePlantation = Math.floor((today.getTime() - plantation.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysSincePlantation);
}

/**
 * Fetch pest detection data from API
 */
export async function fetchPestDetectionData(plotId?: string): Promise<PestDetectionData> {
  // Check cache first
  if (plotId) {
    const cacheKey = `pestDetectionData_${plotId}`;
    const cached = getCache(cacheKey, 30 * 60 * 1000); // 30 min cache
    if (cached) {
      console.log('✅ RiskAssessment: Using cached pest detection data for plot:', plotId);
      return cached;
    }
  }

  try {
    // Check if token exists before making API call
    const token = getAuthToken();
    if (!token) {
      console.warn('No authentication token found for pest detection');
      return {
        fungi_affected_pixel_percentage: 0,
        chewing_affected_pixel_percentage: 0,
        sucking_affected_pixel_percentage: 0,
        SoilBorn_affected_pixel_percentage: 0,
      };
    }

    const response = await getFarmerMyProfile();
    const profileData = response.data;
    
    if (!profileData.plots || profileData.plots.length === 0) {
      console.warn('No plots found in user profile for pest detection');
      return {
        fungi_affected_pixel_percentage: 0,
        chewing_affected_pixel_percentage: 0,
        sucking_affected_pixel_percentage: 0,
        SoilBorn_affected_pixel_percentage: 0,
      };
    }

    // Find selected plot or use first plot
    let selectedPlot = null;
    if (plotId) {
      selectedPlot = profileData.plots.find((p: any) => 
        p.fastapi_plot_id === plotId ||
        `${p.gat_number}_${p.plot_number}` === plotId ||
        p.plot_name === plotId
      );
    }
    
    if (!selectedPlot) {
      selectedPlot = profileData.plots[0];
    }

    const plotName = selectedPlot.plot_name || selectedPlot.fastapi_plot_id || `${selectedPlot.gat_number}_${selectedPlot.plot_number}`;
    
    // Use direct API URL - CORS is handled on the backend
    // API: https://cropeye-grapes-admin-production.up.railway.app/docs#/default/pest_detection_by_crop_pest_detection_post
    const baseUrl = 'https://cropeye-grapes-admin-production.up.railway.app';
    const url = `${baseUrl}/pest-detection?plot_name=${plotName}`;
    
    console.log(`🐛 Fetching Pest Detection data from: ${url}`);
    
    // Create AbortController with 5 minute timeout to prevent session timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    try {
      // Try fetch with explicit CORS mode and proper headers matching curl command
      const postResponse = await fetch(url, {
        method: "POST",
        mode: "cors",
        cache: "default",
        credentials: "omit",
        headers: { 
          "Accept": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (postResponse.ok) {
        const pestData = await postResponse.json();
        const pixelSummary = pestData.pixel_summary || {};
        const result = {
          fungi_affected_pixel_percentage: pixelSummary.fungi_affected_pixel_percentage || 0,
          chewing_affected_pixel_percentage: pixelSummary.chewing_affected_pixel_percentage || 0,
          sucking_affected_pixel_percentage: pixelSummary.sucking_affected_pixel_percentage || 0,
          SoilBorn_affected_pixel_percentage: pixelSummary.SoilBorn_affected_pixel_percentage || 0,
        };
        
        // Cache the result
        if (plotId) {
          const cacheKey = `pestDetectionData_${plotId}`;
          setCache(cacheKey, result);
        }
        
        return result;
      }
      
      // If request fails, return default
      console.warn(`Pest detection API error: ${postResponse.status}`);
      return {
        fungi_affected_pixel_percentage: 0,
        chewing_affected_pixel_percentage: 0,
        sucking_affected_pixel_percentage: 0,
        SoilBorn_affected_pixel_percentage: 0,
      };
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors gracefully
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.warn('⚠️ Pest detection request timed out after 5 minutes');
      } else {
        console.warn('Error fetching pest detection data:', error?.message || error);
      }
      
      return {
        fungi_affected_pixel_percentage: 0,
        chewing_affected_pixel_percentage: 0,
        sucking_affected_pixel_percentage: 0,
        SoilBorn_affected_pixel_percentage: 0,
      };
    }
  } catch (error: any) {
    // Handle errors from getFarmerMyProfile or other outer try block errors
    console.error('Error in fetchPestDetectionData:', error);
    return {
      fungi_affected_pixel_percentage: 0,
      chewing_affected_pixel_percentage: 0,
      sucking_affected_pixel_percentage: 0,
      SoilBorn_affected_pixel_percentage: 0,
    };
  }
}

/**
 * Main function to generate pest and disease risk assessment
 */
export async function generateRiskAssessment(
  plantationDate: string,
  weatherData: WeatherData,
  plotId?: string
): Promise<RiskAssessmentResult> {
  try {
    // Calculate days since plantation
    const daysSincePlantation = calculateDaysSincePlantation(plantationDate);
    
    // Calculate current grapes stage
    const currentStage = calculateSugarcaneStage(plantationDate);
    
    // Extract current conditions
    const currentMonth = weatherData.month;
    const currentTemp = weatherData.temperature;
    const currentHumidity = weatherData.humidity;
    
    console.log('🌱 Risk Assessment Input Data:', {
      'Plantation Date': plantationDate,
      'Days Since Plantation': daysSincePlantation,
      'Current Stage': currentStage,
      'Current Month': currentMonth,
      'Temperature': currentTemp,
      'Humidity': currentHumidity,
      'Plot ID': plotId
    });
    
    // Fetch API pest detection data
    let pestDetectionData: PestDetectionData | undefined;
    try {
      pestDetectionData = await fetchPestDetectionData(plotId);
      console.log('📊 Pest detection API data:', pestDetectionData);
    } catch (error) {
      console.warn('⚠️ Error fetching pest detection data:', error);
      pestDetectionData = {
        fungi_affected_pixel_percentage: 0,
        chewing_affected_pixel_percentage: 0,
        sucking_affected_pixel_percentage: 0,
        SoilBorn_affected_pixel_percentage: 0,
      };
    }
    
    // Initialize result
    const result: RiskAssessmentResult = {
      stage: currentStage,
      current_conditions: {
        month: currentMonth,
        temperature: `${currentTemp}°C`,
        humidity: `${currentHumidity}%`
      },
      pests: {
        High: [],
        Moderate: [],
        Low: []
      },
      diseases: {
        High: [],
        Moderate: [],
        Low: []
      }
    };
    
    // Assess pest risks using pestRiskCalculator:
    // High: stage + legend (API %) + month | Moderate: stage + month | Low: month only
    for (const pest of pestsData) {
      const riskLevel = assessPestRiskLevel(
        pest,
        daysSincePlantation,
        currentMonth,
        pestDetectionData
      );
      if (riskLevel === 'High') {
        result.pests.High.push(pest.name);
      } else if (riskLevel === 'Moderate') {
        result.pests.Moderate.push(pest.name);
      } else if (riskLevel === 'Low') {
        result.pests.Low.push(pest.name);
      }
    }
    
    // Assess disease risks using diseaseRiskCalculator:
    // High: stage + legend (fungi %) + month | Moderate: stage + month | Low: month only
    for (const disease of diseasesData) {
      const riskLevel = assessDiseaseRiskLevel(
        disease,
        daysSincePlantation,
        currentMonth,
        pestDetectionData
      );
      if (riskLevel === 'High') {
        result.diseases.High.push(disease.name);
      } else if (riskLevel === 'Moderate') {
        result.diseases.Moderate.push(disease.name);
      } else if (riskLevel === 'Low') {
        result.diseases.Low.push(disease.name);
      }
    }
    
    console.log('📊 Risk assessment result:', {
      daysSincePlantation,
      currentStage,
      currentMonth,
      pestDetectionData,
      pestsCount: {
        high: result.pests.High.length,
        moderate: result.pests.Moderate.length,
        low: result.pests.Low.length
      },
      pestsHigh: result.pests.High, // Show which pests are in High
      diseasesCount: {
        high: result.diseases.High.length,
        moderate: result.diseases.Moderate.length,
        low: result.diseases.Low.length
      },
      diseasesHigh: result.diseases.High // Show which diseases are in High
    });
    
    // Log summary of API detection and results
    if (pestDetectionData) {
      const hasChewing = pestDetectionData.chewing_affected_pixel_percentage > 0;
      const hasSucking = pestDetectionData.sucking_affected_pixel_percentage > 0;
      const hasSoilBorn = pestDetectionData.SoilBorn_affected_pixel_percentage > 0;
      const hasFungi = pestDetectionData.fungi_affected_pixel_percentage > 0;
      
      console.log('📊 Final API Detection Summary:', {
        hasChewing,
        hasSucking,
        hasSoilBorn,
        hasFungi,
        'Chewing percentage': pestDetectionData.chewing_affected_pixel_percentage,
        'Sucking percentage': pestDetectionData.sucking_affected_pixel_percentage,
        'Soil Born percentage': pestDetectionData.SoilBorn_affected_pixel_percentage,
        'Fungi percentage': pestDetectionData.fungi_affected_pixel_percentage,
        'Pests High/Moderate/Low': `${result.pests.High.length}/${result.pests.Moderate.length}/${result.pests.Low.length}`,
        'Diseases High/Moderate/Low': `${result.diseases.High.length}/${result.diseases.Moderate.length}/${result.diseases.Low.length}`,
        'Pests Displayed': { High: result.pests.High, Moderate: result.pests.Moderate, Low: result.pests.Low },
        'Diseases Displayed': { High: result.diseases.High, Moderate: result.diseases.Moderate, Low: result.diseases.Low }
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('Error generating risk assessment:', error);
    throw new Error('Failed to generate risk assessment');
  }
}

/**
 * Fetch plantation date from farmer profile API
 */
export async function fetchPlantationDate(plotId?: string): Promise<string> {
  try {
    // Check if token exists before making API call
    const token = getAuthToken();
    if (!token) {
      console.warn('⚠️ No authentication token found, using fallback date');
      return new Date().toISOString().split('T')[0];
    }

    console.log('📅 Fetching plantation date for plot:', plotId);
    const response = await getFarmerMyProfile();
    const profileData = response.data;
    
    if (!profileData.plots || profileData.plots.length === 0) {
      console.warn('⚠️ No plots found in profile, using fallback date');
      return new Date().toISOString().split('T')[0];
    }

    // Find selected plot or use first plot
    let selectedPlot = null;
    if (plotId) {
      selectedPlot = profileData.plots.find((p: any) => 
        p.fastapi_plot_id === plotId ||
        `${p.gat_number}_${p.plot_number}` === plotId
      );
      console.log('🔍 Looking for plot:', plotId, 'Found:', selectedPlot ? 'Yes' : 'No');
    }
    
    if (!selectedPlot) {
      selectedPlot = profileData.plots[0];
      console.log('📋 Using first plot from profile:', selectedPlot.fastapi_plot_id || `${selectedPlot.gat_number}_${selectedPlot.plot_number}`);
    }

    // Get plantation date from plot's farms
    if (selectedPlot.farms && selectedPlot.farms.length > 0) {
      const firstFarm = selectedPlot.farms[0];
      if (firstFarm.plantation_date) {
        console.log('✅ Plantation date found:', firstFarm.plantation_date);
        return firstFarm.plantation_date;
      } else {
        console.warn('⚠️ No plantation_date in farm data, using fallback');
      }
    } else {
      console.warn('⚠️ No farms found in selected plot, using fallback date');
    }
    
    // Fallback to current date if no plantation date found
    const fallbackDate = new Date().toISOString().split('T')[0];
    console.warn('⚠️ Using fallback plantation date:', fallbackDate);
    return fallbackDate;
    
  } catch (error: any) {
    console.warn('⚠️ Error fetching plantation date, using fallback:', error?.message || error);
    // Return today's date as fallback - don't throw error, just use fallback
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Fetch current weather data using user's location from farmer profile
 * Uses centralized weather service with proper error handling
 */
export async function fetchCurrentWeather(plotId?: string): Promise<WeatherData> {
  try {
    // Check if token exists before making API call
    const token = getAuthToken();
    if (!token) {
      console.warn('🌤️ RiskAssessment: No authentication token found, using default weather data');
      // Return default weather data instead of throwing error
      const currentDate = new Date();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const currentMonth = monthNames[currentDate.getMonth()];
      
      return {
        temperature: 25, // Default temperature
        humidity: 60, // Default humidity
        month: currentMonth
      };
    }

    const response = await getFarmerMyProfile();
    const profileData = response.data;
    
    if (!profileData.plots || profileData.plots.length === 0) {
      console.warn('🌤️ RiskAssessment: No plots found in user profile, using default weather data');
      const currentDate = new Date();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const currentMonth = monthNames[currentDate.getMonth()];
      return {
        temperature: 25,
        humidity: 60,
        month: currentMonth
      };
    }

    // Find selected plot or use first plot
    let selectedPlot = null;
    if (plotId) {
      selectedPlot = profileData.plots.find((p: any) => 
        p.fastapi_plot_id === plotId ||
        `${p.gat_number}_${p.plot_number}` === plotId
      );
    }
    
    if (!selectedPlot) {
      selectedPlot = profileData.plots[0];
    }

    if (!selectedPlot.coordinates?.location?.latitude || !selectedPlot.coordinates?.location?.longitude) {
      console.warn('🌤️ RiskAssessment: No coordinates found in plot data, using default weather data');
      const currentDate = new Date();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const currentMonth = monthNames[currentDate.getMonth()];
      return {
        temperature: 25,
        humidity: 60,
        month: currentMonth
      };
    }

    const lat = selectedPlot.coordinates.location.latitude;
    const lon = selectedPlot.coordinates.location.longitude;

    console.log('🌤️ RiskAssessment: Fetching weather data', { lat, lon, plotId });

    // Use centralized weather service with fallback enabled
    const { fetchCurrentWeather: fetchWeather } = await import("../../../services/weatherService");
    const weatherData = await fetchWeather(lat, lon, true); // Use fallback to prevent crashes
    
    const currentDate = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonth = monthNames[currentDate.getMonth()];
    
    return {
      temperature: weatherData.temperature_c || 25,
      humidity: weatherData.humidity || 60,
      month: currentMonth
    };
  } catch (error: any) {
    console.warn('🌤️ RiskAssessment: Error fetching weather data, using defaults', {
      error: error?.message || error,
      plotId,
    });
    // Return default weather data instead of throwing error to prevent crashes
    const currentDate = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonth = monthNames[currentDate.getMonth()];
    
    return {
      temperature: 25, // Default temperature
      humidity: 60, // Default humidity
      month: currentMonth
    };
  }
}
