// Gemini API Configuration
// Get API key and model from environment variables
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || "";
// Model name - user can override in .env
// Valid models: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash-exp, gemini-2.5-flash-native-audio-preview-12-2025
// Use gemini-2.5-flash-native-audio-preview-12-2025 for Live API with native audio
export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || import.meta.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
export const GEMINI_LIVE_MODEL = import.meta.env.VITE_GEMINI_LIVE_MODEL || import.meta.env.GEMINI_LIVE_MODEL || "models/gemini-2.5-flash-native-audio-preview-12-2025";

// Gemini API endpoints
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_LIVE_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Language detection and TTS language codes
export const LANGUAGE_CODES = {
  marathi: "mr",
  hindi: "hi",
  english: "en",
} as const;

export type SupportedLanguage = keyof typeof LANGUAGE_CODES;

// Detect language from text
export const detectLanguage = (text: string): SupportedLanguage => {
  const devanagariPattern = /[\u0900-\u097F]/;

  if (devanagariPattern.test(text)) {
    // Check for Marathi-specific words/patterns
    const marathiIndicators = ["आहे", "ची", "ला", "मी", "तुम्ही", "शेत", "पीक"];
    const hasMarathiIndicators = marathiIndicators.some(indicator => text.includes(indicator));

    if (hasMarathiIndicators) {
      return "marathi";
    }
    // If Devanagari script but not clearly Marathi, default to Hindi
    return "hindi";
  }
  return "english";
};

// Get TTS language code
export const getTTSLanguageCode = (language: SupportedLanguage): string => {
  return LANGUAGE_CODES[language];
};
