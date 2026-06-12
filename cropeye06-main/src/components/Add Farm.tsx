// Fixed AddFarm.tsx - Village moved to Plot Profile, Individual Plot Details with Location Pin
import React, { useRef, useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  useMap,
  Marker,
  Popup,
} from "react-leaflet";
import {
  User,
  Mail,
  Phone,
  Home,
  Building,
  Map,
  FileText,
  Ruler,
  Droplets,
  Plus,
  Trash2,
  MapPin,
  Calendar,
  Edit,
  X,
} from "lucide-react";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css"; // It's good practice to import CSS at the top level of your component file.
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import {
  getCropTypes,
  registerFarmerAllInOneOnly,
  refreshApiEndpoints,
  uploadGrapesReport,
} from "../api";
// Fix default marker icons for Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface Plot {
  id: string;
  geometry: any;
  area: {
    sqm: number;
    ha: number;
    acres: number;
  };
  layer: L.Layer;
  Group_Gat_No: string;
  Gat_No_Id: string;
  village: string;
  pin_code: string;
  crop_type: string;
  crop_type_id?: number; // Resolved from crop types API to avoid backend "multiple CropType" error
  crop_variety: string;
  plantation_Type: string;
  plantation_Method: string;
  plantation_Date: string;
  irrigation_Type: string;
  // Drip irrigation fields
  spacing_A: string;
  spacing_B: string;
  flow_Rate: string;
  emitters: string;
  // Flood irrigation fields
  motor_Horsepower: string;
  pipe_Width: string;
  distance_From_Motor: string;
  PlantAge: string;
  grapes_type: string;
  grapes_season: string;
  // Track if plot has been saved
  isSaved?: boolean;
}

interface SoilDetails {
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  soil_ph: string;
  cec: string;
  organic_carbon: string;
  bulk_density: string;
  fe: string;
  soil_organic_carbon: string;
}

interface FarmerData {
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  confirm_password: string;
  email: string;
  phone_number: string;
  aadhar_card: string;
  address: string;
  taluka: string;
  crop_type: string;
  // New Plantation Fields
  plantation_date: string;
  dogridge_rootstock_type: string;
  grafting_date: string;
  grafted_variety: string;
  soil_type: string;
  foundation_pruning_date: string;
  fruit_pruning_date: string;
  // Registration Page Details Fields (3-13 years)
  variety: string;
  irrigation_method: string;
  row_spacing: string;
  plant_spacing: string;
  flow_rate: string;
  dripper_per_plant: string;
  last_harvesting_date: string;
  intercropping: string;
  intercropping_crop_name?: string;
  plot_photo: File | null;
  residue_reported: File | null;
  soil_report: boolean;
  soil_details?: SoilDetails;
  state: string;
  district: string;
  documents: FileList | null;
}

interface IconVisibility {
  [key: string]: boolean;
}

interface LocationPin {
  position: [number, number];
  address?: string;
}

// Location data will be loaded from JSON file
let locationData: any = {};
let states: string[] = [];

// Helper functions to get districts and talukas
const getDistrictsByState = (state: string): string[] => {
  if (!state || !locationData[state]) {
    return [];
  }
  return Object.keys(locationData[state]);
};

const getTalukasByDistrict = (state: string, district: string): string[] => {
  if (!state || !district || !locationData[state]) {
    return [];
  }
  return locationData[state][district] || [];
};

const plantationTypes = ["Adsali", "Suru", "Pre-seasonal", "Ratoon"];
const plantationMethods = ["3 bud", "2 bud", "1 bud", "1 bud (Stip Method)"];

const PRUNING_DATE_FIELDS = ["foundation_pruning_date", "fruit_pruning_date"] as const;

const PRUNING_FIELD_LABELS: Record<string, string> = {
  foundation_pruning_date: "Foundation Pruning Date",
  fruit_pruning_date: "Fruit Pruning Date",
};

const formatPruningDisplayDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const isPruningDateField = (key: string) =>
  PRUNING_DATE_FIELDS.includes(key as (typeof PRUNING_DATE_FIELDS)[number]);

const grapesPlotsNeedPruningDates = (plotList: Plot[]) =>
  plotList.some(
    (plot) => plot.PlantAge === "0 to 3 years" || plot.PlantAge === "3 to 13 years"
  );

const getPruningFieldLabel = (key: string) =>
  PRUNING_FIELD_LABELS[key] ||
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type PruningFieldErrors = Partial<Record<(typeof PRUNING_DATE_FIELDS)[number], string>>;

const validatePruningDates = (
  data: FarmerData,
  plotList: Plot[]
): { message: string | null; fieldErrors: PruningFieldErrors } => {
  if (data.crop_type !== "Grapes" || !grapesPlotsNeedPruningDates(plotList)) {
    return { message: null, fieldErrors: {} };
  }

  const fieldErrors: PruningFieldErrors = {};
  const foundation = data.foundation_pruning_date?.trim() || "";
  const fruit = data.fruit_pruning_date?.trim() || "";

  if (!foundation) {
    fieldErrors.foundation_pruning_date = "Foundation Pruning Date is required.";
  }
  if (!fruit) {
    fieldErrors.fruit_pruning_date = "Fruit Pruning Date is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      message: "Please enter both Foundation and Fruit Pruning dates.",
      fieldErrors,
    };
  }

  const foundationDate = new Date(foundation);
  const fruitDate = new Date(fruit);
  if (Number.isNaN(foundationDate.getTime())) {
    fieldErrors.foundation_pruning_date = "Enter a valid date.";
  }
  if (Number.isNaN(fruitDate.getTime())) {
    fieldErrors.fruit_pruning_date = "Enter a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { message: "Please enter valid pruning dates.", fieldErrors };
  }

  if (fruitDate <= foundationDate) {
    fieldErrors.fruit_pruning_date = "Must be after Foundation Pruning Date.";
    return {
      message: "Fruit Pruning Date must be after Foundation Pruning Date.",
      fieldErrors,
    };
  }

  if (data.plantation_date) {
    const plantationDate = new Date(data.plantation_date);
    if (!Number.isNaN(plantationDate.getTime()) && foundationDate < plantationDate) {
      fieldErrors.foundation_pruning_date = "Cannot be before Plantation Date.";
      return {
        message: "Foundation Pruning Date cannot be before Plantation Date.",
        fieldErrors,
      };
    }
  }

  return { message: null, fieldErrors: {} };
};

const SQUARE_METERS_PER_ACRE = 4046.8564224;

function calculateAreaMetricsFromGeometry(geometry: any) {
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const coordinates = geometry.coordinates[0];
  if (!coordinates || coordinates.length < 4) {
    return null;
  }

  const polygonCoordinates = coordinates as Array<[number, number]>;

  const projectedPoints = polygonCoordinates.map((coordinate) => {
    if (!coordinate || coordinate.length < 2) {
      return null;
    }
    const [lng, lat] = coordinate;
    const projected = L.CRS.EPSG3857.project(L.latLng(lat, lng));
    return [projected.x, projected.y] as [number, number];
  }).filter(Boolean) as Array<[number, number]>;

  if (projectedPoints.length < 4) {
    return null;
  }

  let areaSqMeters = 0;
  for (let i = 0; i < projectedPoints.length; i++) {
    const [x1, y1] = projectedPoints[i];
    const [x2, y2] = projectedPoints[(i + 1) % projectedPoints.length];
    areaSqMeters += x1 * y2 - x2 * y1;
  }

  const areaSqm = Math.abs(areaSqMeters) / 2;
  const areaAcres = areaSqm / SQUARE_METERS_PER_ACRE;
  const areaHa = areaSqm / 10_000;

  return {
    sqm: areaSqm,
    ha: areaHa,
    acres: areaAcres,
  };
}

function RecenterMap({ latlng }: { latlng: [number, number] }) {
  const map = useMap();
  map.setView(latlng, 17);
  return null;
}

function MapReady({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();
  React.useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);
  return null;
}

function parseLatLngFromLink(link: string): [number, number] | null {
  // Google Maps: .../@lat,lng,... or .../place/lat,lng or ...?q=lat,lng
  const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const regex2 = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
  const regex3 = /\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/;

  let match = link.match(regex);
  if (match) return [parseFloat(match[1]), parseFloat(match[2])];

  match = link.match(regex2);
  if (match) return [parseFloat(match[1]), parseFloat(match[2])];

  match = link.match(regex3);
  if (match) return [parseFloat(match[1]), parseFloat(match[2])];

  return null;
}

async function resolveShortLink(shortUrl: string): Promise<string> {
  // Use a public CORS proxy (for demo/testing only)
  const proxyUrl = "https://corsproxy.io/?";
  try {
    const response = await fetch(proxyUrl + encodeURIComponent(shortUrl), {
      method: "GET",
      redirect: "follow",
    });
    // The final URL after redirects
    return response.url;
  } catch (e) {
    throw new Error("Could not resolve short link");
  }
}

// Reverse geocoding function to get address from coordinates
async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    const data = await response.json();
    return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch (error) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

function AddFarm() {
  const [formData, setFormData] = useState<FarmerData>({
    first_name: "",
    last_name: "",
    username: "",
    password: "",
    confirm_password: "",
    email: "",
    phone_number: "",
    aadhar_card: "",
    address: "",
    taluka: "",
    crop_type: "Grapes",
    // New Plantation Fields
    plantation_date: "",
    dogridge_rootstock_type: "",
    grafting_date: "",
    grafted_variety: "",
    soil_type: "",
    foundation_pruning_date: "",
    fruit_pruning_date: "",
    // Registration Page Details Fields (3-13 years)
    variety: "",
    irrigation_method: "",
    row_spacing: "",
    plant_spacing: "",
    flow_rate: "",
    dripper_per_plant: "",
    last_harvesting_date: "",
    intercropping: "",
    intercropping_crop_name: "",
    plot_photo: null,
    residue_reported: null,
    soil_report: false,
    soil_details: {
      nitrogen: "",
      phosphorus: "",
      potassium: "",
      soil_ph: "",
      cec: "",
      organic_carbon: "",
      bulk_density: "",
      fe: "",
      soil_organic_carbon: "",
    },
    state: "",
    district: "",
    documents: null,
  });

  const [graftedVarietySelection, setGraftedVarietySelection] = useState<string>(
    formData.grafted_variety || ""
  );

  const [varietySelection, setVarietySelection] = useState<string>(
    formData.variety || ""
  );

  const varietyLabel = (v: string): string => {
    const map: Record<string, string> = {
      tas_a_ganesh: "Tas-A-Ganesh",
      manik_chaman: "Manik Chaman",
      flame_seedless: "Flame Seedless",
      crimson_seedless: "Crimson Seedless",
      red_globe: "Red Globe",
      sudhakar_seedless: "Sudhakar Seedless",
      thompson_seedless: "Thompson Seedless",
      super_sonaka: "Super Sonaka",
      sharad_seedless: "Sharad Seedless",
      mama_jambo: "Mama Jambo",
      raigad_purple: "Raigad Purple",
      nanasaheb_purple: "Nanasaheb Purple",
      ssn: "SSN",
      rk: "RK",
      ard_35: "ARD 35",
      ard_36: "ARD 36",
      arra_35: "ARRA 35",
      arra_36: "ARRA 36",
      variety_1530: "1530",
      variety_1557: "1557",
    };
    if (map[v]) return map[v];
    return v
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  };

  const [showIcons, setShowIcons] = useState<IconVisibility>({
    first_name: true,
    last_name: true,
    username: true,
    password: true,
    confirm_password: true,
    email: true,
    phone_number: true,
    aadhar_card: true,
    address: true,
    taluka: true,
    PlantAge: true,
    crop_type: true,
    plantation_date: true,
    dogridge_rootstock_type: true,
    grafting_date: true,
    grafted_variety: true,
    soil_type: true,
    foundation_pruning_date: true,
    fruit_pruning_date: true,
    variety: true,
    irrigation_method: true,
    row_spacing: true,
    plant_spacing: true,
    flow_rate: true,
    dripper_per_plant: true,
    last_harvesting_date: true,
    intercropping: true,
    intercropping_crop_name: true,
    plot_photo: true,
    residue_reported: true,
    soil_report: true,
    state: true,
    district: true,
  });

  // Multiple plots state
  const [plots, setPlots] = useState<Plot[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [isEditModeReady, setIsEditModeReady] = useState(false);
  const [showSoilModal, setShowSoilModal] = useState(false);
  const [showPlotSavedMessage, setShowPlotSavedMessage] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [center, setCenter] = useState<[number, number]>([18.5204, 73.8567]);
  const [locationPin, setLocationPin] = useState<LocationPin | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [locationLink, setLocationLink] = useState("");
  const [locationLinkError, setLocationLinkError] = useState("");
  const [cropTypes, setCropTypes] = useState<
    Array<{
      id: number;
      crop_type: string;
      plantation_type: string;
      planting_method: string;
    }>
  >([]);

  // State for filtered districts and talukas
  const [filteredDistricts, setFilteredDistricts] = useState<string[]>([]);
  const [filteredTalukas, setFilteredTalukas] = useState<string[]>([]);

  // Phone number validation state
  const [phoneError, setPhoneError] = useState("");
  const [showPhoneTooltip, setShowPhoneTooltip] = useState(false);

  // Email validation state
  const [emailError, setEmailError] = useState("");
  const [showEmailTooltip, setShowEmailTooltip] = useState(false);

  const [pruningErrors, setPruningErrors] = useState<PruningFieldErrors>({});
  const [pruningRegistrationNotice, setPruningRegistrationNotice] = useState<{
    foundation: string;
    fruit: string;
    farmerName: string;
  } | null>(null);

  // Phone number validation pattern
  const phonePattern = /^[0-9]{10}$/;

  // Email validation pattern
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // File Preview State
  const [previewFile, setPreviewFile] = useState<{
    file: File;
    fieldName: string;
    fileUrl: string;
    fileType: string;
  } | null>(null);

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof FarmerData) => {
    const fileInput = e.target;
    if (!fileInput.files || fileInput.files.length === 0) {
      console.warn(`⚠️ No file selected for ${fieldName}`);
      return;
    }
    
    const file = fileInput.files[0];
    if (!file) {
      console.warn(`⚠️ File is null for ${fieldName}`);
      return;
    }
    
    // Validate it's a real File object
    if (!(file instanceof File)) {
      console.error(`❌ Invalid file type for ${fieldName}:`, typeof file);
      return;
    }
    
    // Validate file size
    if (file.size === 0) {
      console.warn(`⚠️ File is empty (size: 0) for ${fieldName}`);
      alert(`The selected file is empty. Please select a valid file.`);
      return;
    }
    
    console.log(`✅ File selected for ${fieldName}:`, {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    });
    
      setFormData((prev) => ({
        ...prev,
      [fieldName]: file, // Store the actual File object
      }));
  };

  const handleDeleteFile = (fieldName: keyof FarmerData) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: null,
    }));
    setPreviewFile(null);
  };

  const handlePreviewFile = (fieldName: keyof FarmerData) => {
    const file = formData[fieldName] as File;
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      setPreviewFile({
        file,
        fieldName: fieldName as string,
        fileUrl,
        fileType: file.type
      });
    }
  };

  const closePreview = () => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.fileUrl);
      setPreviewFile(null);
    }
  };



  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Load location data from JSON file
  useEffect(() => {
    const loadLocationData = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}location-data-part1.json`);
        const data = await response.json();
        locationData = data;
        states = Object.keys(data);
      } catch (error) {
      }
    };

    loadLocationData();
  }, []);

  // Fetch crop types on component mount
  useEffect(() => {
    const fetchCropTypes = async () => {
      try {
        const response = await getCropTypes();
        setCropTypes(response.data.results || response.data);
      } catch (error: any) {
        // Handle authentication errors gracefully - crop types are optional
        // Don't log warnings for expected 401 errors (crop types endpoint may require auth)
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Silently use default values - no need to warn for expected behavior
          setCropTypes([{
            id: 2,
            crop_type: "Sugarcane",
            plantation_type: "Adsali",
            planting_method: "3 bud"
          }]);
        } else {
          // Only log for unexpected errors
          console.warn("⚠️ Failed to fetch crop types:", error.message);
          // Set default crop type for sugarcane
          setCropTypes([{
            id: 2,
            crop_type: "Sugarcane",
            plantation_type: "Adsali",
            planting_method: "3 bud"
          }]);
        }
      }
    };

    fetchCropTypes();
  }, []);

  // Ensure polygons are in FeatureGroup for editing
  useEffect(() => {
    if (!featureGroupRef.current || plots.length === 0) return;

    try {
      // Always ensure all plot polygons are in FeatureGroup
      // This allows them to be edited when edit mode is enabled
      plots.forEach((plot) => {
        if (plot.layer && featureGroupRef.current) {
          try {
            // Check if layer is already in the group
            if (!featureGroupRef.current.hasLayer(plot.layer)) {
              featureGroupRef.current.addLayer(plot.layer);
            }
          } catch (error) {
            // Layer might already be added, ignore error
            console.warn("Layer already in FeatureGroup or error:", error);
          }
        }
      });
    } catch (error) {
      console.error("Error managing layers in FeatureGroup:", error);
    }
  }, [plots]);

  // Initialize edit mode - ensure polygons are in FeatureGroup
  useEffect(() => {
    if (!isEditingMode) {
      setIsEditModeReady(false);
      return;
    }

    if (!featureGroupRef.current || plots.length === 0) {
      setIsEditModeReady(false);
      return;
    }

    // Use a timeout to ensure React has finished rendering
    const timer = setTimeout(() => {
      try {
        // Ensure all polygons are in FeatureGroup for editing
        plots.forEach((plot) => {
          if (plot.layer && featureGroupRef.current) {
            try {
              // Check if layer is already in the group
              if (!featureGroupRef.current.hasLayer(plot.layer)) {
                featureGroupRef.current.addLayer(plot.layer);
              }
            } catch (error) {
              console.warn("Error adding layer:", error);
            }
          }
        });

        setIsEditModeReady(true);
      } catch (error) {
        console.error("Error initializing edit mode:", error);
        setIsEditingMode(false);
        setIsEditModeReady(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isEditingMode, plots]);

  // Auto-activate Leaflet Draw edit mode so vertex + midpoint handles appear immediately
  useEffect(() => {
    if (!isEditingMode || !isEditModeReady || !mapRef.current) return;

    const timer = setTimeout(() => {
      try {
        const mapContainer = mapRef.current?.getContainer();
        if (!mapContainer) return;

        const editButton = mapContainer.querySelector(
          ".leaflet-draw-edit-edit",
        ) as HTMLAnchorElement | null;

        if (!editButton) return;
        if (editButton.classList.contains("leaflet-disabled")) return;

        const isAlreadyActive = editButton.classList.contains(
          "leaflet-draw-toolbar-button-enabled",
        );

        if (!isAlreadyActive) {
          editButton.click();
        }
      } catch (error) {
        console.warn("Could not auto-start edit mode:", error);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isEditingMode, isEditModeReady]);

  // Update filtered districts and talukas when state or district changes
  useEffect(() => {
    if (formData.state) {
      const districts = getDistrictsByState(formData.state);
      setFilteredDistricts(districts);

      // Reset district and taluka when state changes
      if (formData.district && !districts.includes(formData.district)) {
        setFormData((prev) => ({ ...prev, district: "", taluka: "" }));
        setFilteredTalukas([]);
      } else if (formData.district) {
        const talukas = getTalukasByDistrict(formData.state, formData.district);
        setFilteredTalukas(talukas);
      }
    } else {
      setFilteredDistricts([]);
      setFilteredTalukas([]);
    }
  }, [formData.state]);

  useEffect(() => {
    if (formData.state && formData.district) {
      const talukas = getTalukasByDistrict(formData.state, formData.district);
      setFilteredTalukas(talukas);

      // Reset taluka if it's not in the new list
      if (formData.taluka && !talukas.includes(formData.taluka)) {
        setFormData((prev) => ({ ...prev, taluka: "" }));
      }
    } else {
      setFilteredTalukas([]);
    }
  }, [formData.district]);

  const getTotalArea = () => {
    return plots.reduce(
      (total, plot) => ({
        sqm: total.sqm + (plot.area?.sqm || 0),
        ha: total.ha + (plot.area?.ha || 0),
        acres: total.acres + (plot.area?.acres || 0),
      }),
      { sqm: 0, ha: 0, acres: 0 }
    );
  };


  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const nextFormData = {
        ...prev,
        [name]: value,
        ...(name === "state" ? { district: "", taluka: "" } : {}),
        ...(name === "district" ? { taluka: "" } : {}),
      };

      if (isPruningDateField(name) || name === "plantation_date") {
        const { fieldErrors } = validatePruningDates(nextFormData, plots);
        setPruningErrors(fieldErrors);
      }

      return nextFormData;
    });

    setShowIcons((prev) => ({
      ...prev,
      [name]: value === "",
    }));
  };

  // Phone number validation function
  const validatePhoneNumber = (phone: string): boolean => {
    // Remove any non-digit characters
    const cleanPhone = phone.replace(/\D/g, "");

    // Check if it matches the pattern exactly
    if (!phonePattern.test(cleanPhone)) {
      if (cleanPhone.length === 0) {
        setPhoneError("");
      } else if (cleanPhone.length < 10) {
        setPhoneError("Enter 10 digit number");
      } else if (cleanPhone.length > 10) {
        setPhoneError("Phone number must be exactly 10 digits");
      } else {
        setPhoneError("Only numbers are allowed");
      }
      return false;
    }

    setPhoneError("");
    return true;
  };

  // Handle phone number input with validation
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Only allow digits
    const cleanValue = value.replace(/\D/g, "");

    // Limit to 10 digits
    const limitedValue = cleanValue.slice(0, 10);

    // Update form data
    setFormData((prev) => ({
      ...prev,
      phone_number: limitedValue,
    }));

    setShowIcons((prev) => ({
      ...prev,
      phone_number: limitedValue === "",
    }));

    // Validate in real-time
    if (limitedValue.length > 0) {
      validatePhoneNumber(limitedValue);
      setShowPhoneTooltip(true);
    } else {
      setPhoneError("");
      setShowPhoneTooltip(false);
    }
  };

  // Pin Code validation and cleaning
  const validateAndCleanPinCode = (value: string, plotId?: string) => {
    // Trim spaces and non-digits: pin_code.replace(/\D/g, "").slice(0, 6)
    const cleanedValue = value.replace(/\D/g, "").slice(0, 6);

    if (plotId) {
      // Update specific plot's pin_code
      handlePlotDetailChange(plotId, "pin_code", cleanedValue);
    }
    return cleanedValue;
  };

  // Email validation function
  const validateEmail = (email: string): boolean => {
    if (email.length === 0) {
      setEmailError("");
      return true; // Empty email is allowed (not required field)
    }

    if (!emailPattern.test(email)) {
      if (!email.includes("@")) {
        setEmailError("Email must contain @ symbol");
      } else if (email.indexOf("@") !== email.lastIndexOf("@")) {
        setEmailError("Email can only contain one @ symbol");
      } else if (email.includes(" ")) {
        setEmailError("Email cannot contain spaces");
      } else if (!email.includes(".")) {
        setEmailError("Email must contain a domain extension");
      } else if (email.endsWith(".")) {
        setEmailError("Email cannot end with a dot");
      } else if (email.startsWith("@") || email.endsWith("@")) {
        setEmailError("Email cannot start or end with @ symbol");
      } else {
        setEmailError("Please enter a valid email address");
      }
      return false;
    }

    setEmailError("");
    return true;
  };

  // Handle email input with validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Update form data
    setFormData((prev) => ({
      ...prev,
      email: value,
    }));

    setShowIcons((prev) => ({
      ...prev,
      email: value === "",
    }));

    // Validate in real-time
    if (value.length > 0) {
      validateEmail(value);
      setShowEmailTooltip(true);
    } else {
      setEmailError("");
      setShowEmailTooltip(false);
    }
  };

  const handleSearch = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (!isNaN(latNum) && !isNaN(lngNum)) {
      setCenter([latNum, lngNum]);

      // Get address for the location pin
      const address = await getAddressFromCoords(latNum, lngNum);

      // Set location pin
      setLocationPin({
        position: [latNum, lngNum],
        address: address,
      });
    } else {
      alert("Please enter valid latitude and longitude.");
    }
  };

  const handleLocationLink = async () => {
    let link = locationLink.trim();
    let finalUrl = link;

    if (link.startsWith("https://maps.app.goo.gl/")) {
      // Resolve short link
      try {
        finalUrl = await resolveShortLink(link);
      } catch (e) {
        setLocationLinkError("Could not resolve short link.");
        return;
      }
    }

    const coords = parseLatLngFromLink(finalUrl);
    if (coords) {
      setLat(coords[0].toString());
      setLng(coords[1].toString());
      setCenter([coords[0], coords[1]]);

      // Get address for the location pin
      const address = await getAddressFromCoords(coords[0], coords[1]);

      // Set location pin
      setLocationPin({
        position: [coords[0], coords[1]],
        address: address,
      });

      setLocationLinkError("");
    } else {
      setLocationLinkError(
        "Could not extract coordinates from the link. Please check the link format."
      );
    }
  };

  const handleShareCurrentLocation = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          // Generate a Google Maps share link
          const shareLink = `https://maps.google.com/?q=${latitude},${longitude}`;
          setLocationLink(shareLink);

          // Auto-parse and update the map
          setLat(latitude.toString());
          setLng(longitude.toString());
          setCenter([latitude, longitude]);

          // Get address for the location pin
          const address = await getAddressFromCoords(latitude, longitude);

          // Set location pin
          setLocationPin({
            position: [latitude, longitude],
            address: address,
          });

          setLocationLinkError("");
        },
        () => {
          setLocationLinkError("Unable to get your current location.");
        }
      );
    } else {
      setLocationLinkError("Geolocation is not supported by this browser.");
    }
  };

  const handleAddPlot = () => {
    // Check if there are unsaved plots
    const unsavedPlots = plots.filter(p => !p.isSaved);
    if (unsavedPlots.length > 0) {
      // Show warning but allow adding more plots
      setSubmitStatus("error");
      setSubmitMessage(`⚠️ You have ${unsavedPlots.length} unsaved plot(s). Please save them before adding a new plot, or you can add multiple plots and save them all at once.`);
      // Still allow adding plot - user can save all later
    }
    setIsDrawingMode(true);
    setIsEditingMode(false); // Exit edit mode when starting to draw new plot
    setAreaError(null);
    setSubmitStatus("idle"); // Clear previous messages
  };

  const handleDrawCreated = (e: any) => {
    const layer = e.layer;
    const geoJson = layer.toGeoJSON();

    if (geoJson.geometry.type === "Polygon") {
      const points = geoJson.geometry.coordinates[0].length - 1; // last point repeats first
      if (points < 3) {
        alert("A polygon must have at least 3 points.");
        return;
      }

      // Calculate area using degree-to-meter conversion (aligns with backend logic)
      const areaMetrics = calculateAreaMetricsFromGeometry(geoJson.geometry);

      if (!areaMetrics) {
        setAreaError("Unable to calculate area for this polygon. Please redraw.");
        return;
      }

      setAreaError(null);

      // Create new plot with all plot profile fields
      const newPlot: Plot = {
        id: `plot-${Date.now()}`,
        geometry: geoJson.geometry,
        area: {
          sqm: areaMetrics.sqm,
          ha: areaMetrics.ha,
          acres: areaMetrics.acres,
        },
        layer: layer,
        Group_Gat_No: "",
        Gat_No_Id: "",
        village: "",
        pin_code: "",
        crop_type: "2", // Fixed crop type ID for sugarcane
        crop_variety: "",
        plantation_Type: "",
        plantation_Method: "",
        plantation_Date: "",
        irrigation_Type: "",
        spacing_A: "",
        spacing_B: "",
        flow_Rate: "",
        emitters: "",
        motor_Horsepower: "",
        pipe_Width: "",
        distance_From_Motor: "",
        PlantAge: "",
        grapes_type: "",
        grapes_season: "",
      };

      // Ensure the layer is added to FeatureGroup (it should already be there from EditControl)
      if (featureGroupRef.current && !featureGroupRef.current.hasLayer(layer)) {
        featureGroupRef.current.addLayer(layer);
      }

      // Add plot to the list
      setPlots((prev) => {
        const updated = [...prev, newPlot];

        // Add plot marker after state update
        setTimeout(() => {
      const bounds = layer.getBounds();
      const center = bounds.getCenter();
          const plotNumber = updated.length;

      // Create a marker with plot info
      const plotMarker = L.marker(center, {
        icon: L.divIcon({
          className: "plot-label",
          html: `<div style="background: white; border: 2px solid #059669; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 12px; color: #059669;">Plot ${plotNumber}<br/>${areaMetrics.acres.toFixed(
            2
          )} acres</div>`,
          iconSize: [80, 40],
          iconAnchor: [40, 20],
        }),
      });

      if (featureGroupRef.current) {
        featureGroupRef.current.addLayer(plotMarker);
      }
        }, 0);

        return updated;
      });
      
      setIsDrawingMode(false);
    }
  };

  const handleDrawEdited = (e: any) => {
    try {
      if (!e || !e.layers) {
        console.warn("Invalid edit event:", e);
        return;
      }

      const layers = e.layers;
      let hasUpdates = false;

      layers.eachLayer((layer: L.Layer) => {
        try {
          const geoJson = (layer as any)?.toGeoJSON?.();
          
          if (!geoJson || !geoJson.geometry || geoJson.geometry.type !== "Polygon") {
            return;
          }

          // Find the plot that corresponds to this layer
          const plotIndex = plots.findIndex((plot) => plot.layer === layer);
          
          if (plotIndex === -1) {
            console.warn("Plot not found for edited layer");
            return;
          }

          const points = geoJson.geometry.coordinates[0]?.length - 1;
          if (!points || points < 3) {
            alert("A polygon must have at least 3 points.");
            return;
          }

          // Recalculate area
          const areaMetrics = calculateAreaMetricsFromGeometry(geoJson.geometry);

          if (!areaMetrics) {
            setAreaError("Unable to calculate area for this polygon. Please try again.");
            return;
          }

          setAreaError(null);
          hasUpdates = true;

          // Update the plot with new geometry and area
          setPlots((prev) => {
            const updated = [...prev];
            if (updated[plotIndex]) {
              updated[plotIndex] = {
                ...updated[plotIndex],
                geometry: geoJson.geometry,
                area: {
                  sqm: areaMetrics.sqm,
                  ha: areaMetrics.ha,
                  acres: areaMetrics.acres,
                },
                layer: layer,
              };

              // Update plot marker with new area
              setTimeout(() => {
                if (featureGroupRef.current) {
                  // Remove old markers
                  featureGroupRef.current.eachLayer((l) => {
                    if (l instanceof L.Marker) {
                      featureGroupRef.current?.removeLayer(l);
                    }
                  });

                  // Re-add all plot markers with updated info
                  updated.forEach((plot, idx) => {
                    try {
                      if (plot.layer && (plot.layer as any).getBounds) {
                        const bounds = (plot.layer as any).getBounds();
                        const center = bounds.getCenter();
                        const plotNumber = idx + 1;

                        const plotMarker = L.marker(center, {
                          icon: L.divIcon({
                            className: "plot-label",
                            html: `<div style="background: white; border: 2px solid #059669; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 12px; color: #059669;">Plot ${plotNumber}<br/>${plot.area.acres.toFixed(
                              2
                            )} acres</div>`,
                            iconSize: [80, 40],
                            iconAnchor: [40, 20],
                          }),
                        });

                        if (featureGroupRef.current) {
                          featureGroupRef.current.addLayer(plotMarker);
                        }
                      }
                    } catch (error) {
                      console.error("Error updating plot marker:", error);
                    }
                  });
                }
              }, 0);
            }

            return updated;
          });
        } catch (layerError) {
          console.error("Error processing layer in handleDrawEdited:", layerError);
        }
      });

      // Exit edit mode after successful edit
      if (hasUpdates) {
        setTimeout(() => {
          setIsEditingMode(false);
        }, 100);
      }
    } catch (error) {
      console.error("Error in handleDrawEdited:", error);
      setAreaError("An error occurred while editing the polygon. Please try again.");
      setIsEditingMode(false); // Exit edit mode on error
    }
  };

  // Resolve crop_type_id from crop types API when plantation_Type is selected (fixes backend "get() returned more than one CropType" error)
  const resolveCropTypeId = (plantationType: string): number | undefined => {
    if (!plantationType || !cropTypes.length) return undefined;
    const normalized = plantationType.trim().toLowerCase();
    const match = cropTypes.find(
      (c) =>
        (c.plantation_type || "").trim().toLowerCase() === normalized &&
        (c.crop_type || "").toLowerCase() === "sugarcane"
    );
    return match?.id;
  };

  // Function to update plot details
  const handlePlotDetailChange = (
    plotId: string,
    field: string,
    value: string
  ) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) return plot;
        const next = { ...plot, [field]: value };
        if (field === "plantation_Type") {
          const id = resolveCropTypeId(value);
          if (id != null) next.crop_type_id = id;
        }
        return next;
      })
    );
  };

  const handleSavePlot = (plotId: string) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot) return;

    // Validate required fields
    if (!plot.Group_Gat_No || plot.Group_Gat_No.trim() === "") {
      setSubmitStatus("error");
      setSubmitMessage("❌ GAT Number is required for all plots.");
      return;
    }

    if (!plot.Gat_No_Id || plot.Gat_No_Id.trim() === "") {
      setSubmitStatus("error");
      setSubmitMessage("❌ Plot Number is required for all plots.");
      return;
    }

    // Mark plot as saved
    setPlots((prev) =>
      prev.map((p) => (p.id === plotId ? { ...p, isSaved: true } : p))
    );

    // Show success message for this specific plot
    const plotIndex = plots.findIndex(p => p.id === plotId);
    const savedCount = plots.filter(p => p.isSaved).length + 1;
    setShowPlotSavedMessage(`✅ Plot ${plotIndex + 1} saved successfully! (${savedCount}/${plots.length} plots saved). You can add more plots or submit the farm.`);
    setTimeout(() => {
      setShowPlotSavedMessage(null);
    }, 4000);

    // Clear error status
    setSubmitStatus("idle");
    setSubmitMessage("");
  };

  const handleDeletePlot = (plotId: string) => {
    setPlots((prev) => {
      const plotToDelete = prev.find((p) => p.id === plotId);
      if (plotToDelete && featureGroupRef.current) {
        featureGroupRef.current.removeLayer(plotToDelete.layer);

        // Also remove associated markers
        featureGroupRef.current.eachLayer((layer) => {
          if (layer instanceof L.Marker) {
            featureGroupRef.current?.removeLayer(layer);
          }
        });

        // Re-add remaining plot markers with updated numbers
        const remainingPlots = prev.filter((p) => p.id !== plotId);
        remainingPlots.forEach((plot, index) => {
          const bounds = (plot.layer as any).getBounds();
          const center = bounds.getCenter();
          const plotNumber = index + 1;

          const plotMarker = L.marker(center, {
            icon: L.divIcon({
              className: "plot-label",
              html: `<div style="background: white; border: 2px solid #059669; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 12px; color: #059669;">Plot ${plotNumber}<br/>${plot.area.acres.toFixed(
                2
              )} acres</div>`,
              iconSize: [80, 40],
              iconAnchor: [40, 20],
            }),
          });

          if (featureGroupRef.current) {
            featureGroupRef.current.addLayer(plotMarker);
          }
        });
      }

      return prev.filter((p) => p.id !== plotId);
    });
  };

  //   const handleSubmit = async (e: React.FormEvent) => {
  //     e.preventDefault();

  //     // Validate password confirmation
  //     if (formData.password !== formData.confirm_password) {
  //       setSubmitStatus("error");
  //       setSubmitMessage("Passwords do not match.");
  //       return;
  //     }

  //     // Validate phone number
  //     if (!validatePhoneNumber(formData.phone_number)) {
  //       setSubmitStatus("error");
  //       setSubmitMessage("Please enter a valid 10-digit phone number.");
  //       setShowPhoneTooltip(true);
  //       return;
  //     }

  //     // Validate email (if provided)
  //     if (formData.email && !validateEmail(formData.email)) {
  //       setSubmitStatus("error");
  //       setSubmitMessage("Please enter a valid email address.");
  //       setShowEmailTooltip(true);
  //       return;
  //     }

  //     // Validate required fields
  //     const requiredFields = [
  //       "first_name",
  //       "last_name",
  //       "username",
  //       "password",
  //       "email",
  //       "phone_number",
  //     ];
  //     const missingFields = requiredFields.filter(
  //       (field) => !formData[field as keyof FarmerData]
  //     );

  //     if (missingFields.length > 0) {
  //       setSubmitStatus("error");
  //       setSubmitMessage(
  //         `Please fill in all required fields: ${missingFields.join(", ")}`
  //       );
  //       return;
  //     }

  //     if (plots.length === 0) {
  //       setSubmitStatus("error");
  //       setSubmitMessage("Please add at least one plot to your farm.");
  //       return;
  //     }

  //     // Validate that all plots have GAT and plot numbers
  //     const plotsWithMissingData = plots.filter(plot =>
  //       !plot.Group_Gat_No || !plot.Gat_No_Id ||
  //       plot.Group_Gat_No.trim() === "" || plot.Gat_No_Id.trim() === ""
  //     );

  //     if (plotsWithMissingData.length > 0) {
  //       setSubmitStatus("error");
  //       setSubmitMessage("❌ GAT Number and Plot Number are required for all plots. Please fill in these fields with actual values (e.g., GAT: '123', Plot: '456').");
  //       return;
  //     }

  //     if (areaError) {
  //       setSubmitStatus("error");
  //       setSubmitMessage(areaError);
  //       return;
  //     }

  //     setIsSubmitting(true);
  //     setSubmitStatus("idle");
  //     setSubmitMessage("");

  //     try {
  //       console.log("🚀 Starting farmer registration process");
  //       console.log(
  //         `📊 Registering farmer with ${plots.length} plot${
  //           plots.length !== 1 ? "s" : ""
  //         }`
  //       );

  //       // Debug: Log plot data before submission
  //       console.log("📋 Plot data being submitted:", plots.map(plot => ({
  //         id: plot.id,
  //         Group_Gat_No: plot.Group_Gat_No,
  //         Gat_No_Id: plot.Gat_No_Id,
  //         village: plot.village,
  //         "Group_Gat_No type": typeof plot.Group_Gat_No,
  //         "Gat_No_Id type": typeof plot.Gat_No_Id,
  //         "Group_Gat_No length": plot.Group_Gat_No?.length,
  //         "Gat_No_Id length": plot.Gat_No_Id?.length
  //       })));

  //       // Use all-in-one registration API for all users
  //       const registrationResult = await registerFarmerAllInOneOnly(
  //         formData,
  //         plots
  //       );

  //       console.log(
  //         "✅ Registration completed successfully:",
  //         registrationResult
  //       );

  //       // SUCCESS: Registration completed
  //       const totalArea = getTotalArea();
  //       setSubmitStatus("success");

  //       // Success message for all-in-one API
  //       setSubmitMessage(`🎉 Farmer Registration Completed Successfully!
  // 🎯 Next Steps:
  // The farmer can now login with Emailcredentials to access the dashboard and monitor their crops!`);

  //       // Reset form after successful submission
  //       setFormData({
  //         first_name: "",
  //         last_name: "",
  //         username: "",
  //         password: "",
  //         confirm_password: "",
  //         email: "",
  //         phone_number: "",
  //         address: "",
  //         taluka: "",
  //         state: "",
  //         district: "",
  //         documents: null,
  //       });

  //       // Clear plots and map
  //       setPlots([]);
  //       if (featureGroupRef.current) {
  //         featureGroupRef.current.clearLayers();
  //       }
  //       setLat("");
  //       setLng("");
  //       setLocationPin(null); // Clear location pin
  //       setLocationPin(null); // Clear location pin
  //     } catch (error: any) {
  //       console.error("❌ Unexpected error:", error);
  //       setSubmitStatus("error");
  //       setSubmitMessage(
  //         `An unexpected error occurred: ${
  //           error.message || "Please try again."
  //         }`
  //       );
  //     } finally {
  //       setIsSubmitting(false);
  //     }
  //   };

  // Helper function to render form fields

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const triggerRefreshApis = async (): Promise<void> => {
      const endpoints = [
        "https://cropeye-grapes-admin-production.up.railway.app/refresh_from_django/",
        "https://cropeye-grapes-events-production.up.railway.app/refresh_from_django/",
        "https://cropeye-grapes-main-production.up.railway.app/refresh_from_django/",
        "https://cropeye-grapes-sef-production.up.railway.app/refresh_from_django/",
      ];

      try {
        const results = await Promise.allSettled(
          endpoints.map((url) =>
            fetch(url, {
              method: "POST",
              mode: "cors",
              cache: "no-cache",
              credentials: "omit",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
            }),
          ),
        );

        results.forEach((r, idx) => {
          const url = endpoints[idx];
          if (r.status === "rejected") {
            console.warn(`⚠️ refresh_from_django failed (network)`, { url, error: r.reason });
            return;
          }
          if (!r.value.ok) {
            console.warn(`⚠️ refresh_from_django failed (http)`, { url, status: r.value.status });
          }
        });
      } catch (error) {
        console.warn("⚠️ refresh_from_django unexpected error:", error);
      }
    };

    // ============================================
    // VALIDATION SECTION
    // ============================================

    // Validate password confirmation
    if (formData.password !== formData.confirm_password) {
      setSubmitStatus("error");
      setSubmitMessage("Passwords do not match.");
      return;
    }

    // Validate phone number
    if (!validatePhoneNumber(formData.phone_number)) {
      setSubmitStatus("error");
      setSubmitMessage("Please enter a valid 10-digit phone number.");
      setShowPhoneTooltip(true);
      return;
    }

    // Validate email (if provided)
    if (formData.email && !validateEmail(formData.email)) {
      setSubmitStatus("error");
      setSubmitMessage("Please enter a valid email address.");
      setShowEmailTooltip(true);
      return;
    }

    // Validate required fields
    const requiredFields = [
      "first_name",
      "last_name",
      "username",
      "password",
      "email",
      "phone_number",
    ];
    const missingFields = requiredFields.filter(
      (field) => !formData[field as keyof FarmerData]
    );
    if (missingFields.length > 0) {
      setSubmitStatus("error");
      setSubmitMessage(
        `Please fill in all required fields: ${missingFields.join(", ")}`
      );
      return;
    }

    // Validate plots exist
    if (plots.length === 0) {
      setSubmitStatus("error");
      setSubmitMessage("Please add at least one plot to your farm.");
      return;
    }

    // Validate that all plots have GAT and plot numbers
    const plotsWithMissingData = plots.filter(
      (plot) =>
        !plot.Group_Gat_No ||
        !plot.Gat_No_Id ||
        plot.Group_Gat_No.trim() === "" ||
        plot.Gat_No_Id.trim() === ""
    );

    if (plotsWithMissingData.length > 0) {
      setSubmitStatus("error");
      setSubmitMessage(
        "❌ GAT Number and Plot Number are required for all plots. Please fill in these fields with actual values (e.g., GAT: '123', Plot: '456')."
      );
      return;
    }

    // Validate area
    if (areaError) {
      setSubmitStatus("error");
      setSubmitMessage(areaError);
      return;
    }

    const pruningValidation = validatePruningDates(formData, plots);
    if (pruningValidation.message) {
      setPruningErrors(pruningValidation.fieldErrors);
      setSubmitStatus("error");
      setSubmitMessage(pruningValidation.message);
      return;
    }
    setPruningErrors({});

    // Final clean of pin_codes for all plots before submission
    const cleanedPlots = plots.map(plot => ({
      ...plot,
      pin_code: plot.pin_code.replace(/\D/g, "").slice(0, 6)
    }));

    // ============================================
    // SUBMISSION PROCESS
    // ============================================

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setSubmitMessage("");
    setPruningRegistrationNotice(null);

    try {
      // Use all-in-one registration API for all users
      // This returns an array of responses, one for each plot
      const results = await registerFarmerAllInOneOnly(
        formData,
        cleanedPlots
      );

      // After successful registration, upload files for each plot if they exist
      // Since plot_photo and residue_reported are in formData, they apply to all plots in this batch
      console.log(`🔍 Registration results:`, results);

      for (const response of results) {
        // Aligned with backend: plot_id comes from ids.plots[0].plot_id
        const responseData = response.data || {};
        const plotId =
          responseData.ids?.plots?.[0]?.plot_id ||
          responseData.data?.ids?.plots?.[0]?.plot_id;

        console.log(`🔍 Registration Result Body:`, responseData);
        console.log(`🎯 Extracted plot_id (for file upload):`, plotId);

        if (plotId) {
          try {
            // Validate and upload variety photo (Photo of Plot)
            if (formData.plot_photo) {
              // CRITICAL: Ensure it's a real File object from the input, not an empty object
              const plotPhotoFile = formData.plot_photo;
              if (!plotPhotoFile) {
                console.warn(`⚠️ No variety photo file selected for plot ${plotId}`);
              } else if (!(plotPhotoFile instanceof File)) {
                console.error(`❌ plot_photo is not a File object for plot ${plotId}:`, typeof plotPhotoFile, plotPhotoFile);
              } else if (plotPhotoFile.size === 0) {
                console.warn(`⚠️ Variety photo file is empty (size: 0) for plot ${plotId}`);
              } else {
                console.log(`📤 Uploading variety photo for plot ${plotId}...`, {
                  fileName: plotPhotoFile.name,
                  fileSize: plotPhotoFile.size,
                  fileType: plotPhotoFile.type
                });
                // Upload and get response with file URL and report ID
                const uploadResponse = await uploadGrapesReport(plotId, "variety", plotPhotoFile);
                console.log(`✅ Successfully uploaded variety photo for plot ${plotId}:`, {
                  reportId: uploadResponse.id,
                  fileUrl: uploadResponse.file, // Use this URL for preview
                  uploadedAt: uploadResponse.uploaded_at
                });
                // TODO: Store uploadResponse.file (image URL) and uploadResponse.id (report ID) if needed for preview/tracking
              }
            }
            
            // Validate and upload residue report
            if (formData.residue_reported) {
              // CRITICAL: Ensure it's a real File object from the input, not an empty object
              const residueFile = formData.residue_reported;
              if (!residueFile) {
                console.warn(`⚠️ No residue report file selected for plot ${plotId}`);
              } else if (!(residueFile instanceof File)) {
                console.error(`❌ residue_reported is not a File object for plot ${plotId}:`, typeof residueFile, residueFile);
              } else if (residueFile.size === 0) {
                console.warn(`⚠️ Residue report file is empty (size: 0) for plot ${plotId}`);
              } else {
                console.log(`📤 Uploading residue report for plot ${plotId}...`, {
                  fileName: residueFile.name,
                  fileSize: residueFile.size,
                  fileType: residueFile.type
                });
                // Upload and get response with file URL and report ID
                const uploadResponse = await uploadGrapesReport(plotId, "residue", residueFile);
                console.log(`✅ Successfully uploaded residue report for plot ${plotId}:`, {
                  reportId: uploadResponse.id,
                  fileUrl: uploadResponse.file, // Use this URL for preview
                  uploadedAt: uploadResponse.uploaded_at
                });
                // TODO: Store uploadResponse.file (image URL) and uploadResponse.id (report ID) if needed for preview/tracking
              }
            }
          } catch (fileError: any) {
            console.error(`❌ Error uploading files for plot ${plotId}:`, fileError);
            const errorMessage = fileError?.response?.data?.detail || fileError?.response?.data?.message || fileError?.message || "File upload failed";
            console.error(`Error details:`, errorMessage);
            console.error(`Full error response:`, fileError?.response?.data);
            // We don't fail the whole process if photo upload fails, but log the error
            setSubmitMessage(prev => prev + `\n⚠️ Warning: File upload failed for plot ${plotId}: ${errorMessage}`);
          }
        } else {
          console.warn(`⚠️ No plot_id found in registration response for one of the plots.`, responseData);
        }
      }

      const savedFoundationPruning = formData.foundation_pruning_date;
      const savedFruitPruning = formData.fruit_pruning_date;
      const savedFarmerName = `${formData.first_name} ${formData.last_name}`.trim();

      // SUCCESS: Registration completed
      setSubmitStatus("success");

      const pruningLines =
        savedFoundationPruning && savedFruitPruning
          ? `\n\n📅 Pruning dates saved:\n• Foundation: ${formatPruningDisplayDate(savedFoundationPruning)}\n• Fruit: ${formatPruningDisplayDate(savedFruitPruning)}`
          : "";

      setSubmitMessage(`🎉 Farmer Registration Completed Successfully!${pruningLines}

🎯 Next Steps:
The farmer can now login with Email credentials to access the dashboard and monitor their crops!`);

      if (savedFoundationPruning && savedFruitPruning) {
        setPruningRegistrationNotice({
          foundation: savedFoundationPruning,
          fruit: savedFruitPruning,
          farmerName: savedFarmerName || "Farmer",
        });

        try {
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("Pruning dates registered", {
              body: `Foundation: ${formatPruningDisplayDate(savedFoundationPruning)} | Fruit: ${formatPruningDisplayDate(savedFruitPruning)}`,
              tag: "pruning-dates-registered",
            });
          }
        } catch {
          /* ignore notification failures */
        }
      }

      // Reset form after successful submission
      setFormData({
        first_name: "",
        last_name: "",
        username: "",
        password: "",
        confirm_password: "",
        email: "",
        phone_number: "",
        aadhar_card: "",
        address: "",
        taluka: "",
        crop_type: "Grapes",
        // New Plantation Fields
        plantation_date: "",
        dogridge_rootstock_type: "",
        grafting_date: "",
        grafted_variety: "",
        soil_type: "",
        foundation_pruning_date: "",
        fruit_pruning_date: "",
        // Registration Page Details Fields (3-13 years)
        variety: "",
        irrigation_method: "",
        row_spacing: "",
        plant_spacing: "",
        flow_rate: "",
        dripper_per_plant: "",
        last_harvesting_date: "",
        intercropping: "",
        intercropping_crop_name: "",
        plot_photo: null,
        residue_reported: null,
        soil_report: false,
        state: "",
        district: "",
        documents: null,
      });
      setGraftedVarietySelection("");

      // Clear plots and map
      setPlots([]);
      if (featureGroupRef.current) {
        featureGroupRef.current.clearLayers();
      }
      setLat("");
      setLng("");
      setLocationPin(null); // Clear location pin

      // ============================================
      // DELAYED REFRESH API CALLS (5-10 SECONDS LATER)
      // ============================================
      setTimeout(() => {
        // Fire-and-forget. Do not block UI or affect success state.
        void triggerRefreshApis();
      }, 7000); // 7 seconds delay (you can adjust between 5000-10000ms)

      // Clear success message after 15 seconds
      setTimeout(() => {
        setSubmitMessage("");
        setSubmitStatus("idle");
      }, 15000);
    } catch (error: any) {
      setSubmitStatus("error");

      // Extract detailed error message
      const status = error.response?.status;
      const errorData = error.response?.data;

      let errorMessage = "An unexpected error occurred. Please try again.";

      if (status === 401 || status === 403 || error.requiresAuth) {
        errorMessage = "❌ Authentication Required: Please login as a Field Officer or Admin to register farmers. The registration endpoint requires authentication.";
      } else if (status === 400) {
        // Parse nested error structure from backend
        const detail = errorData?.detail || errorData?.message || errorData?.error || "";

        // Extract username/email conflict errors
        if (typeof detail === 'string') {
          // Check for username already exists
          const usernameMatch = detail.match(/Username\s+['"]([^'"]+)['"]\s+already\s+exists/i);
          if (usernameMatch) {
            errorMessage = `❌ Username "${usernameMatch[1]}" is already taken. Please choose a different username.`;
          }
          // Check for email already exists
          else if (detail.toLowerCase().includes('email') && detail.toLowerCase().includes('already exists')) {
            const emailMatch = detail.match(/email\s+['"]([^'"]+)['"]\s+already\s+exists/i) ||
              detail.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) {
              errorMessage = `❌ Email "${emailMatch[1]}" is already registered. Please use a different email address.`;
            } else {
              errorMessage = `❌ This email is already registered. Please use a different email address.`;
            }
          }
          // Check for phone number already exists
          else if (detail.toLowerCase().includes('phone') && detail.toLowerCase().includes('already exists')) {
            errorMessage = `❌ This phone number is already registered. Please use a different phone number.`;
          }
          // General validation error - handle nested ErrorDetail structure
          else if (detail.includes('Registration failed') || detail.includes('ErrorDetail')) {
            // Helper function to extract message from ErrorDetail
            const extractErrorDetailMessage = (str: string): string | null => {
              // Try multiple patterns to handle different ErrorDetail formats

              // Pattern 1: ErrorDetail(string="message", code='invalid') - with quotes
              let match = str.match(/ErrorDetail\(string=['"]([^'"]+)['"]/i);
              if (match && match[1] && match[1].trim()) return match[1].trim();

              // Pattern 2: ErrorDetail(string=message (without quotes, before comma or closing paren)
              match = str.match(/ErrorDetail\(string=([^,)]+?)(?:\s*,\s*code|\))/i);
              if (match && match[1] && match[1].trim()) {
                const extracted = match[1].trim();
                // If it contains another ErrorDetail, try to extract that
                if (extracted.includes('ErrorDetail')) {
                  const nestedMatch = extracted.match(/ErrorDetail\(string=['"]?([^'"]+)['"]?/i) ||
                    extracted.match(/ErrorDetail\(string=([^,)]+)/i);
                  if (nestedMatch && nestedMatch[1]) return nestedMatch[1].trim();
                }
                return extracted;
              }

              // Pattern 3: ErrorDetail(string=message (capture everything until closing paren or bracket)
              match = str.match(/ErrorDetail\(string=([^)]+?)\)/i);
              if (match && match[1] && match[1].trim()) {
                const extracted = match[1].trim();
                // Remove nested ErrorDetail structures
                if (extracted.includes('ErrorDetail')) {
                  const cleaned = extracted.replace(/ErrorDetail\(string=['"]?([^'"]+)['"]?/gi, '$1');
                  return cleaned.trim();
                }
                return extracted;
              }

              // Pattern 4: Simple extraction - just get what's after string= (most flexible)
              match = str.match(/ErrorDetail\(string=([^,)]+)/i);
              if (match && match[1] && match[1].trim()) {
                const extracted = match[1].trim();
                // Remove any remaining ErrorDetail references
                if (extracted.includes('ErrorDetail')) {
                  return null; // Let fallback handle it
                }
                return extracted;
              }

              // Pattern 5: Handle incomplete ErrorDetail - extract until end of string
              match = str.match(/ErrorDetail\(string=([^)]*?)$/i);
              if (match && match[1] && match[1].trim()) {
                const extracted = match[1].trim();
                if (!extracted.includes('ErrorDetail') && extracted.length > 0) {
                  return extracted;
                }
              }

              return null;
            };

            // Extract the error message
            let innerMessage = extractErrorDetailMessage(detail);

            // If we couldn't extract, try direct matching
            if (!innerMessage || innerMessage.length === 0) {
              // Try to extract username/email from the detail string directly
              const usernameMatch = detail.match(/Username\s+['"]([^'"]+)['"]\s+already\s+exists/i);
              const emailMatch = detail.match(/email\s+['"]([^'"]+)['"]\s+already\s+exists/i);

              if (usernameMatch && usernameMatch[1]) {
                errorMessage = `❌ Username "${usernameMatch[1]}" is already taken. Please choose a different username.`;
              } else if (emailMatch && emailMatch[1]) {
                errorMessage = `❌ Email "${emailMatch[1]}" is already registered. Please use a different email address.`;
              } else {
                // Clean up the error message - remove ErrorDetail structure completely
                let cleaned = detail
                  .replace(/Registration failed:\s*/i, '')
                  // Remove complete ErrorDetail structures
                  .replace(/\[ErrorDetail\([^)]*\)\]/g, '')
                  .replace(/ErrorDetail\(string=[^)]*\)/gi, '')
                  // Extract content from ErrorDetail(string=...)
                  .replace(/ErrorDetail\(string=['"]?([^'"),]+)/gi, '$1')
                  .replace(/ErrorDetail\(string=([^'"),]+)/gi, '$1')
                  // Remove code attributes
                  .replace(/,\s*code=['"]?[^'"]+['"]?/gi, '')
                  .replace(/code=['"]?[^'"]+['"]?/gi, '')
                  // Remove brackets and parentheses
                  .replace(/\[/g, '')
                  .replace(/\]/g, '')
                  .replace(/\(/g, '')
                  .replace(/\)/g, '')
                  // Clean up whitespace
                  .replace(/\s+/g, ' ')
                  .trim();

                // If cleaned message is empty or still contains ErrorDetail, show generic message
                if (!cleaned || cleaned.includes('ErrorDetail') || cleaned.length < 3) {
                  // Try one more aggressive extraction - handle incomplete ErrorDetail(string=
                  const aggressiveMatch = detail.match(/ErrorDetail\(string=([^,)]+)/i);
                  if (aggressiveMatch && aggressiveMatch[1] && aggressiveMatch[1].trim().length > 0) {
                    const extracted = aggressiveMatch[1].trim();
                    // Remove any remaining ErrorDetail references
                    const finalCleaned = extracted.replace(/ErrorDetail/gi, '').trim();
                    if (finalCleaned && finalCleaned.length > 3 && !finalCleaned.includes('ErrorDetail')) {
                      errorMessage = `❌ ${finalCleaned}`;
                    } else {
                      errorMessage = "❌ Registration failed. Please check all fields and try again.";
                    }
                  } else {
                    // If we can't extract anything meaningful, show generic message
                    errorMessage = "❌ Registration failed. Please check all fields and try again.";
                  }
                } else {
                  // Final check - make sure cleaned doesn't contain ErrorDetail
                  const finalCheck = cleaned.replace(/ErrorDetail/gi, '').trim();
                  if (finalCheck && finalCheck.length > 3) {
                    errorMessage = `❌ ${finalCheck}`;
                  } else {
                    errorMessage = "❌ Registration failed. Please check all fields and try again.";
                  }
                }
              }
            } else {
              // We extracted a message, now parse it
              // Clean up the extracted message first
              innerMessage = innerMessage
                .replace(/ErrorDetail\([^)]*\)/gi, '')
                .replace(/\[/g, '')
                .replace(/\]/g, '')
                .trim();

              // Check what type of error it is
              if (innerMessage.toLowerCase().includes('username') && innerMessage.toLowerCase().includes('already exists')) {
                // Extract username from the message
                const usernameMatch = innerMessage.match(/['"]([^'"]+)['"]/) ||
                  innerMessage.match(/Username\s+['"]([^'"]+)['"]/i);
                if (usernameMatch && usernameMatch[1]) {
                  errorMessage = `❌ Username "${usernameMatch[1]}" is already taken. Please choose a different username.`;
                } else {
                  errorMessage = `❌ Username is already taken. Please choose a different username.`;
                }
              } else if (innerMessage.toLowerCase().includes('email') && innerMessage.toLowerCase().includes('already exists')) {
                const emailMatch = innerMessage.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/) ||
                  innerMessage.match(/['"]([^'"]+)['"]/) ||
                  innerMessage.match(/email\s+['"]([^'"]+)['"]/i);
                if (emailMatch && emailMatch[1]) {
                  errorMessage = `❌ Email "${emailMatch[1]}" is already registered. Please use a different email address.`;
                } else {
                  errorMessage = `❌ This email is already registered. Please use a different email address.`;
                }
              } else if (innerMessage.toLowerCase().includes('phone') && innerMessage.toLowerCase().includes('already exists')) {
                errorMessage = `❌ This phone number is already registered. Please use a different phone number.`;
              } else {
                // Use the cleaned inner message, but ensure it's meaningful
                const finalCleaned = innerMessage.replace(/ErrorDetail/gi, '').trim();
                if (finalCleaned && finalCleaned.length > 3 && !finalCleaned.includes('ErrorDetail')) {
                  errorMessage = `❌ ${finalCleaned}`;
                } else {
                  errorMessage = "❌ Registration failed. Please check all fields and try again.";
                }
              }
            }
          } else if (detail) {
            // Handle detail that might contain ErrorDetail but wasn't caught by the main handler
            if (detail.includes('ErrorDetail') || detail.includes('Registration failed')) {
              // Try to clean it up one more time
              let cleanedDetail = detail
                .replace(/Registration failed:\s*/i, '')
                .replace(/\[ErrorDetail\([^)]*\)\]/g, '')
                .replace(/ErrorDetail\(string=[^)]*\)/gi, '')
                .replace(/ErrorDetail\(string=/gi, '')
                .replace(/ErrorDetail/gi, '')
                .replace(/\[/g, '')
                .replace(/\]/g, '')
                .replace(/\(/g, '')
                .replace(/\)/g, '')
                .trim();

              if (cleanedDetail && cleanedDetail.length > 3 && !cleanedDetail.includes('ErrorDetail')) {
                errorMessage = `❌ ${cleanedDetail}`;
              } else {
                errorMessage = "❌ Registration failed. Please check all fields and try again.";
              }
            } else {
              errorMessage = `❌ ${detail}`;
            }
          } else {
            errorMessage = "❌ Validation Error: Please check all required fields are filled correctly.";
          }
        } else {
          errorMessage = "❌ Validation Error: Please check all required fields are filled correctly.";
        }
      } else if (status === 500) {
        errorMessage = "❌ Server Error: The server encountered an issue. Please try again later.";
      } else if (error.message) {
        errorMessage = `❌ ${error.message}`;
      } else if (errorData?.detail) {
        errorMessage = `❌ ${errorData.detail}`;
      } else if (errorData?.message) {
        errorMessage = `❌ ${errorData.message}`;
      }

      setSubmitMessage(errorMessage);

      // Log the error for debugging (only non-authentication errors)
      // Authentication errors are expected and already handled with user-friendly messages
      if (status !== 401 && status !== 403 && !error.requiresAuth) {
        console.error("Submission error:", {
          status,
          data: errorData,
          message: error.message,
          fullError: error
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to render file upload fields with view/delete support
  const renderFileUploadField = (
    key: keyof FarmerData,
    label: string
  ) => {
    const file = formData[key] as File | null;

    return (
      <div className="relative mb-4">
        <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
          {label}
        </label>
        <div className="relative">
          {!file ? (
            <div className="relative">
              <input
                type="file"
                onChange={(e) => handleSingleFileChange(e, key)}
                className="hidden"
                id={`file-upload-${key}`}
                accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              />
              <label
                htmlFor={`file-upload-${key}`}
                className="flex items-center justify-center w-full px-4 py-2 border border-gray-300 border-dashed rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                <Plus className="mr-2 h-5 w-5 text-gray-400" />
                Upload {label}
              </label>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handlePreviewFile(key)}
                className="flex-1 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <FileText className="mr-2 h-5 w-5" />
                View Uploaded File
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFormField = (key: string, value: string) => {
    const getFieldIcon = (fieldName: string) => {
      if (fieldName.includes("email")) return <Mail size={20} />;
      if (fieldName.includes("phone")) return <Phone size={20} />;
      if (fieldName.includes("address")) return <Home size={20} />;
      if (fieldName.includes("village")) return <Building size={20} />;
      if (fieldName.includes("pin")) return <Map size={20} />;
      if (fieldName.includes("gat")) return <FileText size={20} />;
      if (fieldName.includes("area")) return <Ruler size={20} />;
      if (fieldName.includes("irrigation")) return <Droplets size={20} />;
      if (fieldName.includes("PlantAge")) return <FileText size={20} />;
      // New icons for New Plantation fields
      if (fieldName.includes("date") || fieldName.includes("Date")) return <Calendar size={20} />;
      if (fieldName.includes("soil") || fieldName.includes("rootstock") || fieldName.includes("variety") || fieldName.includes("intercropping")) return <FileText size={20} />;
      if (fieldName.includes("irrigation_method")) return <Droplets size={20} />;
      return <User size={20} />;
    };

    const getFieldOptions = (fieldName: string) => {
      switch (fieldName) {
        case "state":
          return states;
        case "district":
          return filteredDistricts;
        case "taluka":
          return filteredTalukas;
        case "PlantAge":
          return ["0 to 3 years", "3 to 13 years"];
        case "crop_type":
          return ["Grapes", "Sugarcane"];
        case "dogridge_rootstock_type":
          return ["dogridge", "banglore", "polson", "polso"];
        case "grafted_variety":
          return [
            "thompson",
            "tas_a_ganesh",
            "sonaka",
            "manik_chaman",
            "flame_seedless",
            "crimson_seedless",
            "red_globe",
            "sudhakar_seedless",
            "allison",
            "timco",
            "ard_35",
            "ard_36",
            "thompson_seedless",
            "super_sonaka",
            "crimson",
            "ssn",
            "sharad_seedless",
            "mama_jambo",
            "rk",
            "arra_35",
            "arra_36",
            "variety_1530",
            "variety_1557",
            "clone",
            "timson",
            "raigad_purple",
            "anushka",
            "nanasaheb_purple",
            "other",
          ];
        case "soil_type":
          return ["clay", "loam", "sandy_loam", "sandy"];
        case "variety":
          return [
            "thompson",
            "tas_a_ganesh",
            "sonaka",
            "manik_chaman",
            "flame_seedless",
            "crimson_seedless",
            "red_globe",
            "sudhakar_seedless",
            "allison",
            "timco",
            "ard_35",
            "ard_36",
            "thompson_seedless",
            "super_sonaka",
            "crimson",
            "ssn",
            "sharad_seedless",
            "mama_jambo",
            "rk",
            "arra_35",
            "arra_36",
            "variety_1530",
            "variety_1557",
            "clone",
            "timson",
            "raigad_purple",
            "anushka",
            "nanasaheb_purple",
            "other",

          ];
        case "intercropping":
          return ["yes", "no"];
        case "irrigation_method":
          return ["Drip"];
        case "plantation_Type":
          // Use plantation_type from crop types API
          // Filter out null/undefined values
          return cropTypes.length > 0
            ? [...new Set(cropTypes.map((crop) => crop.plantation_type).filter((val): val is string => val != null && val !== ""))]
            : plantationTypes;
        case "plantation_Method":
          // Use planting_method from crop types API
          // Filter out null/undefined values
          return cropTypes.length > 0
            ? [...new Set(cropTypes.map((crop) => crop.planting_method).filter((val): val is string => val != null && val !== ""))]
            : plantationMethods;
        case "irrigation_Type":
          return ["drip", "flood"];
        default:
          return null;
      }
    };

    const options = getFieldOptions(key);
    const isSelectField = options !== null;

    return (
      <React.Fragment key={key}>
        <div className="relative mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {getPruningFieldLabel(key)}{" "}
            <span className="text-red-500">*</span>
          </label>
          <div>
            <div className="relative">
              {isSelectField ? (
                <select
                  name={key}
                  value={
                    key === "grafted_variety"
                      ? graftedVarietySelection
                      : key === "variety"
                        ? varietySelection
                        : value
                  }
                  onChange={(e) => {
                    if (key === "grafted_variety") {
                      const selected = e.target.value;
                      setGraftedVarietySelection(selected);
                      if (selected !== "other") {
                        setFormData((prev) => ({ ...prev, grafted_variety: selected }));
                        setShowIcons((prev) => ({ ...prev, grafted_variety: selected === "" }));
                      } else {
                        setFormData((prev) => ({ ...prev, grafted_variety: "" }));
                        setShowIcons((prev) => ({ ...prev, grafted_variety: true }));
                      }
                      return;
                    }
                    if (key === "variety") {
                      const selected = e.target.value;
                      setVarietySelection(selected);
                      if (selected !== "other") {
                        setFormData((prev) => ({ ...prev, variety: selected }));
                        setShowIcons((prev) => ({ ...prev, variety: selected === "" }));
                      } else {
                        setFormData((prev) => ({ ...prev, variety: "" }));
                        setShowIcons((prev) => ({ ...prev, variety: true }));
                      }
                      return;
                    }
                    handleInputChange(e);
                  }}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                >
                  <option value="">Select {key.replace("_", " ")}</option>
                  {options.filter(opt => opt != null && opt !== "").map((option) => (
                    <option key={option} value={option}>
                      {key === "grafted_variety" || key === "variety"
                        ? varietyLabel(String(option))
                        : option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    key === "email"
                      ? "email"
                      : key.includes("date") || key.includes("Date")
                        ? "date"
                        : key === "password" || key === "confirm_password"
                          ? "password"
                          : key === "phone_number"
                            ? "tel"
                            : "text"
                  }
                  name={key}
                  placeholder={`Enter ${key.replace("_", " ")}`}
                  value={value}
                  onChange={
                    key === "phone_number"
                      ? handlePhoneChange
                      : key === "email"
                        ? handleEmailChange
                        : handleInputChange
                  }
                  onClick={
                    (key.includes("date") || key.includes("Date"))
                      ? (e) => {
                          const input = e.target as HTMLInputElement;
                          // Only open calendar on click, not on focus
                          if (input && typeof input.showPicker === 'function') {
                            input.showPicker();
                          }
                        }
                      : undefined
                  }
                  onFocus={
                    key === "phone_number"
                      ? () => setShowPhoneTooltip(true)
                      : key === "email"
                        ? () => setShowEmailTooltip(true)
                        : undefined
                  }
                  onBlur={
                    key === "phone_number"
                      ? () => setTimeout(() => setShowPhoneTooltip(false), 300)
                      : key === "email"
                        ? () => setTimeout(() => setShowEmailTooltip(false), 300)
                        : undefined
                  }
                  maxLength={key === "phone_number" ? 10 : undefined}
                  required={isPruningDateField(key)}
                  className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm transition-colors ${
                    (key === "phone_number" && phoneError) ||
                    (key === "email" && emailError) ||
                    (isPruningDateField(key) &&
                      pruningErrors[key as keyof PruningFieldErrors])
                      ? "border-red-500 bg-red-50"
                      : (key === "phone_number" &&
                          value.length === 10 &&
                          !phoneError) ||
                        (key === "email" &&
                          value.length > 0 &&
                          !emailError &&
                          emailPattern.test(value)) ||
                        (isPruningDateField(key) && value)
                        ? "border-green-500 bg-green-50"
                        : "border-gray-300"
                  }`}
                />
              )}
              {showIcons[key] && (
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  {getFieldIcon(key)}
                </span>
              )}
            </div>
            {isPruningDateField(key) && (
              <>
                <p className="mt-1 text-xs text-amber-700 font-medium">
                  Required
                </p>
                {pruningErrors[key as keyof PruningFieldErrors] && (
                  <p className="mt-1 text-xs text-red-600">
                    {pruningErrors[key as keyof PruningFieldErrors]}
                  </p>
                )}
              </>
            )}

            {key === "grafted_variety" && graftedVarietySelection === "other" && (
              <div className="mt-3 relative">
                <input
                  type="text"
                  name="grafted_variety"
                  placeholder="Enter grafted variety"
                  value={formData.grafted_variety || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({ ...prev, grafted_variety: v }));
                    setShowIcons((prev) => ({ ...prev, grafted_variety: v === "" }));
                  }}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
                {showIcons.grafted_variety && (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    {getFieldIcon("grafted_variety")}
                  </span>
                )}
              </div>
            )}

            {key === "variety" && varietySelection === "other" && (
              <div className="mt-3 relative">
                <input
                  type="text"
                  name="variety"
                  placeholder="Enter variety"
                  value={formData.variety || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({ ...prev, variety: v }));
                    setShowIcons((prev) => ({ ...prev, variety: v === "" }));
                  }}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
                {showIcons.variety && (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    {getFieldIcon("variety")}
                  </span>
                )}
              </div>
            )}

            {/* Phone number validation indicators */}
            {key === "phone_number" && (
              <>
                {/* Success indicator */}
                {value.length === 10 && !phoneError && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 text-lg">
                    ✓
                  </div>
                )}

                {/* Error indicator */}
                {phoneError && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500 text-lg">
                    ✗
                  </div>
                )}

                {/* Phone Validation Tooltip */}
                {showPhoneTooltip && (
                  <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-lg shadow-lg z-20 min-w-[280px]">
                    <div className="flex items-start">
                      <div
                        className={`w-3 h-3 rounded-full mr-3 mt-1 ${phoneError
                          ? "bg-red-500"
                          : value.length === 10
                            ? "bg-green-500"
                            : "bg-yellow-500"
                          }`}
                      ></div>
                      <div className="flex-1">
                        <div className="font-medium text-sm mb-2">
                          {phoneError
                            ? phoneError
                            : value.length === 10
                              ? "Valid phone number!"
                              : "Phone Number Validation"}
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.length === 10
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            Must be exactly 10 digits ({value.length}/10)
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${/^\d+$/.test(value)
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            Only numbers allowed (no spaces, letters, or symbols)
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.length > 0 ? "bg-green-500" : "bg-gray-300"
                                }`}
                            ></span>
                            Current input: "{value || "Empty"}"
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inline validation message */}
                {value.length > 0 && (
                  <div
                    className={`mt-2 text-sm ${phoneError
                      ? "text-red-600"
                      : value.length === 10
                        ? "text-green-600"
                        : "text-yellow-600"
                      }`}
                  >
                    {phoneError ? (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        {phoneError}
                      </span>
                    ) : value.length === 10 ? (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                        Phone number is valid!
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                        Enter {10 - value.length} more digits
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Email validation indicators */}
            {key === "email" && (
              <>
                {/* Success indicator */}
                {value.length > 0 && !emailError && emailPattern.test(value) && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 text-lg">
                    ✓
                  </div>
                )}

                {/* Error indicator */}
                {emailError && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500 text-lg">
                    ✗
                  </div>
                )}

                {/* Email Validation Tooltip */}
                {showEmailTooltip && (
                  <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-lg shadow-lg z-20 min-w-[300px]">
                    <div className="flex items-start">
                      <div
                        className={`w-3 h-3 rounded-full mr-3 mt-1 ${emailError
                          ? "bg-red-500"
                          : value.length > 0 &&
                            !emailError &&
                            emailPattern.test(value)
                            ? "bg-green-500"
                            : "bg-yellow-500"
                          }`}
                      ></div>
                      <div className="flex-1">
                        <div className="font-medium text-sm mb-2">
                          {emailError
                            ? emailError
                            : value.length > 0 &&
                              !emailError &&
                              emailPattern.test(value)
                              ? "Valid email address!"
                              : "Email Validation"}
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.includes("@")
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            Must contain @ symbol
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.includes(".")
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            Must contain domain extension (.com, .org, etc.)
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${!value.includes(" ")
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            No spaces allowed
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.indexOf("@") === value.lastIndexOf("@")
                                ? "bg-green-500"
                                : "bg-gray-300"
                                }`}
                            ></span>
                            Only one @ symbol allowed
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`w-2 h-2 rounded-full mr-2 ${value.length > 0 ? "bg-green-500" : "bg-gray-300"
                                }`}
                            ></span>
                            Current input: "{value || "Empty"}"
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inline validation message */}
                {value.length > 0 && (
                  <div
                    className={`mt-2 text-sm ${emailError
                      ? "text-red-600"
                      : !emailError && emailPattern.test(value)
                        ? "text-green-600"
                        : "text-yellow-600"
                      }`}
                  >
                    {emailError ? (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        {emailError}
                      </span>
                    ) : !emailError && emailPattern.test(value) ? (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                        Email address is valid!
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                        Enter a valid email address
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {key === "irrigation_method" && value === "Drip" && (
          <>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
                Spacing <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="row_spacing"
                    placeholder="row spacing"
                    value={formData.row_spacing}
                    onChange={handleInputChange}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm text-center"
                  />
                </div>
                <span className="text-gray-500 font-bold text-lg">*</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="plant_spacing"
                    placeholder="plant spacing"
                    value={formData.plant_spacing}
                    onChange={handleInputChange}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm text-center"
                  />
                </div>
              </div>
            </div>
            {/* Flow Rate */}
            <div className="relative mb-4 mt-4">
              <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
                Flow rate liter/hour <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="flow_rate"
                  placeholder="Enter Flow rate liter/hour"
                  value={formData.flow_rate}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
                {showIcons["flow_rate"] && (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <Droplets size={16} />
                  </span>
                )}
              </div>
            </div>

            {/* Dripper per plant */}
            <div className="relative mb-4">
              <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
                Dripper per plant <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="dripper_per_plant"
                  placeholder="Enter Dripper per plant"
                  value={formData.dripper_per_plant}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                />
                {showIcons["dripper_per_plant"] && (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <Droplets size={16} />
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {key === "intercropping" && value === "yes" && (
          <div className="relative mb-4 mt-4">
            <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
              Intercrop Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="intercropping_crop_name"
                placeholder="Enter Crop Name"
                value={formData.intercropping_crop_name || ""}
                onChange={handleInputChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
              />
              {showIcons["intercropping_crop_name"] && (
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <FileText size={16} />
                </span>
              )}
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  // Helper function to render spacing field with A * B format
  const renderSpacingField = (
    plotId: string,
    spacingA: string,
    spacingB: string
  ) => {
    const handleSpacingChange = (field: "A" | "B", value: string) => {
      if (field === "A") {
        handlePlotDetailChange(plotId, "spacing_A", value);
      } else {
        handlePlotDetailChange(plotId, "spacing_B", value);
      }
    };

    return (
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
          Spacing (A * B) <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center space-x-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="4"
              value={spacingA}
              onChange={(e) => handleSpacingChange("A", e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm text-center"
            />
          </div>
          <div className="flex items-center justify-center w-8 h-8">
            <span className="text-gray-500 font-bold text-lg">*</span>
          </div>
          <div className="flex-1">
            <input
              type="text"
              placeholder="5"
              value={spacingB}
              onChange={(e) => handleSpacingChange("B", e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm text-center"
            />
          </div>
        </div>
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400">
          <Ruler size={16} />
        </div>
      </div>
    );
  };

  // Helper function to render plot profile fields
  const renderPlotField = (plotId: string, key: string, value: string) => {
    const getFieldIcon = (fieldName: string) => {
      if (fieldName.includes("village")) return <Building size={16} />;
      if (fieldName.includes("pin")) return <Map size={16} />;
      if (fieldName.includes("gat")) return <FileText size={16} />;
      if (fieldName.includes("irrigation")) return <Droplets size={16} />;
      if (
        fieldName.includes("area") ||
        fieldName.includes("spacing") ||
        fieldName.includes("motor") ||
        fieldName.includes("pipe") ||
        fieldName.includes("distance")
      )
        return <Ruler size={16} />;
      if (fieldName.includes("crop_type")) return <Droplets size={16} />;
      return <User size={16} />;
    };

    const getFieldOptions = (fieldName: string) => {
      switch (fieldName) {
        case "plantation_Type":
          // Use plantation_type from crop types API
          // Filter out null/undefined values
          return cropTypes.length > 0
            ? [...new Set(cropTypes.map((crop) => crop.plantation_type).filter((val): val is string => val != null && val !== ""))]
            : plantationTypes;
        case "plantation_Method":
          // Use planting_method from crop types API
          // Filter out null/undefined values
          return cropTypes.length > 0
            ? [...new Set(cropTypes.map((crop) => crop.planting_method).filter((val): val is string => val != null && val !== ""))]
            : plantationMethods;
        case "irrigation_Type":
          return ["drip", "flood"];
        case "PlantAge":
          return ["0 to 3 years", "3 to 13 years"];
        case "grapes_type":
          return ["Wine", "Table Grapes"];
        case "grapes_season":
          return ["Late Season", "Early Season"];
        default:
          return null;
      }
    };

    const options = getFieldOptions(key);
    const isSelectField = options !== null && Array.isArray(options);

    return (
      <div key={key} className="relative">
        <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
          {key.replace("_", " ").replace("number", "Number")}{" "}
          <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          {isSelectField ? (
            <select
              value={value}
              onChange={(e) =>
                handlePlotDetailChange(plotId, key, e.target.value)
              }
              className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            >
              <option value="">Select {key.replace("_", " ")}</option>
              {options.filter(opt => opt != null && opt !== "" && typeof opt === 'string').map((option, index) => (
                <option key={`${option}-${index}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={key.includes("date") || key.includes("Date") ? "date" : "text"}
              placeholder={`Enter ${key.replace("_", " ")}`}
              value={value}
              onChange={(e) => {
                if (key === "pin_code") {
                  validateAndCleanPinCode(e.target.value, plotId);
                } else {
                  handlePlotDetailChange(plotId, key, e.target.value);
                }
              }}
              onClick={
                (key.includes("date") || key.includes("Date"))
                  ? (e) => {
                      const input = e.target as HTMLInputElement;
                      // Only open calendar on click, allowing manual typing via keyboard
                      if (input && typeof input.showPicker === 'function') {
                        input.showPicker();
                      }
                    }
                  : undefined
              }
              className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          )}
          <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400">
            {getFieldIcon(key)}
          </span>
        </div>
        {(key === "Group_Gat_No" || key === "Gat_No_Id") && (
          <p className="mt-1 text-xs text-yellow-600 font-medium">
            ⚠️ REQUIRED: Enter GAT/Plot number (e.g., "123", "456")
          </p>
        )}
      </div>
    );
  };

  const totalArea = getTotalArea();

  // Define the fields for each section - village moved from userProfileFields to plot fields
  const userProfileFields = [
    "first_name",
    "last_name",
    "username",
    "password",
    "confirm_password",
    "email",
    "phone_number",
    "aadhar_card",
    "address",
    "state",
    "district",
    "taluka",
  ];

  const newPlantationFields = [
    "plantation_date",
    "dogridge_rootstock_type",
    "grafting_date",
    "grafted_variety",
    "soil_type",
    "foundation_pruning_date",
    "fruit_pruning_date",
  ];

  const registrationPageFields = [
    "variety",
    "irrigation_method",
    "soil_type",
    "plantation_date",
    "foundation_pruning_date",
    "fruit_pruning_date",
    "last_harvesting_date",
    "intercropping",
  ];

  const handleSoilInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      soil_details: {
        ...prev.soil_details!,
        [name]: value,
      },
    }));
  };

  const renderSoilField = (label: string, name: keyof SoilDetails) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
        {label}
      </label>
      <input
        type="text"
        name={name}
        placeholder={`Enter ${label}`}
        value={formData.soil_details?.[name] || ""}
        onChange={handleSoilInputChange}
        className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
      />
    </div>
  );

  return (
    <div 
      className="min-h-screen py-4 sm:py-8 px-2 sm:px-4 lg:px-8 dashboard-bg-bleed"
    >
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg sm:rounded-xl shadow-lg overflow-hidden">
          <div className="text-center bg-green-600 text-white py-4 sm:py-6 px-4 sm:px-8">
            <User className="mx-auto h-10 w-10 sm:h-14 sm:w-14 mb-2 sm:mb-3" />
            <h1 className="text-xl sm:text-3xl font-bold">
              Farmer Registration
            </h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-green-100">
              Please fill in your details below
            </p>
          </div>

          {/* Status Messages */}
          {showPlotSavedMessage && (
            <div className="m-2 sm:m-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm sm:text-base text-green-800">
                ✅ {showPlotSavedMessage}
              </p>
            </div>
          )}

          {submitStatus === "success" && (
            <div className="m-2 sm:m-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm sm:text-base text-green-800 whitespace-pre-line">
                {submitMessage}
              </p>
            </div>
          )}

          {pruningRegistrationNotice && (
            <div className="m-2 sm:m-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    Pruning dates registered for {pruningRegistrationNotice.farmerName}
                  </p>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Foundation:</span>{" "}
                    {formatPruningDisplayDate(pruningRegistrationNotice.foundation)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Fruit:</span>{" "}
                    {formatPruningDisplayDate(pruningRegistrationNotice.fruit)}
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    These dates will appear in the Fertilizer Schedule after the farmer logs in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPruningRegistrationNotice(null)}
                  className="text-blue-500 hover:text-blue-700 text-lg leading-none shrink-0"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {submitStatus === "error" && (
            <div className="m-2 sm:m-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm sm:text-base text-red-800">
                {submitMessage}
              </p>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-2 sm:p-8 space-y-4 sm:space-y-8"
          >
            {/* Section 1: User Profile */}
            <div className="bg-gray-50 p-3 sm:p-6 rounded-lg">
              <div className="flex items-center mb-4 sm:mb-6">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mr-2" />
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  User Profile
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
                {userProfileFields.map((field) =>
                  renderFormField(
                    field,
                    formData[field as keyof FarmerData] as string
                  )
                )}
              </div>
            </div>

            {/* Map Location and Plots Section */}
            <div className="bg-gray-50 p-3 sm:p-6 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div className="flex items-center">
                  <Map className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 mr-2" />
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                    Farm Location & Plots
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddPlot}
                  disabled={isDrawingMode}
                  className={`inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md ${isDrawingMode
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                >
                  <Plus size={14} className="mr-1 sm:mr-2" />
                  Add Plot {plots.length > 0 && `(${plots.length} ${plots.length === 1 ? 'plot' : 'plots'})`}
                </button>
              </div>

              {/* Location Pin Display */}
              {locationPin && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center text-blue-800">
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    <span className="font-semibold text-sm sm:text-base">
                      Location Pin:
                    </span>
                  </div>
                  <p className="text-blue-700 mt-1 text-sm sm:text-base">
                    📍 {locationPin.address}
                  </p>
                  <p className="text-blue-600 text-xs sm:text-sm">
                    Coordinates: {locationPin.position[0].toFixed(6)},{" "}
                    {locationPin.position[1].toFixed(6)}
                  </p>
                </div>
              )}

              {/* Plot Summary with Individual Plot Details */}
              {plots.length > 0 && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-green-900 text-sm sm:text-base">
                      Plot Details ({plots.filter(p => p.isSaved).length}/{plots.length} saved):
                    </h4>
                    {plots.some(p => !p.isSaved) && (
                      <span className="text-xs sm:text-sm text-orange-600 font-medium">
                        ⚠️ {plots.filter(p => !p.isSaved).length} plot(s) need to be saved
                      </span>
                    )}
                  </div>
                  <div className="space-y-4 sm:space-y-6">
                    {plots.map((plot, index) => (
                      <div
                        key={plot.id}
                        className={`bg-white p-3 sm:p-6 rounded border-2 ${plot.isSaved
                          ? 'border-green-500 bg-green-50'
                          : 'border-orange-400 bg-orange-50'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="font-bold text-base sm:text-lg text-green-800">
                                Plot {index + 1}
                              </span>
                              <div className="text-xs sm:text-sm text-gray-600">
                                {plot.area.acres.toFixed(2)} acres
                              </div>
                            </div>
                            {plot.isSaved ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✓ Saved
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                🔄 Not Saved
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!plot.isSaved && (
                              <button
                                type="button"
                                onClick={() => handleSavePlot(plot.id)}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs sm:text-sm font-medium"
                              >
                                💾 Save Plot
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeletePlot(plot.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                            >
                              <Trash2 size={14} className="sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Basic Plot Information */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                          {renderPlotField(
                            plot.id,
                            "Group_Gat_No",
                            plot.Group_Gat_No
                          )}
                          {renderPlotField(
                            plot.id,
                            "Gat_No_Id",
                            plot.Gat_No_Id
                          )}
                          {renderPlotField(plot.id, "village", plot.village)}
                          {renderPlotField(plot.id, "pin_code", plot.pin_code)}
                          {renderPlotField(plot.id, "grapes_type", plot.grapes_type)}
                          {plot.grapes_type === "Table Grapes" && (
                            renderPlotField(plot.id, "grapes_season", plot.grapes_season)
                          )}
                          {renderPlotField(plot.id, "PlantAge", plot.PlantAge)}
                          {formData.crop_type !== "Grapes" && (
                            <>
                              {renderPlotField(
                                plot.id,
                                "crop_type",
                                plot.crop_type
                              )}
                              {renderPlotField(
                                plot.id,
                                "crop_variety",
                                plot.crop_variety
                              )}
                              {renderPlotField(
                                plot.id,
                                "plantation_Type",
                                plot.plantation_Type
                              )}
                              {renderPlotField(
                                plot.id,
                                "plantation_Method",
                                plot.plantation_Method
                              )}
                              {renderPlotField(
                                plot.id,
                                "plantation_Date",
                                plot.plantation_Date
                              )}
                              {renderPlotField(
                                plot.id,
                                "irrigation_Type",
                                plot.irrigation_Type
                              )}
                              {/* Spacing A and B fields - moved outside drip section */}
                              {renderSpacingField(
                                plot.id,
                                plot.spacing_A,
                                plot.spacing_B
                              )}
                            </>
                          )}
                        </div>

                        {/* Irrigation Details for Individual Plot */}
                        {plot.irrigation_Type && (
                          <div className="border-t pt-3 sm:pt-4">
                            <div className="flex items-center mb-3 sm:mb-4">
                              <Droplets className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 mr-2" />
                              <h4 className="text-base sm:text-lg font-semibold text-gray-900">
                                {plot.irrigation_Type === "drip"
                                  ? "Drip Irrigation Details"
                                  : "Flood Irrigation Details"}
                              </h4>
                            </div>
                            {plot.irrigation_Type === "drip" ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                {renderPlotField(
                                  plot.id,
                                  "flow_Rate",
                                  plot.flow_Rate
                                )}
                                {renderPlotField(
                                  plot.id,
                                  "emitters",
                                  plot.emitters
                                )}
                              </div>
                            ) : plot.irrigation_Type === "flood" ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                {renderPlotField(
                                  plot.id,
                                  "motor_Horsepower",
                                  plot.motor_Horsepower
                                )}
                                {renderPlotField(
                                  plot.id,
                                  "pipe_Width",
                                  plot.pipe_Width
                                )}
                                {renderPlotField(
                                  plot.id,
                                  "distance_From_Motor",
                                  plot.distance_From_Motor
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* New Plantation fields - shown when PlantAge is 0-3 years */}
                        {formData.crop_type === "Grapes" && plot.PlantAge === "0 to 3 years" && (
                          <div className="border-t pt-3 sm:pt-4 mt-3">
                            <div className="flex items-center mb-3 sm:mb-4">
                              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mr-2" />
                              <h4 className="text-base sm:text-lg font-semibold text-gray-900">New Plantation</h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              {newPlantationFields.map((field) =>
                                renderFormField(
                                  field,
                                  formData[field as keyof FarmerData] as string
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Registration page details - shown when PlantAge is 3-13 years */}
                        {formData.crop_type === "Grapes" && plot.PlantAge === "3 to 13 years" && (
                          <div className="border-t pt-3 sm:pt-4 mt-3">
                            <div className="flex items-center mb-3 sm:mb-4">
                              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mr-2" />
                              <h4 className="text-base sm:text-lg font-semibold text-gray-900">Registration page details</h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              {registrationPageFields.map((field) =>
                                renderFormField(
                                  field,
                                  formData[field as keyof FarmerData] as string
                                )
                              )}
                              <div className="flex items-center justify-between col-span-1 sm:col-span-2 mt-4 bg-white p-4 rounded-md border border-gray-200">
                                <div className="flex items-center">
                                  <FileText className="h-5 w-5 text-gray-500 mr-2" />
                                  <label className="text-sm font-medium text-gray-700">Soil Report</label>
                                  {formData.soil_report && (
                                    <button
                                      type="button"
                                      onClick={() => setShowSoilModal(true)}
                                      className="ml-4 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                    >
                                      View / Edit Form
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newValue = !formData.soil_report;
                                    setFormData((prev) => ({ ...prev, soil_report: newValue }));
                                    if (newValue) setShowSoilModal(true);
                                  }}
                                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${formData.soil_report ? "bg-green-600" : "bg-gray-200"}`}
                                  role="switch"
                                  aria-checked={formData.soil_report}
                                >
                                  <span className="sr-only">Use setting</span>
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.soil_report ? "translate-x-5" : "translate-x-0"}`}
                                  />
                                </button>
                              </div>
                              {/* Photo and Residue fields - always shown at end of Registration page details */}
                              <div className="col-span-1 sm:col-span-2 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 mt-2">
                                {renderFileUploadField("plot_photo", "Photo of plot (for variety identification)")}
                                {renderFileUploadField("residue_reported", "Residue reported")}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-green-300">
                    <div className="text-lg font-bold text-green-900">
                      Total Area: {totalArea.acres.toFixed(2)} acres
                    </div>
                    <div className="text-sm text-green-700">
                      {plots.length} plot{plots.length !== 1 ? "s" : ""} •{" "}
                      {totalArea.sqm.toFixed(0)} sq meters
                    </div>
                  </div>
                </div>
              )}

              {isDrawingMode && (
                <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded">
                  <span className="text-xs sm:text-sm text-blue-700">
                    <b>Drawing Mode Active:</b> Use the polygon tool (pentagon
                    icon) to draw plot #{plots.length + 1}. Click each corner of
                    your plot, then click the first point to finish.
                  </span>
                </div>
              )}

              {/* Location Link Input */}
              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
                  <input
                    type="text"
                    placeholder="Paste Google Maps or share location link"
                    value={locationLink}
                    onChange={(e) => setLocationLink(e.target.value)}
                    className="border px-3 py-2 rounded w-full text-sm sm:text-base"
                  />
                  <div className="flex gap-2 sm:gap-4">
                    <button
                      type="button"
                      onClick={handleLocationLink}
                      className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded hover:bg-indigo-700 whitespace-nowrap text-xs sm:text-sm flex-1 sm:flex-none"
                    >
                      Use Link
                    </button>
                    <button
                      type="button"
                      onClick={handleShareCurrentLocation}
                      className="bg-green-600 text-white px-3 sm:px-4 py-2 rounded hover:bg-green-700 whitespace-nowrap text-xs sm:text-sm flex-1 sm:flex-none"
                    >
                      Share My Location
                    </button>
                  </div>
                </div>
                {locationLinkError && (
                  <div className="text-red-600 text-sm">
                    {locationLinkError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
                  <div className="flex gap-2 sm:gap-4 flex-1">
                    <input
                      type="text"
                      placeholder="Latitude"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="border px-3 py-2 rounded w-full text-sm sm:text-base"
                    />
                    <input
                      type="text"
                      placeholder="Longitude"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="border px-3 py-2 rounded w-full text-sm sm:text-base"
                    />
                  </div>
                  <div className="flex gap-2 sm:gap-4">
                    <button
                      type="button"
                      onClick={handleSearch}
                      className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded hover:bg-blue-700 whitespace-nowrap text-xs sm:text-sm flex-1 sm:flex-none"
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            async (position) => {
                              const { latitude, longitude } = position.coords;
                              setLat(latitude.toString());
                              setLng(longitude.toString());
                              setCenter([latitude, longitude]);

                              // Get address for the location pin
                              const address = await getAddressFromCoords(
                                latitude,
                                longitude
                              );

                              // Set location pin
                              setLocationPin({
                                position: [latitude, longitude],
                                address: address,
                              });
                            },
                            () => {
                              alert(
                                "Unable to get your location. Please enter coordinates manually."
                              );
                            }
                          );
                        } else {
                          alert(
                            "Geolocation is not supported by this browser."
                          );
                        }
                      }}
                      className="bg-green-600 text-white px-3 sm:px-4 py-2 rounded hover:bg-green-700 whitespace-nowrap text-xs sm:text-sm flex-1 sm:flex-none"
                    >
                      Use My Location
                    </button>
                  </div>
                </div>
              </div>

              {/* Map Container */}
              <div className="border border-gray-300 rounded-lg overflow-hidden mt-4 relative">
                {/* Edit Button - Top Right (positioned below Leaflet controls) */}
                {plots.length > 0 && !isDrawingMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // Prevent rapid clicking
                      if (isEditModeReady && !isEditingMode) {
                        return; // Still initializing
                      }

                      try {
                        if (!isEditingMode) {
                          // Entering edit mode - validate first
                          if (!featureGroupRef.current) {
                            console.error("FeatureGroup ref is not available");
                            setAreaError("Map is not ready. Please wait a moment and try again.");
                            return;
                          }
                          if (plots.length === 0) {
                            console.error("No plots to edit");
                            return;
                          }
                          // Validate all plots have layers
                          const plotsWithLayers = plots.filter(p => p.layer);
                          if (plotsWithLayers.length === 0) {
                            console.error("No plots with valid layers");
                            setAreaError("Plots are not ready for editing. Please try again.");
                            return;
                          }
                          
                          // Set editing mode first, then let useEffect handle initialization
                          setIsEditingMode(true);
                          setIsDrawingMode(false);
                          setAreaError(null);
                        } else {
                          // Exiting edit mode
                          setIsEditingMode(false);
                          setIsEditModeReady(false);
                          setAreaError(null);
                        }
                      } catch (error: any) {
                        console.error("Error toggling edit mode:", error);
                        setAreaError("Error entering edit mode. Please try again.");
                        setIsEditingMode(false);
                        setIsEditModeReady(false);
                      }
                    }}
                    disabled={isEditModeReady && !isEditingMode}
                    className={`absolute top-20 right-2 z-[1000] flex items-center gap-2 px-3 py-2 rounded-md shadow-lg transition-all ${
                      isEditingMode
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    } ${isEditModeReady && !isEditingMode ? "opacity-50 cursor-not-allowed" : ""}`}
                    style={{ zIndex: 1000 }}
                  >
                    {isEditingMode ? (
                      <>
                        <X size={16} />
                        <span className="text-sm font-medium">Cancel Edit</span>
                      </>
                    ) : (
                      <>
                        <Edit size={16} />
                        <span className="text-sm font-medium">Edit Polygon</span>
                      </>
                    )}
                  </button>
                )}

                {isEditingMode && (
                  <div className="absolute top-2 left-2 z-[1000] bg-blue-50 border border-blue-200 rounded p-2 shadow-lg max-w-xs sm:max-w-md">
                    <span className="text-xs sm:text-sm text-blue-700 font-medium">
                      <b>Edit Mode Active:</b>
                      <ul className="mt-1 ml-4 list-disc text-xs">
                        <li>Drag corners to move vertices</li>
                        <li>Hover over corners to delete them</li>
                        <li>Drag edges to create new vertices</li>
                        <li>Click "Finish" when done editing</li>
                      </ul>
                    </span>
                    {!isEditModeReady && (
                      <div className="mt-2 text-xs text-orange-600">
                        Initializing edit mode...
                      </div>
                    )}
                  </div>
                )}

                <MapContainer
                  center={center}
                  zoom={16}
                  style={{ height: "500px", width: "100%", zIndex: showSoilModal ? 0 : 1 }}
                  className="sm:h-[800px] mobile-draw-controls"
                  ref={mapRef}
                >
                  <TileLayer
                    url="http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                    attribution="© Google"
                    maxZoom={25}
                    maxNativeZoom={21}
                    minZoom={1}
                    tileSize={256}
                    zoomOffset={0}
                  />
                  <RecenterMap latlng={center} />
                  <MapReady onMapReady={(map) => {
                    mapRef.current = map;
                    setIsMapReady(true);
                  }} />

                  {/* Location Pin Marker */}
                  {locationPin && (
                    <Marker position={locationPin.position}>
                      <Popup>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <MapPin className="h-5 w-5 text-red-500 mr-1" />
                            <span className="font-semibold">
                              Search Location
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {locationPin.address}
                          </p>
                          <p className="text-xs text-gray-500">
                            {locationPin.position[0].toFixed(6)},{" "}
                            {locationPin.position[1].toFixed(6)}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  <FeatureGroup ref={featureGroupRef}>
                    {isDrawingMode && (
                      <EditControl
                        key="draw-mode-control"
                        position="topright"
                        onCreated={handleDrawCreated}
                        draw={{
                          polygon: true,
                          rectangle: false,
                          polyline: false,
                          circle: false,
                          marker: false,
                          circlemarker: false,
                        }}
                        edit={{
                          edit: false,
                          remove: true,
                        }}
                      />
                    )}
                    {isEditingMode && !isDrawingMode && plots.length > 0 && isEditModeReady && isMapReady && featureGroupRef.current && (
                      <EditControl
                        key={`edit-mode-${plots.length}`}
                        position="topright"
                        onEdited={(e: any) => {
                          try {
                            handleDrawEdited(e);
                          } catch (error: any) {
                            console.error("Error in onEdited:", error);
                            setAreaError("Error editing polygon. Please try again.");
                            setIsEditingMode(false);
                            setIsEditModeReady(false);
                          }
                        }}
                        onDeleted={(e: any) => {
                          try {
                            if (!e?.layers) return;
                            const layersToRemove: L.Layer[] = [];
                            e.layers.eachLayer((layer: L.Layer) => {
                              layersToRemove.push(layer);
                            });

                            setPlots((prev) => {
                              const updated = prev.filter((plot) => !layersToRemove.includes(plot.layer));
                              
                              setTimeout(() => {
                                if (featureGroupRef.current) {
                                  featureGroupRef.current.eachLayer((l) => {
                                    if (l instanceof L.Marker) {
                                      featureGroupRef.current?.removeLayer(l);
                                    }
                                  });

                                  updated.forEach((plot, idx) => {
                                    try {
                                      if (plot.layer && (plot.layer as any).getBounds) {
                                        const bounds = (plot.layer as any).getBounds();
                                        const center = bounds.getCenter();
                                        const plotMarker = L.marker(center, {
                                          icon: L.divIcon({
                                            className: "plot-label",
                                            html: `<div style="background: white; border: 2px solid #059669; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 12px; color: #059669;">Plot ${idx + 1}<br/>${plot.area.acres.toFixed(2)} acres</div>`,
                                            iconSize: [80, 40],
                                            iconAnchor: [40, 20],
                                          }),
                                        });
                                        featureGroupRef.current?.addLayer(plotMarker);
                                      }
                                    } catch (err) {
                                      console.error("Error re-adding marker:", err);
                                    }
                                  });
                                }
                              }, 0);

                              return updated;
                            });
                          } catch (error: any) {
                            console.error("Error in onDeleted:", error);
                            setAreaError("Error deleting polygon.");
                          }
                        }}
                        draw={{
                          polygon: false,
                          rectangle: false,
                          polyline: false,
                          circle: false,
                          marker: false,
                          circlemarker: false,
                        }}
                        edit={{
                          featureGroup: featureGroupRef.current,
                          edit: {
                            selectedPathOptions: {
                              color: '#3388ff',
                              weight: 4,
                              opacity: 0.5,
                              fillOpacity: 0.2,
                            },
                          },
                          remove: true,
                        }}
                      />
                    )}
                  </FeatureGroup>
                </MapContainer>
              </div>

              {areaError && (
                <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-red-600 font-semibold">
                  {areaError}
                </div>
              )}
            </div>


            {/* Submit Section */}
            <div className="pt-4 sm:pt-6 border-t border-gray-200">
              <div className="mb-4 sm:mb-6">
                {plots.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold text-sm sm:text-base text-blue-800">
                          Plot Status:
                        </span>
                      </div>
                      <div className="text-sm sm:text-base">
                        <span className="text-green-700 font-bold">
                          {plots.filter((p) => p.isSaved).length} saved
                        </span>
                        {" / "}
                        <span className="text-gray-700 font-bold">
                          {plots.length} total
                        </span>
                      </div>
                    </div>
                    {plots.some((p) => !p.isSaved) && (
                      <p className="mt-2 text-xs sm:text-sm text-orange-700">
                        ⚠️ Please save all plots before submitting
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center sm:justify-between items-center">
                <button
                  type="submit"
                  disabled={isSubmitting || plots.length === 0 || plots.some((p) => !p.isSaved)}
                  className={`px-6 sm:px-8 py-2 sm:py-3 rounded-lg text-white font-semibold text-sm sm:text-base ${isSubmitting || plots.length === 0 || plots.some((p) => !p.isSaved)
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                    }`}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : plots.some((p) => !p.isSaved)
                      ? "Save All Plots First"
                      : `✅ Submit Farm (${plots.length} plot${plots.length !== 1 ? "s" : ""
                      })`}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 capitalize">
                {previewFile.fieldName.replace(/_/g, " ")} Preview
              </h3>
              <button
                onClick={closePreview}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-100">
              {previewFile.fileType.startsWith("image/") ? (
                <img
                  src={previewFile.fileUrl}
                  alt="Preview"
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="text-center p-8">
                  <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-900 font-medium mb-2">{previewFile.file.name}</p>
                  <p className="text-gray-500 mb-4">
                    Preview not available for this file type.
                  </p>
                  <a
                    href={previewFile.fileUrl}
                    download={previewFile.file.name}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  handleDeleteFile(previewFile.fieldName as keyof FarmerData);
                  closePreview();
                }}
                className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete File
              </button>
              <button
                type="button"
                onClick={closePreview}
                className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soil Report Modal */}
      {showSoilModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-xl">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-green-50">
              <div className="flex items-center">
                <FileText className="h-6 w-6 text-green-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Soil Report Details
                </h3>
              </div>
              <button
                onClick={() => setShowSoilModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {renderSoilField("Nitrogen", "nitrogen")}
                {renderSoilField("Phosphorus", "phosphorus")}
                {renderSoilField("Potassium", "potassium")}
                {renderSoilField("Soil pH", "soil_ph")}
                {renderSoilField("CEC", "cec")}
                {renderSoilField("Organic Carbon", "organic_carbon")}
                {renderSoilField("Bulk Density", "bulk_density")}
                {renderSoilField("Fe", "fe")}
                {renderSoilField("Soil Organic Carbon", "soil_organic_carbon")}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSoilModal(false)}
                className="inline-flex justify-center px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Submit Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddFarm;
