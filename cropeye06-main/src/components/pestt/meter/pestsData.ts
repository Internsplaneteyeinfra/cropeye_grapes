export type RiskLevel = "high" | "moderate" | "low";

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
  stage?: {
    minDays: number;
    maxDays: number;
    description: string;
  };
  category?: "chewing" | "sucking" | "soil_borne";
}

export const pestsData: Pest[] = [
  {
    name: "Flea beetle",
    months: ["September-October"],
    temperature: "25–32",
    humidity: "60–75",
    image: "/Image/flea_beetle.jpg",
    stage: {
      minDays: 10,
      maxDays: 30,
      description: "Bud Break to shoot Development (10–30 DAP)"
    },
    category: "chewing",
    symptoms: [
      "Holes in tender leaves",
      "Damage to buds ",
      "Shot holes on leaves",
      "Root damage by grubs"
    ],
    identification: [
      "Adult: reddish-brown, shiny, 6 spots on back ",
      "Grub: brown with black head"
    ],
    where: "Buds, young leaves, roots",
    why: "Flush period after pruning, high humidity",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Shake vines & collect adults in kerosenated water ", "Maintain clean pruning fields"],
    chemical: ["Phosalone 35 EC @ 80 ml/acre in 200 L water"]
  },
  {
    name: "Leaf roller",
    months: ["October", "November"],
    temperature: "22–30",
    humidity: "65–85",
    image: "/Image/leaf_roller.jpg",
    stage: {
      minDays: 20,
      maxDays: 45,
      description: "Shoot Development to Flowering (20–45 DAP)"
    },
    category: "chewing",
    symptoms: [
      "Leaves rolled ",
      "Chlorophyll scraped inside",
      "Skeletonized leaves"
    ],
    identification: [
      "Larva: pale green, hairy ",
      "Adult: brown moth with wavy line"
    ],
    where: "Tender leaves, shoots",
    why: "Warm humid weather favors caterpillar activity",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Collect & destroy rolled leaves", "Encourage natural enemies (Trichogramma release)"],
    chemical: ["Quinalphos 25 EC @ 100 ml/acre ", "Phosalone 35 EC @ 80 ml/acre"]
  },
  {
    name: "Sphingid caterpillar",
    months: ["July", "August", "September"],
    temperature: "24–34",
    humidity: "70–90",
    image: "/Image/sphingid_caterpillar.jpg",
    stage: {
      minDays: 15,
      maxDays: 40,
      description: "Active vegetative growth (15–40 DAP, monsoon pruning)"
    },
    category: "chewing",
    symptoms: [
      "Defoliation (eats leaves)",
    ],
    identification: [
      "Larva: stout green with anal horn ",
      "Adult: large red-brown moth"
    ],
    where: "Leaves (defoliation)",
    why: "Humid monsoon climate favors growth",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Handpick larvae ", "Neem oil 3% @ 1.2 L/acre in 200 L water"],
    chemical: ["Quinalphos 25 EC @ 100 ml/acre ", "Chlorpyrifos 20 EC @ 100 ml/acre"]
  },
  {
    name: "Stem girdler",
    months: ["Aug–Nov"],
    temperature: "25–35",
    humidity: "55–75",
    image: "/Image/stem_girdler.jpg",
    stage: {
      minDays: 30,
      maxDays: 70,
      description: "Shoot Development to berry Development (30–70 DAP)"
    },
    category: "chewing",
    symptoms: [
      "Wilting of branches and whole vine ",
      "Cane girdling injury",
    ],
    identification: [
      "Grub: dark brown head, strong jaws",
      "Adult: grey beetle with white spot on each wing cover"
    ],
    where: "Trunks, canes, branches",
    why: "Adults lay eggs in bark after pruning",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Remove loose bark at pruning ", "Destroy girdled branches"],
    chemical: ["Carbaryl 50 WP @ 80 g/acre (2 g/L) swabbing ", "Quinalphos 25 EC @ 100 ml/acre in 200 L water"]
  },
  {
    name: "Mealybug",
    months: ["December", "January", "February", "March", "April"],
    temperature: "20–32",
    humidity: "55-75",
    image: "/Image/mealybug.jpg",
    stage: {
      minDays: 65,
      maxDays: 120,
      description: "Berry development to Ripening (65–120 DAP)"
    },
    category: "sucking",
    symptoms: [
      "Premature fruit drop ",
      "Sooty mold on honeydew",
    ],
    identification: [
      "Nymph: yellowish–pale white ",
      "Adult: slender, white wax covering"
    ],
    where: "Shoots, fruits, bark",
    why: "Dry weather with ant activity, poor sanitation",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Debark vine trunks • Sticky bands @ 25–30 per acre", "Release predator Cryptolaemus montrouzieri @ 250–300 beetles/acre"],
    chemical: ["Dichlorvos 76 WSC @ 40 ml/acre + fish oil soap 250 g", "Quinalphos 25 EC @ 100 ml/acre soil drench"]
  },
  {
    name: "Thrips",
    months: ["October", "November", "December", "January"],
    temperature: "25–35",
    humidity: "40–65",
    image: "/Image/thrips.jpg",
    stage: {
      minDays: 30,
      maxDays: 70,
      description: "Shoot Development to Berry Thinning (30–70 DAP)"
    },
    category: "sucking",
    symptoms: [
      "Silvery white patches on leaves ",
      "Fruit scarring ",
      "Premature fruit drop"
    ],
    identification: [
      "Nymph: yellowish-brown with red abdomen ",
      "Adult: black-brown body, yellow wings"
    ],
    where: "Leaves, flower clusters, berries",
    why: "Hot & dry weather, dusty conditions",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Blue sticky traps (10–12/acre)", " Neem oil 3% @ 1.2 L/acre"],
    chemical: ["Dimethoate 30 EC @ 120 ml/acre in 200 L water ", "Methyl demeton 25 EC @ 100 ml/acre"]
  },
  {
    name: "Fruit sucking moth",
    months: ["December", "January", "February", "March", "April"],
    temperature: "18–30",
    humidity: "60–80",
    image: "/Image/fruit%20sucking%20moth.webp",
    stage: {
      minDays: 90,
      maxDays: 130,
      description: "Ripening stage (90–130 DAP)"
    },
    category: "sucking",
    symptoms: [
      "Holes in berries",
      "Juice sucking",
      "Secondary infection → rotting",
      "Fruit drop",
    ],
    identification: [
      "Adult: large brown moth with orange/yellow hind wings",
      "Strong proboscis for piercing fruits"
    ],
    where: "Ripe fruits (berries)",
    why: "Warm, humid weather; availability of ripe fruits",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Collect & destroy damaged fruits", "Use light traps","Smoke in vineyard at night"],
    chemical: ["Malathion 50 EC @ 200 ml in 200 L water (evening spray)"]
  },
  {
    name: "Grapevine beetle",
    months: ["June-September"],
    temperature: "",
    humidity: "",
    image: "/Image/flea_beetle.jpg",
    category: "chewing",
    symptoms: ["Wilting of branches and vine"],
    identification: [
      "Adult: dark brown with three-bladed antennae and spines at the wing end",
      "Grub: thick, fleshy, yellow-white, curved body",
    ],
    where: "Stems and branches",
    why: "Warm, humid climate and freshly pruned vines",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Remove loose bark", "Collect adults in kerosenated water"],
    chemical: ["Phosalone 35 EC @ 80 ml/acre after pruning"],
  },
  {
    name: "Mealybug (pink)",
    months: ["November-March"],
    temperature: "",
    humidity: "",
    image: "/Image/mealybug.jpg",
    category: "sucking",
    symptoms: ["Sap sucking", "Crinkled, yellow leaves", "Berry rot", "Sooty mold"],
    identification: ["Nymph: pinkish", "Adult: pink and covered with white wax"],
    where: "Leaves, shoots, and berries",
    why: "Dry conditions, ants, and poor field hygiene",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Field sanitation", "Release Cryptolaemus @ 250–300 beetles/acre"],
    chemical: ["Methyl demeton 25 EC @ 100 ml/acre", "Dichlorvos 76 WSC @ 40 ml/acre spray"],
  },
  {
    name: "Berry plume moth",
    months: ["October-January"],
    temperature: "",
    humidity: "",
    image: "/Image/fruit%20sucking%20moth.webp",
    symptoms: ["Webbing of flower buds", "Larvae bore into berries", "Tunneling inside fruit"],
    identification: ["Larva: pale green or pink with a red line", "Adult: small plume moth"],
    where: "Buds, flowers, and green berries",
    why: "Warm, humid weather during flowering and berry set",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days",
    },
    organic: ["Collect and bury infested berries", "Pheromone traps (8–10/acre)"],
    chemical: ["Buprofezin 25 SC @ 80 ml/acre", "Acetamiprid 20 SP @ 20 g/acre"],
  },
  {
    name: "Grub",
    months: ["June", "July", "August", "September"],
    temperature: "23–32",
    humidity: "70–90",
    image: "/Image/white_grub.jpg",
    stage: {
      minDays: 45,
      maxDays: 80,
      description: "Subcane to topping (45–80 DAP)"
    },
    category: "soil_borne",
    symptoms: [
      "Yellowing and wilting of vines",
      "Root damage and poor nutrient uptake",
      "Stunted growth"
    ],
    identification: [
      "C-shaped whitish grubs in soil",
      "Found near root zone"
    ],
    where: "Roots and soil",
    why: "Root feeding by beetle larvae",
    when: {
      high: "Present at the field",
      moderate: "In next 3–7 days",
      low: "In next 10–14 days"
    },
    organic: ["Metarhizium anisopliae", "Neem cake", "Castor traps"],
    chemical: ["Chlorpyriphos", "Quinalphos soil application"]
  }
];
