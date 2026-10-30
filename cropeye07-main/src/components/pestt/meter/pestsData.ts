
export type RiskLevel = 'high' | 'moderate' | 'low';

export interface Pest {
  name: string;
  months: string[];
  temperature: string;
  humidity: string;
  image: string;
  symptoms: string[];
  identification: string[];
  where: string;
  why: string;
  when: {
    high: string;
    moderate: string;
    low: string;
  };
  organic: string[];
  chemical: string[];
  // Stage information: minDays and maxDays since plantation
  stage?: {
    minDays: number;
    maxDays: number;
    description: string;
  };
  // Category for API matching
  category?: 'chewing' | 'sucking' | 'soil_borne';
}

export const pestsData: Pest[] = [
  {
    name: "Early shoot borer",
    months: ["April", "May", "June", "July"],
    temperature: "28-32",
    humidity: "70-80",
    image: "/Image/Early-Shoot-Borer.jpg",
    stage: {
      minDays: 0,
      maxDays: 120,
      description: "Germination (0-45 days) to early tillering (46-120 days)"
    },
    category: "chewing",
    symptoms: [
      "Dead heart seen in 1–3 month-old crop",
      "Caterpillar bores into the central shoot and eats inside",
      "Shoot becomes dry and can be easily pulled out",
      "Rotten part gives a bad smell",
      "Small holes appear near the base of the shoot"
    ],
    identification: [
      "Before pupating, the caterpillar makes a big hole in the stem",
      "It covers the hole with a silk-like layer"
    ],
    where: "Big hole in the stem",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Intercropping with daincha",
      "Granulosis virus spray 30gm/hectare as 0.1gm/litre",
      "Sturmiopsis inferens 1000–150 gravid females/hectare"
    ],
    chemical: [
      "Thiamethoxam 5–10 gm/15 litre water",
      "Chlorantraniliprole 60ml/acre in 200 litre water",
      "Fipronil 400–600ml/acre in 200 litre water"
    ]
  },
  {
    name: "Top shoot borer",
    months: ["January", "February", "March", "April"],
    temperature: "27-30",
    humidity: "75-85",
    image: "/Image/topshoot borer.jpg",
    stage: {
      minDays: 46,
      maxDays: 210,
      description: "Tillering (46-120 days) to grand growth (121-210 days)"
    },
    category: "chewing",
    symptoms: [
      "Small caterpillars attack the top part of sugarcane, making holes and feeding inside the stem",
"This causes the center of older canes to die, a problem called dead heart and it can’t be pulled out easily",
"The caterpillar makes holes in young, unopened leaves, so when the leaves grow, they have a line of holes",
"You may see holes at the top and a bunchy or bushy tip on the plant"
    ],
    identification: [
      "Caterpillar bores into the central shoot",
      "Small holes near the growing point"
    ],
    where: "Central shoot near growing point",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Intercropping with daincha",
      "Granulosis virus spray 30gm/hectare"
    ],
    chemical: [
      "Thiamethoxam 5–10 gm/15 litre water",
      "Chlorantraniliprole 60ml/acre in 200 litre water"
    ]
  },
  {
    name: "Root borer",
    months: ["April", "May", "June", "July", "August", "September", "October"],
    temperature: "28-32",
    humidity: "70-80",
    image: "/Image/root-borer.jpg",
    stage: {
      minDays: 0,
      maxDays: 45,
      description: "Germination stage (0-45 days)"
    },
    category: "chewing",
    symptoms: [
      "Roots are damaged by borers",
      "Plant shows stunted growth",
      "Yellowing of leaves"
    ],
    identification: [
      "Larvae bore into roots",
      "Roots show holes and damage"
    ],
    where: "Roots",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Neem cake application",
      "Trichogramma release"
    ],
    chemical: [
      "Chlorantraniliprole 60ml/acre in 200 litre water",
      "Fipronil 400–600ml/acre in 200 litre water"
    ]
  },
  {
    name: "Internode borer",
    months: ["October", "November", "December"],
    temperature: "30-35",
    humidity: "70-85",
    image: "/Image/internode borer.jpg",
    stage: {
      minDays: 121,
      maxDays: 365,
      description: "Grand growth (121-210 days) to maturity (211-365 days)"
    },
    category: "chewing",
    symptoms: [
      "The stem parts (internodes) become narrow and short with many holes and sawdust-like material (frass) around the joints.",
      "The affected areas turn reddish.",
      "The plant shows dead heart symptoms (central shoot dies)",
      "The internodes become misshaped and weak",
    ],
    identification: [
      "Caterpillars bore into sugarcane stems near nodes",
      "The entry holes are often plugged with excreta (insect droppings).",
    ],
    where: "Internodes of stem",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
       "Beauveria bassiana (bio-insecticide): 2.5 ml per liter of water (spray)",
       "Trichogramma chilonis (egg parasitoid): Release 2.5 ml per hectare",
    ],
    chemical: [
      "Chlorantraniliprole 18.5% SC: 0.36 ml per liter of water (spray)",
        "Dimethoate 30% EC: 1.5-2.5 ml per liter of water (spray)"
    ]
  },
  {
    name: "White grub",
    months: ["May", "June", "July", "August", "September"],
    temperature: "25-32",
    humidity: "80-90",
    image: "/Image/White Grub.jfif",
    stage: {
      minDays: 46,
      maxDays: 365,
      description: "Tillering to maturity (4-10 months)"
    },
    category: "soil_borne",
    symptoms: [
      "Yellowing and wilting of leaves",
      "Drying of entire crown",
      "Affected canes come off easily when pulled"
    ],
    identification: [
      "Grub - Fleshy 'C' shaped, whitish yellow in colour found close to the base of the clump"
    ],
    where: "Stem near soil",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Castor seed based traps 15–20 traps/acre",
      "Metarhizium anisopliae - 1–2 litre/acre in 200 litre water",
      "Beauveria bassiana - 2 litre/hectare in 200 litre water"
    ],
    chemical: [
      "Quinalphos 25% EC soil application - 2 litre/acre in 200–250 litre water"
    ]
  },
  {
    name: "Termites",
    months: ["September", "October", "November", "December", "January", "February", "March", "April", "May"],
    temperature: "30-38",
    humidity: "20-40",
    image: "/Image/termites.jpg",
    stage: {
      minDays: 0,
      maxDays: 365,
      description: "Germination to maturity (any stage)"
    },
    category: "soil_borne",
    symptoms: [
      "Semi-circular bite marks on the edges of sugarcane leaves",
"Poor sprouting of planted cane pieces (setts)",
"Outer leaves turn yellow and dry first, then inner leaves dry",
"The whole shoot dries up and can be easily pulled out",
"Setts become hollow inside and may fill with soil"
    ],
    identification: [
      "Small creamy-colored insects with dark heads that look like ants",
"They make tunnels in the sugarcane stems and sometimes fill them with soil"
    ],
    where: "Stems and roots",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
    "Neem oil: 5 ml per liter water applied as spray",
"Entomopathogenic fungi (Metarhizium anisopliae): 2-3 g per liter water applied to soil"
    ],
    chemical: [
      "Chlorpyrifos 20 EC: 2.5 ml per liter water, soil drench or sett treatment",
      "Imidacloprid 17.8 SL: 1 ml per liter water, dip setts or soil drench"
    ]
  },
  {
    name: "Whitefly",
    months: ["May", "June", "July", "August", "September", "October"],
    temperature: "30-35",
    humidity: "30-50",
    image: "/Image/Whitefly.jpg",
    stage: {
      minDays: 121,
      maxDays: 210,
      description: "Grand growth stage (121-210 days)"
    },
    category: "sucking",
    symptoms: [
      "Yellowing of leaves and later it shows pale in colour",
      "Leaf turns pinkish or purple and later gradually dry",
      "Infested leaves look white and black dots"
    ],
    identification: [
      "White flies are present under the leaves"
    ],
    where: "Under the leaves",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Sticky traps 20 traps/acre"
    ],
    chemical: [
      "Chlorpyriphos 20%EC - 500ml/acre in 200–250 litre water",
      "Imidacloprid 17.8%SL - 1–2ml/litre"
    ]
  },
  {
    name: "Sugarcane woolly aphids",
    months: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ],
    temperature: "25-30",
    humidity: "75-85",
    image: "/Image/Wooly Aphids.jpg",
    stage: {
      minDays: 121,
      maxDays: 365,
      description: "Grand Growth (121-210 days) to Maturity (211-365 days)"
    },
    category: "sucking",
    symptoms: [
      "Large number of white coloured nymphs and adults on the under surface of leaf",
      "Yellowing and drying of leaves from the tip along the margins",
      "Leaves become brittle and dries completely",
      "Heavy secretion of honey dew leads to development of sooty mold",
      "Deposition of wooly matter on ground / soil distinctly visible"
    ],
    identification: [
      "Nymphs are yellowish white in colour with less powdery substance"
    ],
    where: "On leaves",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Azadirachtin 50,000 ppm - 1–1.5 litre/hectare in 200–250 litre water",
      "Ladybug beetles - 1000–2000 larvae/hectare"
    ],
    chemical: [
      "Chlorpyriphos 20%EC - 500ml/acre in 200 litre water",
      "Imidacloprid 17.8%SL - 1–2ml/litre"
    ]
  },
  {
    name: "Sugarcane pyrilla",
    months: ["February", "March"],
    temperature: "25-30",
    humidity: "70-80",
    image: "/Image/pyrilla.png",
    stage: {
      minDays: 121,
      maxDays: 365,
      description: "Grand Growth (121-210 days) to Maturity (211-365 days)"
    },
    category: "sucking",
    symptoms: [
       "Leaves become yellow",
       "Covered with black sooty mould",
       "Top leaves get dried up and lateral buds germinate",
    ],
    identification: [
     "Sucks sap from the underside of leaves",
      "Secretes honeydew that promotes sooty mold growth",
    ],
    where: "On leaves",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Neem-based products (Azadirachtin): 1-2 ml per liter of water",
       "Parasitoid Epiricania melanoleuca: Release 3200 to 4000 cocoons per hectare",
    ],
    chemical: [
      "Lambda Cyhalothrin 5% EC: 2 ml per liter of water",
      "Dimethoate 30% EC: 1.5 ml per liter of water",
    ]
  },
  {
    name: "Mealy bug",
    months: ["February", "March", "September", "October", "November", "December"],
    temperature: "30-38",
    humidity: "30-50",
    image: "/Image/mealybug.jpg",
    stage: {
      minDays: 121,
      maxDays: 365,
      description: "Grand Growth (121-210 days) to Maturity (211-365 days)"
    },
    category: "sucking",
    symptoms: [
      "Pinkish oval insects under leaf sheath on nodes with white mealy coating",
      "Main cane growth is stunted and roots attacked",
      "Sooty mold grows on honeydew, making canes look black and attracts ants.",
      "Yellowing of leaves"
    ],
    identification: [
      "Sucks sap from stems and roots under leaf sheaths",
       "Produces honeydew leading to sooty mold on canes",
    ],
    where: "On stems and leaves",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Use fish oil resin soap @ 2.5 ml per liter of water (mixed with insecticide for spraying).",
    ],
    chemical: [
      "Methyl parathion 50 EC: 400 to 450 ml per acre  in 200 to 300 liters of water",
       "Malathion 50 EC: 400 to 450 ml per acre  in 200 to 300 liters of water",
       "Dimethoate 30 EC: 1 ml per liter (mixed with fish oil resin soap for spraying)"
    ]
  },
  {
    name: "Sugarcane scale insect",
    months: ["March", "April", "May", "June", "July", "August", "September", "October"],
    temperature: "28-32",
    humidity: "75-85",
    image: "/Image/scale insect.jpg",
    stage: {
      minDays: 46,
      maxDays: 365,
      description: "Tillering (46-120 days) to Maturity (211-365 days)"
    },
    category: "sucking",
    symptoms: [
      "Leaves dry at the tip and look pale or yellow.",
      "Canes can dry out completely and look brownish red inside when cut open",
       "Thick, brown, crusty layers appear on the nodes and between the nodes.",
       "Irregular yellow patches on leaves.",
    ],
    identification: [
      "Scale insects settle on the stems and leaves, sucking sap from the plant tissues",
    ],
    where: "On stems",
    why: "Due to climate",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: [
      "Chilocorus nigritus egg card: 5 cc per acre",
      "Pharascymnus horni egg card: 5 cc per acre",
     "Release natural enemies: Anabrotepis mayurai, Cheiloneurus, Saniosulus nudus, Tyrophagus",

    ],
    chemical: [
      "Malathion 50 EC: 400–450 ml per acre in 200–300 liters water",
      "Dimethoate 30 EC: 1–2 ml per liter water",
      "Dichlorvos: 2 ml per liter water",
      "Methyl parathion 50 EC: 400–450 ml per acre in 200–300 liters water",
      "Fish oil resin soap: 2.5 ml per liter water (mix with insecticide)"
    ]
  },

];
