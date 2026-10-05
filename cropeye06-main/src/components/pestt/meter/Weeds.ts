import { Control } from "leaflet";

export interface Weed {
  name: string;
  months: string[];
  when: string;
  where: string;
  why: string;
  image: string;
  chemical: string[];
  "Organic Control"?: string[];
  symptoms?: string[];
  identification?: string[];
}

export const weedsData: Weed[] = [
  {
    name: "Hararali (Doob grass) (Cynodon dactylon)",
    months: ["Year-round"],
    when: "Perennial, flushes in warm months",
    where: "Whole field (spreads underground)",
    why: "Warm climate (25–38°C), irrigation",
    image: "/Image/harli.jpg",
    chemical: [
      "Glyphosate 1.5–2.0 L OR Quizalofop 400 ml OR Haloxyfop 300–400 ml"
    ],
    "Organic Control": [
      "Deep ploughing + solarization"
    ],
    symptoms: [
      "Strong competition",
      "difficult to remove",
    ],
    identification: [
      "DCreeping grass with runners (stolons)",
    ],
  },
  {
    name: "Congress Grass (Gajar Gavat)",
    months: ["Feb-Oct"],
    when: "Germinates with first rains",
    where: "Whole field, inter-row space",
    why: "Warm temp (25–35°C), moderate–high humidity, disturbed soil",
    image: "/Image/congress grass.jpg",
    chemical: [
      "Glyphosate 1.0–1.5 L OR 2,4-D 0.5–1.0 L"
    ],
    "Organic Control": [
      "Neem oil 2–3 L OR manual uprooting before flowering"
    ],
    symptoms: [
      "Heavy competition",
      "allelopathy reduces grape growth",
      "health hazard",
    ],
    identification: [
      "Deeply lobed leaves",
      "white small flowers"
    ],
  },
  {
    name: "Math (Pigweed) (Amaranthus spp.)",
    months: ["Mar – Aug"],
    when: "Emerges in rainy season",
    where: "Crop rows, open soil",
    why: "High temp (30–42°C), open field",
    image: "/Image/Math.jpg",
    chemical: [
      "Pendimethalin 1.0–1.3 L (pre) OR Glyphosate 1.0 L OR Oxyfluorfen 200–300 ml"
    ],
    "Organic Control": [
      "Mulching + hand weeding"
    ],
    symptoms: [
      "Fast growth",
      "nutrient competition",
    ],
    identification: [
      "Broad leaves",
      
    ],
  },
  {
    name: "Dudhi gavat (Euphorbia hirta)",
    months: ["Jun – Nov"],
    when: "Germinates in winter (low temp)",
    where: "Near plant base, moist soil",
    why: "High humidity (60–85%), moderate temp",
    image: "/Image/Dudhi.jpg",
    chemical: [
      "Oxyfluorfen 200–300 ml OR Glyphosate 1.0 L"
    ],
     "Organic Control": [
      "Hand weeding + mulching"
    ],
    symptoms: [
      "Competes in early stage", 
      "latex may affect soil",
    ],
    identification: [
      "Small plant with milky latex",
      
    ],
  },
   {
    name: "Chiktya (Galium aparine)",
    months: ["Nov – Feb"],
    when: "Germinates in winter (low temp)",
    where: "Climbs on vines, canopy",
    why: "Cool temp (15–25°C), high humidity",
    image: "/Image/Chiktya.jpg",
    chemical: [
      "2,4-D 0.5–1.0 L OR Metsulfuron 4–8 g OR Glyphosate 1.0 L"
    ],
     "Organic Control": [
      "Manual removal early"
    ],
    symptoms: [
      "Interferes with canopy, reduces sunlight",
    ],
    identification: [
      "Sticky stems, sticks to clothes",
      
    ],
  }
];