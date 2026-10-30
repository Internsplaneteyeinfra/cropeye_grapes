export interface FieldMap{
    id: number;
    name: string;
    acres: number;
  }

  export interface NutrientAnalysis {
    name: string;
    current: string;
    ideal: string;
    organic: string;
    chemical: string;
  }

  export interface FertilizerTable {
    nutrients:NutrientAnalysis[];
  }

  export interface IrrigationSchedule {
    date: string;
    time: string;
    quantity: number;
    evapotranspiration: string;
    rainfall: number;
    probability: number;
  }


  export interface WeatherForecast {
    date: string;
    temperature: number;
    humidity: number;
    rainfall: number;
    windSpeed: number;
  }

  export interface CropHealthAnalysis {
  irrigation: IrrigationSchedule[];
  fertilizer: FertilizerTable;
  weather:WeatherForecast[];
}

export interface WeatherData {
  temperature: number;
  humidity: number;
  location: string;
  lastUpdated: string;
}
