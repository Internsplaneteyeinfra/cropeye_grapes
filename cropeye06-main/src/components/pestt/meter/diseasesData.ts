export interface Disease {
  name: string;
  months: string[];
  symptoms: string[];
  where: string;
  why: string;
  when: {
    high: string;
    moderate: string;
    low: string;
  };
  organic: string[];
  chemical: string[];
  conditions?: Array<{
    temperatureRange: string;
    humidityRange: string;
  }>;
  image: string;
  stage?: {
    minDays: number;
    maxDays: number;
    description: string;
  };
}

export const diseasesData: Disease[] = [
  {
    name: "Downy mildew",
    months: ["September", "October", "November", "December", "January"],
    stage: {
      minDays: 20,
      maxDays: 80,
      description: "Shoot Development to Berry development (20–80 DAP)"
    },
    symptoms: [
      "Small yellow spots on upper leaf surface",
      "White fuzzy (downy) growth on underside of leaves",
      "Affects shoots, leaves, and berries"
    ],
    where: "Leaves, shoots, and berries",
    why: "Fungal infection in cool, humid conditions",
    when: {
      high: "Present at the field",
      moderate: "In next 3–5 days",
      low: "In next 7–10 days"
    },
    organic: ["Proper canopy management", "Copper-based sprays"],
    chemical: ["Metalaxyl", "Mancozeb"],
    conditions: [
      {
        temperatureRange: "18.00°C–28.00°C",
        humidityRange: "80%–100%"
      }
    ],
    image: "/Image/downy_mildew.jpg"
  },
  {
    name: "Powdery mildew",
    months: ["October", "November", "December", "January"],
    stage: {
      minDays: 30,
      maxDays: 90,
      description: "Flowering to Berry development (30–90 DAP)"
    },
    symptoms: [
      "White powdery coating on leaves, shoots and berries",
      "Leaves may curl and distort",
      "Berries can crack and become susceptible to secondary infections"
    ],
    where: "Leaves, shoots, and berries",
    why: "Fungal infection in warm, moderately humid conditions",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Sulfur dusting", "Neem oil spray"],
    chemical: ["Tridemorph", "Triazole fungicides"],
    conditions: [
      {
        temperatureRange: "21.00°C–27.00°C",
        humidityRange: "40%–80%"
      }
    ],
    image: "/Image/powdery_mildew.jpg"
  },
  {
    name: "Anthracnose",
    months: ["September", "October"],
    stage: {
      minDays: 15,
      maxDays: 50,
      description: "Bud Break to Shoot Development (15–50 DAP)"
    },
    symptoms: [
      "Dark brown to black spots on leaves, shoots and berries",
      "Sunken lesions on berries",
      "Shoot tips may die back"
    ],
    where: "Leaves, shoots, and berries",
    why: "Fungal infection in warm, wet conditions",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Remove and destroy infected parts", "Copper oxychloride"],
    chemical: ["Carbendazim", "Mancozeb"],
    conditions: [
      {
        temperatureRange: "24.00°C–32.00°C",
        humidityRange: "80%–90%"
      }
    ],
    image: "/Image/anthracnose.jpg"
  },
  {
    name: "Fusarium wilt",
    months: ["October", "November", "December", "January", "February"],
    stage: {
      minDays: 20,
      maxDays: 75,
      description: "Bud break to berry thinning (20–75 DAP)"
    },
    symptoms: [
      "Leaves wilt and turn yellow",
      "Vine decline and dieback",
      "Internal browning of vascular tissue"
    ],
    where: "Roots and vascular system",
    why: "Soil-borne fungal infection",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Soil solarization", "Resistant rootstock", "Trichoderma application"],
    chemical: ["Carbendazim", "Thiophanate-methyl"],
    conditions: [
      {
        temperatureRange: "25.00°C–30.00°C",
        humidityRange: "80%–90%"
      }
    ],
    image: "/Image/fusarium_wilt.jpg"
  },
  {
    name: "Rust",
    months: ["August-October"],
    symptoms: ["Yellow-orange pustules on leaf underside", "Premature leaf fall"],
    where: "Leaves (underside)",
    why: "Warm, humid weather and poor vineyard ventilation",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Cow urine 10% spray"],
    chemical: ["Wettable sulphur 80 WP @ 600 g/acre", "Mancozeb 75 WP @ 400 g/acre"],
    image: "/Image/rust.jpg",
  },
  {
    name: "Black rot",
    months: ["July-September"],
    symptoms: ["Small brown leaf spots that turn black", "Berries shrivel into black mummies"],
    where: "Leaves and berries",
    why: "Warm, wet weather and poor sanitation",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Collect and destroy infected berries", "Garlic extract spray"],
    chemical: ["Mancozeb 75 WP @ 400 g/acre", "Zineb 75 WP @ 400 g/acre"],
    image: "/Image/wilt.png",
  },
  {
    name: "Botrytis (Grey mold)",
    months: ["December-February"],
    symptoms: ["Grey mold on bunches", "Berries rot during storage or transport"],
    where: "Flower clusters and berries",
    why: "Cool, humid, cloudy weather",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Trichoderma foliar spray @ 1 kg/acre in 200 L water"],
    chemical: ["Carbendazim 50 WP @ 200 g/acre", "Iprodione 50 WP @ 400 g/acre"],
    image: "/Image/wilt.png",
  },
  {
    name: "Cercospora leaf spot",
    months: ["August-October"],
    symptoms: ["Circular reddish-brown spots", "Leaf yellowing", "Premature defoliation"],
    where: "Leaves",
    why: "Warm, humid weather",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Neem seed kernel extract 5% spray"],
    chemical: ["Mancozeb 75 WP @ 400 g/acre"],
    image: "/Image/wilt.png",
  }
];
