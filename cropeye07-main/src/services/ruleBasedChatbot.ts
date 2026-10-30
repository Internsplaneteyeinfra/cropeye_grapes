/**
 * Rule-Based Chatbot Knowledge Base
 * Farm and Agriculture Q&A in Marathi, Hindi, and English
 * No specific values/indices revealed - generic responses only
 */

export type Language = 'marathi' | 'hindi' | 'english' | 'kannada';

/** Chat header `language` values sent to the API: mr | hi | en | kn */
export type ChatLocaleCode = 'mr' | 'hi' | 'en' | 'kn';

/**
 * Static greeting after language selection — text only (no TTS in the chatbot).
 */
export const getWelcomeMessageByChatLocale = (
  locale: ChatLocaleCode,
): { text: string; language: Language } => {
  switch (locale) {
    case 'mr':
      return {
        text: 'तुमच्या स्मार्ट शेती सहाय्यकामध्ये तुमचं स्वागत आहे.\nमी तुम्हाला पिकांचे दर, हवामान माहिती आणि शेतीसंबंधित सल्ला देण्यासाठी येथे आहे. 🌱\nआज मी तुमची कशी मदत करू शकतो?',
        language: 'marathi',
      };
    case 'hi':
      return {
        text: 'आपके स्मार्ट खेती सहायक में आपका स्वागत है।\nमैं आपको फसल के दाम, मौसम की जानकारी और खेती से जुड़ी सलाह देने के लिए यहाँ हूँ। 🌱\nआज मैं आपकी कैसे मदद कर सकता हूँ?',
        language: 'hindi',
      };
    case 'kn':
      return {
        text: 'ನಿಮ್ಮ ಸ್ಮಾರ್ಟ್ ಕೃಷಿ ಸಹಾಯಕಕ್ಕೆ ಸ್ವಾಗತ.\nನಾನು ಬೆಳೆ ಬೆಲೆ, ಹವಾಮಾನ ಮಾಹಿತಿ ಮತ್ತು ಕೃಷಿ ಸಲಹೆ ನೀಡಲು ಇಲ್ಲಿ ಇದ್ದೇನೆ. 🌱\nಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
        language: 'kannada',
      };
    case 'en':
    default:
      return {
        text: "Welcome to your smart farming assistant.\nI'm here to help you with crop prices, weather updates, and farming advice. 🌱\nHow can I assist you today?",
        language: 'english',
      };
  }
};
export type UserRole = 'farmer' | 'manager' | 'fieldofficer' | 'owner' | 'admin';

export interface ChatRule {
  patterns: string[]; // Keywords/patterns to match
  responses: {
    marathi: string;
    hindi: string;
    english: string;
  };
  category: string;
  roles?: UserRole[]; // Optional: specific roles this applies to
}

// Expanded Knowledge Base - 50+ Rules
export const CHATBOT_RULES: ChatRule[] = [
  // Greetings
  {
    patterns: ['नमस्कार', 'hello', 'hi', 'hey', 'namaskar', 'namaste', 'नमस्ते', 'good morning', 'good afternoon', 'good evening'],
    responses: {
      marathi: 'नमस्कार! मी CropEye Assistant आहे. तुमचा प्रश्न विचारा! 🌱',
      hindi: 'नमस्ते! मैं CropEye Assistant हूं। अपना सवाल पूछें! 🌱',
      english: 'Hello! I am CropEye Assistant. How can I help you today? 🌱'
    },
    category: 'greeting'
  },

  // Crop Health - Generic (no specific values)
  {
    patterns: ['crop health', 'पीक आरोग्य', 'फसल स्वास्थ्य', 'ndvi', 'growth', 'वाढ', 'वृद्धि', 'crop condition', 'पीक स्थिती'],
    responses: {
      marathi: '📊 **पीक आरोग्य विश्लेषण:**\n\n✅ **NDVI मूल्ये:**\n• उच्च मूल्य = निरोगी पीक\n• मध्यम मूल्य = सामान्य स्थिती\n• कमी मूल्य = कमकुवत पीक\n\n🔍 **तपासणी करा:**\n• Dashboard → Crop Health Analysis\n• नियमितपणे पीक स्थिती तपासा\n• समस्या दिसल्यास लगेच कृती करा\n\n💡 **शिफारस:** नियमितपणे पीक आरोग्य तपासणी करा आणि समस्यांवर लगेच उपाय करा.',
      hindi: '📊 **फसल स्वास्थ्य विश्लेषण:**\n\n✅ **NDVI मान:**\n• उच्च मान = स्वस्थ फसल\n• मध्यम मान = सामान्य स्थिति\n• कम मान = कमजोर फसल\n\n🔍 **जांच करें:**\n• Dashboard → Crop Health Analysis\n• नियमित रूप से फसल स्थिति जांचें\n• समस्या दिखने पर तुरंत कार्रवाई करें\n\n💡 **सुझाव:** नियमित रूप से फसल स्वास्थ्य जांच करें और समस्याओं पर तुरंत उपाय करें।',
      english: '📊 **Crop Health Analysis:**\n\n✅ **NDVI Values:**\n• High value = Healthy crop\n• Medium value = Normal condition\n• Low value = Weak crop\n\n🔍 **Check:**\n• Dashboard → Crop Health Analysis\n• Regularly monitor crop status\n• Take immediate action if issues found\n\n💡 **Recommendation:** Regularly check crop health and address issues immediately.'
    },
    category: 'crop_health'
  },

  // Harvest - Generic
  {
    patterns: ['harvest', 'कापणी', 'कटाई', 'brix', 'sugar', 'साखर', 'readiness', 'maturity', 'परिपक्वता'],
    responses: {
      marathi: '🌾 **कापणी तयारी:**\n\n✅ **मुख्य मुद्दे:**\n• Brix साखर टक्केवारी योग्य पातळीवर असावी\n• पीक पूर्णपणे परिपक्व असावे\n• हवामान योग्य असावे\n\n📅 **तपासणी:**\n• Dashboard → Days to Harvest कार्ड\n• कापणी तयारी स्थिती पहा\n• शिफारसी आणि सल्ले वाचा\n\n⏰ **वेळ:** योग्य वेळी कापणी करणे महत्त्वाचे आहे. उशीरा किंवा लवकर कापणी उत्पादनावर परिणाम करू शकते.',
      hindi: '🌾 **कटाई तैयारी:**\n\n✅ **मुख्य बिंदु:**\n• Brix चीनी प्रतिशत उचित स्तर पर होना चाहिए\n• फसल पूरी तरह से परिपक्व होनी चाहिए\n• मौसम उचित होना चाहिए\n\n📅 **जांच:**\n• Dashboard → Days to Harvest कार्ड\n• कटाई तैयारी स्थिति देखें\n• सुझाव और सलाह पढ़ें\n\n⏰ **समय:** सही समय पर कटाई करना महत्वपूर्ण है। देर से या जल्दी कटाई उत्पादन को प्रभावित कर सकती है।',
      english: '🌾 **Harvest Readiness:**\n\n✅ **Key Points:**\n• Brix sugar percentage should be at proper level\n• Crop should be fully mature\n• Weather should be favorable\n\n📅 **Check:**\n• Dashboard → Days to Harvest card\n• View harvest readiness status\n• Read recommendations and advice\n\n⏰ **Timing:** Harvesting at the right time is crucial. Late or early harvest can affect production.'
    },
    category: 'harvest'
  },

  // Fertilizer - Generic
  {
    patterns: ['fertilizer', 'खत', 'उर्वरक', 'npk', 'nitrogen', 'phosphorus', 'potassium', 'नत्र', 'फॉस्फरस', 'पोटॅशियम', 'manure', 'खत'],
    responses: {
      marathi: '🌱 **NPK खत मार्गदर्शन:**\n\n📊 **NPK म्हणजे:**\n• **N (नत्र):** पिकाच्या वाढीसाठी\n• **P (फॉस्फरस):** मुळे आणि फुलांसाठी\n• **K (पोटॅशियम):** पिकाच्या आरोग्यासाठी\n\n🔍 **तपासणी:**\n• Fertilizer पृष्ठ → NPK विश्लेषण\n• आवश्यकता आणि शिफारसी पहा\n• मातीच्या परिस्थितीनुसार मात्रा बदलते\n\n💡 **महत्त्व:** योग्य खताची मात्रा पिकाच्या वाढीसाठी आवश्यक आहे. जास्त किंवा कमी खत हानिकारक असू शकते.',
      hindi: '🌱 **NPK उर्वरक मार्गदर्शन:**\n\n📊 **NPK का मतलब:**\n• **N (नाइट्रोजन):** फसल की वृद्धि के लिए\n• **P (फॉस्फोरस):** जड़ें और फूलों के लिए\n• **K (पोटैशियम):** फसल के स्वास्थ्य के लिए\n\n🔍 **जांच:**\n• Fertilizer पेज → NPK विश्लेषण\n• आवश्यकताएं और सुझाव देखें\n• मिट्टी की स्थिति के अनुसार मात्रा बदलती है\n\n💡 **महत्व:** सही उर्वरक मात्रा फसल की वृद्धि के लिए आवश्यक है। अधिक या कम उर्वरक हानिकारक हो सकता है।',
      english: '🌱 **NPK Fertilizer Guide:**\n\n📊 **NPK Means:**\n• **N (Nitrogen):** For crop growth\n• **P (Phosphorus):** For roots and flowers\n• **K (Potassium):** For crop health\n\n🔍 **Check:**\n• Fertilizer page → NPK Analysis\n• View requirements and recommendations\n• Amount varies based on soil conditions\n\n💡 **Important:** Right fertilizer amount is essential for crop growth. Too much or too little can be harmful.'
    },
    category: 'fertilizer'
  },

  // Soil - Generic
  {
    patterns: ['soil', 'माती', 'मिट्टी', 'ph', 'moisture', 'आर्द्रता', 'organic carbon', 'nutrients', 'पोषक'],
    responses: {
      marathi: '🌍 **माती विश्लेषण:**\n\n📊 **मुख्य मापदंड:**\n• **pH:** योग्य पातळीवर असावे\n• **आर्द्रता:** पिकासाठी योग्य\n• **नत्र (N):** पिकाच्या वाढीसाठी\n• **सेंद्रिय कार्बन:** मातीच्या आरोग्यासाठी\n• **इतर पोषक:** संतुलित असावे\n\n🔍 **तपासणी:**\n• Soil Analysis पृष्ठ → संपूर्ण विश्लेषण\n• मातीची स्थिती नियमितपणे तपासा\n• समस्या दिसल्यास सुधारणा करा\n\n💡 **शिफारस:** नियमित माती तपासणी पिकाच्या वाढीसाठी महत्त्वाची आहे.',
      hindi: '🌍 **मिट्टी विश्लेषण:**\n\n📊 **मुख्य मापदंड:**\n• **pH:** उचित स्तर पर होना चाहिए\n• **नमी:** फसल के लिए उचित\n• **नाइट्रोजन (N):** फसल की वृद्धि के लिए\n• **कार्बनिक कार्बन:** मिट्टी के स्वास्थ्य के लिए\n• **अन्य पोषक:** संतुलित होने चाहिए\n\n🔍 **जांच:**\n• Soil Analysis पेज → संपूर्ण विश्लेषण\n• मिट्टी की स्थिति नियमित रूप से जांचें\n• समस्या दिखने पर सुधार करें\n\n💡 **सुझाव:** नियमित मिट्टी जांच फसल की वृद्धि के लिए महत्वपूर्ण है।',
      english: '🌍 **Soil Analysis:**\n\n📊 **Key Parameters:**\n• **pH:** Should be at proper level\n• **Moisture:** Appropriate for crop\n• **Nitrogen (N):** For crop growth\n• **Organic Carbon:** For soil health\n• **Other Nutrients:** Should be balanced\n\n🔍 **Check:**\n• Soil Analysis page → Complete analysis\n• Regularly monitor soil condition\n• Improve if issues found\n\n💡 **Recommendation:** Regular soil testing is important for crop growth.'
    },
    category: 'soil'
  },

  // Irrigation - Generic
  {
    patterns: ['irrigation', 'पाणी', 'पानी', 'water', 'moisture', 'आर्द्रता', 'नमी', 'watering', 'सिंचन'],
    responses: {
      marathi: 'पीकासाठी योग्य पाणीपुरवठा महत्त्वाचा आहे. Irrigation पृष्ठावर मातीची आर्द्रता, पाण्याचा वापर, सिंचन शिफारसी, आणि पाणी उपलब्धता पहा. नियमित सिंचन पिकाच्या वाढीसाठी आवश्यक आहे.',
      hindi: 'फसल के लिए उचित पानी की आपूर्ति महत्वपूर्ण है। Irrigation पेज पर मिट्टी की नमी, पानी का उपयोग, सिंचाई सुझाव, और पानी की उपलब्धता देखें। नियमित सिंचाई फसल की वृद्धि के लिए आवश्यक है।',
      english: 'Proper water supply is important for crops. Visit Irrigation page to see soil moisture, water usage, irrigation recommendations, and water availability. Regular irrigation is essential for crop growth.'
    },
    category: 'irrigation'
  },

  // Pests and Diseases
  {
    patterns: ['pest', 'disease', 'कीटक', 'रोग', 'कीड़े', 'treatment', 'उपचार', 'infection', 'संसर्ग'],
    responses: {
      marathi: 'कीटक आणि रोगांचा शोध लावण्यासाठी Pest & Disease पृष्ठावर जा. तेथे प्रभावित क्षेत्र, रोग प्रकार, संक्रमण स्तर, आणि उपचार शिफारसी दिसतील. लवकर शोध आणि उपचार पिकाचे नुकसान टाळू शकते.',
      hindi: 'कीट और रोगों का पता लगाने के लिए Pest & Disease पेज पर जाएं। वहां प्रभावित क्षेत्र, रोग प्रकार, संक्रमण स्तर, और उपचार सुझाव दिखेंगे। जल्दी पता लगाना और उपचार फसल के नुकसान को रोक सकता है।',
      english: 'Visit Pest & Disease page to detect pests and diseases. You will see affected area, disease type, infection level, and treatment recommendations there. Early detection and treatment can prevent crop damage.'
    },
    category: 'pests'
  },

  // Weather
  {
    patterns: ['weather', 'हवामान', 'मौसम', 'rain', 'पाऊस', 'temperature', 'तापमान', 'forecast', 'पूर्वानुमान'],
    responses: {
      marathi: 'हवामान माहितीसाठी Weather Widget किंवा Weather Forecast पृष्ठावर जा. तेथे वर्तमान हवामान, तापमान, आर्द्रता, पाऊस, वारा, आणि भविष्यातील अंदाज दिसेल. हवामान माहिती शेती नियोजनासाठी महत्त्वाची आहे.',
      hindi: 'मौसम की जानकारी के लिए Weather Widget या Weather Forecast पेज पर जाएं। वहां वर्तमान मौसम, तापमान, नमी, बारिश, हवा, और भविष्य का पूर्वानुमान दिखेगा। मौसम की जानकारी खेती की योजना के लिए महत्वपूर्ण है।',
      english: 'Visit Weather Widget or Weather Forecast page for weather information. You will see current weather, temperature, humidity, rainfall, wind, and future forecast there. Weather information is important for farming planning.'
    },
    category: 'weather'
  },

  // Biomass
  {
    patterns: ['biomass', 'बायोमास', 'crop mass', 'yield', 'उत्पादन', 'production', 'productivity'],
    responses: {
      marathi: 'बायोमास म्हणजे पिकाचे एकूण वस्तुमान. Dashboard वर Biomass Performance कार्ड पहा. तेथे एकूण बायोमास, भूमिगत बायोमास, कार्यक्षमता, आणि उत्पादन मेट्रिक्स दिसतील. बायोमास पिकाच्या वाढीचा निर्देशक आहे.',
      hindi: 'बायोमास का मतलब फसल का कुल द्रव्यमान है। Dashboard पर Biomass Performance कार्ड देखें। वहां कुल बायोमास, भूमिगत बायोमास, प्रदर्शन, और उत्पादन मेट्रिक्स दिखेंगे। बायोमास फसल की वृद्धि का सूचक है।',
      english: 'Biomass means total crop mass. Check Biomass Performance card on Dashboard. You will see total biomass, underground biomass, performance, and production metrics there. Biomass is an indicator of crop growth.'
    },
    category: 'biomass'
  },

  // Plot Selection
  {
    patterns: ['plot', 'प्लॉट', 'select', 'निवड', 'चुनें', 'farm', 'शेत', 'खेत', 'field', 'क्षेत्र'],
    responses: {
      marathi: 'प्लॉट निवडण्यासाठी Add Farm पृष्ठावर जा किंवा Dashboard वरून प्लॉट निवडा. निवडलेला प्लॉट सर्व पृष्ठांवर दिसेल. प्रत्येक प्लॉटसाठी स्वतंत्र विश्लेषण आणि माहिती उपलब्ध आहे.',
      hindi: 'प्लॉट चुनने के लिए Add Farm पेज पर जाएं या Dashboard से प्लॉट चुनें। चुना गया प्लॉट सभी पेजों पर दिखेगा। प्रत्येक प्लॉट के लिए अलग विश्लेषण और जानकारी उपलब्ध है।',
      english: 'Visit Add Farm page to select plot or select plot from Dashboard. Selected plot will appear on all pages. Separate analysis and information is available for each plot.'
    },
    category: 'plot'
  },

  // Dashboard
  {
    patterns: ['dashboard', 'डॅशबोर्ड', 'डैशबोर्ड', 'overview', 'अवलोकन', 'सारांश', 'summary'],
    responses: {
      marathi: 'Dashboard वर तुम्हाला पीक आरोग्य, कापणी तयारी, NPK विश्लेषण, माती माहिती, हवामान, आणि इतर महत्त्वाची मेट्रिक्स दिसतील. Dashboard वरून सर्व मुख्य माहिती एका ठिकाणी पहा.',
      hindi: 'Dashboard पर आपको फसल स्वास्थ्य, कटाई तैयारी, NPK विश्लेषण, मिट्टी की जानकारी, मौसम, और अन्य महत्वपूर्ण मेट्रिक्स दिखेंगे। Dashboard से सभी मुख्य जानकारी एक जगह देखें।',
      english: 'On Dashboard you will see crop health, harvest readiness, NPK analysis, soil information, weather, and other important metrics. View all key information in one place from Dashboard.'
    },
    category: 'dashboard'
  },

  // Reports
  {
    patterns: ['report', 'अहवाल', 'रिपोर्ट', 'data', 'माहिती', 'जानकारी', 'analysis', 'विश्लेषण'],
    responses: {
      marathi: 'तुम्ही Dashboard वरून विविध अहवाल आणि विश्लेषण पाहू शकता. प्रत्येक पृष्ठावर तुमच्या प्लॉटची तपशीलवार माहिती उपलब्ध आहे. PDF अहवाल डाउनलोड करण्याची सुविधा देखील उपलब्ध आहे.',
      hindi: 'आप Dashboard से विभिन्न रिपोर्ट और विश्लेषण देख सकते हैं। प्रत्येक पेज पर आपके प्लॉट की विस्तृत जानकारी उपलब्ध है। PDF रिपोर्ट डाउनलोड करने की सुविधा भी उपलब्ध है।',
      english: 'You can view various reports and analysis from Dashboard. Detailed information about your plot is available on each page. PDF report download facility is also available.'
    },
    category: 'reports'
  },

  // Farmer Role Specific
  {
    patterns: ['my farm', 'माझे शेत', 'मेरा खेत', 'my plot', 'माझा प्लॉट', 'मेरा प्लॉट'],
    responses: {
      marathi: 'तुमच्या शेताची माहिती Dashboard वर पहा. तेथे तुम्हाला पीक आरोग्य, कापणी तयारी, खत शिफारसी, माती विश्लेषण, आणि इतर महत्त्वाची माहिती दिसेल. Add Farm पृष्ठावरून नवीन प्लॉट जोडू शकता.',
      hindi: 'अपने खेत की जानकारी Dashboard पर देखें। वहां आपको फसल स्वास्थ्य, कटाई तैयारी, उर्वरक सुझाव, मिट्टी विश्लेषण, और अन्य महत्वपूर्ण जानकारी दिखेगी। Add Farm पेज से नया प्लॉट जोड़ सकते हैं।',
      english: 'View your farm information on Dashboard. You will see crop health, harvest readiness, fertilizer recommendations, soil analysis, and other important information there. You can add new plot from Add Farm page.'
    },
    category: 'farmer_info',
    roles: ['farmer']
  },

  // Manager Role Specific
  {
    patterns: ['all farms', 'सर्व शेत', 'सभी खेत', 'all plots', 'overview', 'अवलोकन'],
    responses: {
      marathi: 'Manager Dashboard वर तुम्हाला सर्व शेतांची एकूण माहिती दिसेल. तेथे एकूण क्षेत्र, पिकांची स्थिती, कापणी तयारी, आणि इतर संक्षिप्त माहिती उपलब्ध आहे. Agro Dashboard वरून सांख्यिकी माहिती पहा.',
      hindi: 'Manager Dashboard पर आपको सभी खेतों की कुल जानकारी दिखेगी। वहां कुल क्षेत्र, फसलों की स्थिति, कटाई तैयारी, और अन्य संक्षिप्त जानकारी उपलब्ध है। Agro Dashboard से सांख्यिकी जानकारी देखें।',
      english: 'On Manager Dashboard you will see overall information of all farms. Total area, crop status, harvest readiness, and other summary information is available there. View statistical information from Agro Dashboard.'
    },
    category: 'manager_info',
    roles: ['manager']
  },

  // Field Officer Role Specific
  {
    patterns: ['field visit', 'क्षेत्र भेट', 'मैदानी भ्रमण', 'monitoring', 'निरीक्षण', 'inspection'],
    responses: {
      marathi: 'Field Officer Dashboard वर तुम्हाला निरीक्षणासाठी आवश्यक माहिती दिसेल. तेथे पिकांची स्थिती, समस्या, आणि कृती शिफारसी उपलब्ध आहेत. Farm Crop Status पृष्ठावरून तपशीलवार माहिती पहा.',
      hindi: 'Field Officer Dashboard पर आपको निरीक्षण के लिए आवश्यक जानकारी दिखेगी। वहां फसलों की स्थिति, समस्याएं, और कार्य सुझाव उपलब्ध हैं। Farm Crop Status पेज से विस्तृत जानकारी देखें।',
      english: 'On Field Officer Dashboard you will see information needed for inspection. Crop status, issues, and action recommendations are available there. View detailed information from Farm Crop Status page.'
    },
    category: 'officer_info',
    roles: ['fieldofficer']
  },

  // Owner Role Specific
  {
    patterns: ['business', 'व्यवसाय', 'बिजनेस', 'revenue', 'आय', 'income', 'profit', 'नफा'],
    responses: {
      marathi: 'Owner Dashboard वर तुम्हाला व्यवसायाची संपूर्ण माहिती दिसेल. तेथे एकूण उत्पादन, कापणी स्थिती, आणि इतर व्यवसाय मेट्रिक्स उपलब्ध आहेत. Owner Farm Dash आणि Owner Harvest Dash पृष्ठांवरून तपशीलवार माहिती पहा.',
      hindi: 'Owner Dashboard पर आपको व्यवसाय की संपूर्ण जानकारी दिखेगी। वहां कुल उत्पादन, कटाई स्थिति, और अन्य व्यवसाय मेट्रिक्स उपलब्ध हैं। Owner Farm Dash और Owner Harvest Dash पेजों से विस्तृत जानकारी देखें।',
      english: 'On Owner Dashboard you will see complete business information. Total production, harvest status, and other business metrics are available there. View detailed information from Owner Farm Dash and Owner Harvest Dash pages.'
    },
    category: 'owner_info',
    roles: ['owner']
  },

  // Help
  {
    patterns: ['help', 'मदत', 'सहायता', 'how', 'कसे', 'कैसे', 'what', 'काय', 'क्या', 'guide', 'मार्गदर्शन'],
    responses: {
      marathi: 'मी तुम्हाला शेती आणि कृषी विषयी मदत करू शकतो. तुम्ही पीक आरोग्य, कापणी, खत, माती, सिंचन, कीटक, हवामान, बायोमास, प्लॉट निवड, Dashboard, आणि इतर विषयांवर प्रश्न विचारू शकता. कोणत्याही विषयावर मदत हवी असल्यास विचारा.',
      hindi: 'मैं आपकी खेती और कृषि से संबंधित मदद कर सकता हूं। आप फसल स्वास्थ्य, कटाई, उर्वरक, मिट्टी, सिंचाई, कीट, मौसम, बायोमास, प्लॉट चयन, Dashboard, और अन्य विषयों पर प्रश्न पूछ सकते हैं। किसी भी विषय पर मदद चाहिए तो पूछें।',
      english: 'I can help you with farming and agriculture. You can ask questions about crop health, harvest, fertilizer, soil, irrigation, pests, weather, biomass, plot selection, Dashboard, and other topics. Ask if you need help on any topic.'
    },
    category: 'help'
  },

  // Default/Unknown
  {
    patterns: ['default'],
    responses: {
      marathi: 'क्षमस्व, मला हा प्रश्न समजला नाही. कृपया शेती, कृषी, पीक, माती, खत, सिंचन, कीटक, हवामान, किंवा Dashboard या विषयांवर प्रश्न विचारा. मदत मिळवण्यासाठी "help" टाइप करा.',
      hindi: 'क्षमा करें, मैं इस प्रश्न को समझ नहीं सका। कृपया खेती, कृषि, फसल, मिट्टी, उर्वरक, सिंचाई, कीट, मौसम, या Dashboard के विषय पर प्रश्न पूछें। मदद के लिए "help" टाइप करें।',
      english: 'Sorry, I did not understand this question. Please ask questions about farming, agriculture, crops, soil, fertilizer, irrigation, pests, weather, or Dashboard. Type "help" for assistance.'
    },
    category: 'default'
  }
];

/**
 * Detect language from text
 */
export const detectLanguage = (text: string): 'marathi' | 'hindi' | 'english' => {
  const devanagariPattern = /[\u0900-\u097F]/;

  if (devanagariPattern.test(text)) {
    const marathiWords = ["आहे", "ची", "ला", "मी", "तुम्ही", "शेत", "पीक", "कापणी", "खत", "पाणी", "माझे", "माझा"];
    const hindiWords = ["है", "की", "को", "मैं", "आप", "खेत", "फसल", "कटाई", "उर्वरक", "पानी", "मेरे", "मेरा"];

    const hasMarathi = marathiWords.some(word => text.includes(word));
    const hasHindi = hindiWords.some(word => text.includes(word));

    if (hasMarathi && !hasHindi) return "marathi";
    if (hasHindi && !hasMarathi) return "hindi";
    return "marathi";
  }

  return "english";
};

/**
 * Find matching rule for user query
 */
export const findMatchingRule = (query: string, userRole?: UserRole): ChatRule | null => {
  const lowerQuery = query.toLowerCase().trim();

  for (const rule of CHATBOT_RULES) {
    if (rule.category === 'default') continue;

    // Check role-specific rules first
    if (rule.roles && userRole) {
      if (!rule.roles.includes(userRole)) continue;
    }

    for (const pattern of rule.patterns) {
      if (lowerQuery.includes(pattern.toLowerCase())) {
        return rule;
      }
    }
  }

  return CHATBOT_RULES.find(r => r.category === 'default') || null;
};

/**
 * Get response for user query - Always returns Marathi as base language
 */
export const getChatbotResponse = (query: string, userRole?: UserRole): { text: string; language: Language } => {
  const detectedLang = detectLanguage(query);
  const rule = findMatchingRule(query, userRole);

  if (!rule) {
    // Default response in Marathi
    return {
      text: 'क्षमस्व, मला हा प्रश्न समजला नाही. कृपया शेती, कृषी, पीक, माती, खत, सिंचन, कीटक, हवामान, किंवा Dashboard या विषयांवर प्रश्न विचारा. मदत मिळवण्यासाठी "help" टाइप करा.',
      language: 'marathi'
    };
  }

  // Always prefer Marathi response, fallback to detected language if Marathi not available
  return {
    text: rule.responses.marathi || rule.responses[detectedLang] || rule.responses.english,
    language: 'marathi' // Always return Marathi as language
  };
};

/**
 * Get TTS language code - Always returns Indian Marathi
 */
export const getTTSLanguageCode = (_language: Language): string => {
  // Always use Indian Marathi (mr-IN) for speech
  return 'mr-IN';
};
