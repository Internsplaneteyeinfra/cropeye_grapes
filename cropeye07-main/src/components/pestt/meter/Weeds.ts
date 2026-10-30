export interface Weed {
  name: string;
  months: string[];
  when: string;
  where: string;
  why: string;
  image: string;
  chemical: string[];
}

export const weedsData: Weed[] = [
  {
    name: "Hariali (Cynodon dactylon)",
    months: ["February", "March", "April", "May"],
    when: "Perennial, flushes in warm months",
    where: "Irrigated fields, bunds, canals",
    why: "Aggressive competitor, spreads via stolons & rhizomes, hard to control",
    image: "/Image/hariyali.jpg",
    chemical: [
      "Fenoxaprop-p-ethyl 9.3% EC - 400 ml/acre in 150–200 l water"
    ]
  },
  {
    name: "Congress Grass (Parthenium hysterophorus)",
    months: ["February", "March", "April", "May"],
    when: "Germinates with first rains",
    where: "Roadsides, waste lands, also in cane fields",
    why: "Allelopathic, fast spreading, causes worker allergies",
    image: "/Image/congress grass.jpg",
    chemical: [
      "2,4-D Sodium Salt 80% WP - 500–750 gm/acre in 150–200 l water"
    ]
  },
  {
    name: "Rajgira (Amaranthus spp.)",
    months: ["June", "July", "August", "September"],
    when: "Emerges in rainy season",
    where: "Fertile, irrigated cane fields",
    why: "Fast-growing broadleaf, competes for light & nutrients",
    image: "/Image/Amaranthus spp.jpg",
    chemical: [
      "Atrazine 50% WP - 500 gm/acre in 150–200 l water"
    ]
  },
  {
    name: "Bathua (Chenopodium album)",
    months: ["October", "November", "December", "January"],
    when: "Germinates in winter (low temp)",
    where: "Northern India, fertile irrigated lands",
    why: "Competes during early cane growth, reduces tillering",
    image: "/Image/bathua.jpg",
    chemical: [
      "2,4-D Sodium Salt 80% WP - 600–700 gm/acre in 150–200 l water"
    ]
  }
];
