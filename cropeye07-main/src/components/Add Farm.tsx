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
} from "lucide-react";
import { EditControl } from "react-leaflet-draw";
import "leaflet/dist/leaflet.css"; // It's good practice to import CSS at the top level of your component file.
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import {
  getCropTypes,
  registerFarmerAllInOneOnly,
  refreshApiEndpoints,
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
  // Track if plot has been saved
  isSaved?: boolean;
}

type SugarcaneType = "old" | "new";

interface FarmerData {
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  confirm_password: string;
  email: string;
  phone_number: string;
  address: string;
  taluka: string;
  state: string;
  district: string;
  sugarcane_type: SugarcaneType;
  last_year_yield: string;
  documents: FileList | null;
  aadhar_card: string;
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

// Canonical display labels (one per type, no repeated pre-seasonal — only pre_seasonal)
const PLANTATION_TYPE_DISPLAY: Record<string, string> = {
  adsali: "Adsali",
  suru: "Suru",
  ratoon: "Ratoon",
  "pre-seasonal": "pre_seasonal",
  pre_seasonal: "pre_seasonal",
  preseasonal: "pre_seasonal",
};
const PLANTATION_TYPE_ORDER = ["Adsali", "Suru", "pre_seasonal", "Ratoon"];

// Only underscore (API) format for method - no "1 bud" / "1_bud" duplicates
const PLANTATION_METHOD_OPTIONS = ["3_bud", "2_bud", "1_bud", "1_bud_stip"];

/** Human-readable labels for plot detail keys (must match Plot interface field names). */
const PLOT_FIELD_LABELS: Record<string, string> = {
  flow_Rate: "Flow Rate (Liters/Hour)",
  emitters: "Emitters Per Plant",
  motor_Horsepower: "Motor Horsepower (HP)",
  pipe_Width: "Pipe Width (Inches)",
  distance_From_Motor: "Distance From Motor (M)",
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

/** Recenters only when `latlng` changes — avoids resetting the view on every parent re-render (e.g. after finishing a draw). */
function RecenterMap({ latlng }: { latlng: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(latlng, 17);
  }, [latlng[0], latlng[1], map]);
  return null;
}

// Component to handle map editing setup - enables editing programmatically
function MapEditHandler({
  featureGroup,
  editingPlotId,
  plots,
  onEditStop
}: {
  featureGroup: React.RefObject<L.FeatureGroup>;
  editingPlotId: string | null;
  plots: Plot[];
  onEditStop: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!editingPlotId || !featureGroup.current) return;

    // Find the plot being edited
    const plot = plots.find(p => p.id === editingPlotId);
    if (!plot || !featureGroup.current.hasLayer(plot.layer)) return;

    // Wait a bit for the EditControl to be ready, then click the edit button
    const enableEditing = () => {
      // Try to click the edit button programmatically
      const editButton = document.querySelector('.leaflet-draw-edit-edit') as HTMLElement;
      if (editButton && !editButton.classList.contains('leaflet-disabled')) {
        editButton.click();
      }
    };

    // Delay to ensure EditControl is ready
    const timeoutId = setTimeout(enableEditing, 300);

    // Listen for edit stop events
    const handleEditStop = () => {
      onEditStop();
    };

    map.on('draw:editstop', handleEditStop);

    return () => {
      clearTimeout(timeoutId);
      map.off('draw:editstop', handleEditStop);
    };
  }, [map, featureGroup, editingPlotId, plots, onEditStop]);

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
    address: "",
    taluka: "",
    state: "",
    district: "",
    sugarcane_type: "old",
    last_year_yield: "",
    documents: null,
    aadhar_card: "",
  });

  const [showIcons, setShowIcons] = useState<IconVisibility>({
    first_name: true,
    last_name: true,
    username: true,
    password: true,
    confirm_password: true,
    email: true,
    phone_number: true,
    address: true,
    taluka: true,
    state: true,
    district: true,
  });

  // Multiple plots state
  const [plots, setPlots] = useState<Plot[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
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

  // Phone number validation pattern
  const phonePattern = /^[0-9]{10}$/;

  // Email validation pattern
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Normalize plantation type to canonical key for deduplication (Adsali/adsali -> one option)
  const toPlantationTypeKey = (s: string) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/-+/g, "-");
  const getPlantationTypeOptions = (): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    const add = (raw: string) => {
      const key = toPlantationTypeKey(raw);
      const display = PLANTATION_TYPE_DISPLAY[key] || raw.trim() || null;
      if (display && !seen.has(key)) {
        seen.add(key);
        result.push(display);
      }
    };
    PLANTATION_TYPE_ORDER.forEach(add);
    if (cropTypes.length > 0) {
      cropTypes.forEach((c) => {
        const v = c.plantation_type;
        if (v != null && String(v).trim() && !String(v).trim().toLowerCase().startsWith("select")) add(v);
      });
    }
    const ordered = PLANTATION_TYPE_ORDER.filter((l) => result.includes(l));
    const rest = [...new Set(result)].filter((l) => !PLANTATION_TYPE_ORDER.includes(l)).sort();
    return [...ordered, ...rest];
  };
  // Only underscore (API) options - no "1 bud" / "1_bud" duplicates
  const getPlantationMethodOptions = (): string[] => {
    const fromApi =
      cropTypes.length > 0
        ? cropTypes
            .map((c) => c.planting_method)
            .filter(
              (v): v is string =>
                v != null &&
                String(v).trim() !== "" &&
                !String(v).trim().toLowerCase().startsWith("select") &&
                String(v).includes("_")
            )
        : [];
    const combined = [...new Set([...PLANTATION_METHOD_OPTIONS, ...fromApi.map((s) => String(s).trim())])];
    return combined.filter((s) => s.length > 0 && s !== "other").sort((a, b) => a.localeCompare(b));
  };

  const mapRef = useRef(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);

  // Load location data from JSON file
  useEffect(() => {
    const loadLocationData = async () => {
      try {
        const response = await fetch("/location-data-part1.json");
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
        const data = response?.data;
        // Support multiple response shapes: { results: [] }, { data: [] }, or direct array
        let list: any[] = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.results)) {
          list = data.results;
        } else if (data && Array.isArray(data.data)) {
          list = data.data;
        }
        // Normalize items: ensure plantation_type and planting_method (API may use different keys)
        const normalized = list.map((item: any) => ({
          id: item.id ?? item.pk,
          crop_type: item.crop_type ?? item.crop_type_name ?? item.name ?? "Sugarcane",
          plantation_type: (item.plantation_type ?? item.plantation_type_display ?? "").toString().trim(),
          planting_method: (item.planting_method ?? item.planting_method_display ?? "").toString().trim(),
        })).filter((item: any) => item.plantation_type !== "" || item.planting_method !== "");
        setCropTypes(normalized.length > 0 ? normalized : [{
          id: 2,
          crop_type: "Sugarcane",
          plantation_type: "Adsali",
          planting_method: "3 bud"
        }]);
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          setCropTypes([{
            id: 2,
            crop_type: "Sugarcane",
            plantation_type: "Adsali",
            planting_method: "3 bud"
          }]);
        } else {
          console.warn("⚠️ Failed to fetch crop types:", error.message);
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

  // Ensure all plot layers are in the FeatureGroup for editing
  useEffect(() => {
    if (featureGroupRef.current) {
      plots.forEach((plot) => {
        if (plot.layer && !featureGroupRef.current?.hasLayer(plot.layer)) {
          featureGroupRef.current.addLayer(plot.layer);
        }
      });
    }
  }, [plots]);

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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "state" && { district: "", taluka: "" }),
      ...(name === "district" && { taluka: "" }),
    }));

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
      };

      // Add plot to the list
      setPlots((prev) => [...prev, newPlot]);
      setIsDrawingMode(false);

      // Ensure layer is in feature group for potential editing
      if (featureGroupRef.current && !featureGroupRef.current.hasLayer(layer)) {
        featureGroupRef.current.addLayer(layer);
      }

      // Fit map to the drawn polygon. (Do not call setCenter here — that would retrigger
      // RecenterMap and override fitBounds with a fixed zoom Level.)
      const bounds = layer.getBounds();
      const center = bounds.getCenter();
      const mapInstance = (layer as L.Layer & { _map?: L.Map })._map;
      if (mapInstance) {
        mapInstance.fitBounds(bounds, { padding: [28, 28], maxZoom: 19 });
      }

      // Add a label to the plot
      const plotNumber = plots.length + 1;

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
    }
  };

  // Handle polygon edit events
  const handleDrawEdited = (e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: L.Layer) => {
      const geoJson = (layer as any).toGeoJSON();

      if (geoJson.geometry.type === "Polygon") {
        const points = geoJson.geometry.coordinates[0].length - 1;
        if (points < 3) {
          alert("A polygon must have at least 3 points.");
          return;
        }

        // Calculate updated area
        const areaMetrics = calculateAreaMetricsFromGeometry(geoJson.geometry);

        if (!areaMetrics) {
          setAreaError("Unable to calculate area for this polygon.");
          return;
        }

        setAreaError(null);

        // Find and update the plot
        setPlots((prev) =>
          prev.map((plot) => {
            if (plot.layer === layer) {
              // Update plot geometry and area
              const updatedPlot = {
                ...plot,
                geometry: geoJson.geometry,
                area: {
                  sqm: areaMetrics.sqm,
                  ha: areaMetrics.ha,
                  acres: areaMetrics.acres,
                },
                layer: layer,
              };

              // Update marker label
              if (featureGroupRef.current) {
                // Remove old markers
                featureGroupRef.current.eachLayer((l) => {
                  if (l instanceof L.Marker) {
                    featureGroupRef.current?.removeLayer(l);
                  }
                });

                // Re-add markers for all plots with updated numbers
                prev.forEach((p, index) => {
                  const plotToUse = p.id === plot.id ? updatedPlot : p;
                  const bounds = (plotToUse.layer as any).getBounds();
                  const center = bounds.getCenter();
                  const plotNumber = index + 1;

                  const plotMarker = L.marker(center, {
                    icon: L.divIcon({
                      className: "plot-label",
                      html: `<div style="background: white; border: 2px solid #059669; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-size: 12px; color: #059669;">Plot ${plotNumber}<br/>${plotToUse.area.acres.toFixed(
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

              return updatedPlot;
            }
            return plot;
          })
        );
      }
    });
  };

  // Handle when editing is cancelled or finished
  const handleDrawEditStop = () => {
    if (editingPlotId) {
      const plot = plots.find((p) => p.id === editingPlotId);
      if (plot) {
        const layer = plot.layer as any;
        if (layer && layer.editing) {
          layer.editing.disable();
        }
      }
    }
    setEditingPlotId(null);
  };

  // Handle fine-tune button click
  const handleFineTunePlot = (plotId: string) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot || !featureGroupRef.current) return;

    // Set editing mode
    setEditingPlotId(plotId);
    setIsDrawingMode(false);

    // Ensure the layer is in the feature group for editing
    if (!featureGroupRef.current.hasLayer(plot.layer)) {
      featureGroupRef.current.addLayer(plot.layer);
    }

    // Programmatically click the edit button in the toolbar after a short delay
    // This ensures the EditControl is ready
    setTimeout(() => {
      const editButton = document.querySelector('.leaflet-draw-edit-edit') as HTMLElement;
      if (editButton && !editButton.classList.contains('leaflet-disabled')) {
        editButton.click();
      } else {
        // If button not found, try alternative selector
        const altButton = document.querySelector('a[title*="Edit" i], a[title*="edit" i]') as HTMLElement;
        if (altButton) {
          altButton.click();
        }
      }
    }, 300);
  };

  // Cancel fine-tune mode
  const handleCancelFineTune = () => {
    if (editingPlotId) {
      const plot = plots.find((p) => p.id === editingPlotId);
      if (plot) {
        const layer = plot.layer as any;
        if (layer && layer.editing) {
          layer.editing.disable();
        }
      }
    }
    setEditingPlotId(null);
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
    // Cancel editing if deleting the plot being edited
    if (editingPlotId === plotId) {
      setEditingPlotId(null);
    }

    setPlots((prev) => {
      const plotToDelete = prev.find((p) => p.id === plotId);
      if (plotToDelete && featureGroupRef.current) {
        // Remove the polygon layer
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

  // Handle file input changes
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      documents: e.target.files,
    }));
  };

  const handleAadharNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // Allow only digits, max 12 characters
    const value = e.target.value.replace(/\D/g, "").slice(0, 12);
    setFormData((prev) => ({ ...prev, aadhar_card: value }));
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
    const requiredFields: (keyof FarmerData)[] = [
      "first_name",
      "last_name",
      "username",
      "password",
      "email",
      "phone_number",
    ];
    if (formData.sugarcane_type === "old") {
      requiredFields.push("last_year_yield");
    }
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

    // ============================================
    // SUBMISSION PROCESS
    // ============================================

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setSubmitMessage("");

    try {
      // Use all-in-one registration API for all users
      await registerFarmerAllInOneOnly(
        formData,
        plots
      );

      // SUCCESS: Registration completed
      setSubmitStatus("success");

      // Success message for all-in-one API
      setSubmitMessage(`🎉 Farmer Registration Completed Successfully!
🎯 Next Steps:
The farmer can now login with Email credentials to access the dashboard and monitor their crops!`);

      // Reset form after successful submission
      setFormData({
        first_name: "",
        last_name: "",
        username: "",
        password: "",
        confirm_password: "",
        email: "",
        phone_number: "",
        address: "",
        taluka: "",
        state: "",
        district: "",
        sugarcane_type: "old",
        last_year_yield: "",
        documents: null,
        aadhar_card: "",
      });

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
        refreshApiEndpoints();
      }, 15000);// 15 seconds delay

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

      // Handle authentication and authorization errors with specific messages
      if (status === 401 || error.requiresAuth) {
        // 401: Not authenticated (no token or invalid token)
        errorMessage = errorData?.detail ||
                      errorData?.message ||
                      error.message ||
                      "❌ Authentication Required: Please login to register farmers. The registration endpoint requires authentication.";
      } else if (status === 403) {
        // 403: Authenticated but not authorized (wrong role)
        errorMessage = errorData?.detail ||
                      errorData?.message ||
                      error.message ||
                      "❌ Access Denied: Only Field Officers, Managers, and Admins can register farmers. Please login with an authorized account.";
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
        case "plantation_Type":
          return getPlantationTypeOptions();
        case "plantation_Method":
          return getPlantationMethodOptions();
        case "irrigation_Type":
          return ["drip", "flood"];
        default:
          return null;
      }
    };

    const options = getFieldOptions(key);
    const isSelectField = options !== null && Array.isArray(options);

    return (
      <div key={key} className="relative">
        <label className="block text-sm font-medium text-gray-700 capitalize mb-1">
          {key === "last_year_yield"
            ? "Last Year Yield (tons)"
            : key.replace("_", " ").replace("number", "Number")}{" "}
          {(key !== "last_year_yield" || formData.sugarcane_type === "old") && (
            <span className="text-red-500">*</span>
          )}
        </label>
        <div className="relative">
          {isSelectField ? (
            <select
              name={key}
              value={value}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            >
              <option value="">Select {key.replace("_", " ")}</option>
              {options.filter((opt) => opt != null && opt !== "" && typeof opt === "string").map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                key === "email"
                  ? "email"
                  : key === "last_year_yield"
                    ? "number"
                  : key === "plantation_Date"
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
              className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm transition-colors ${
                (key === "phone_number" && phoneError) ||
                (key === "email" && emailError)
                  ? "border-red-500 bg-red-50"
                  : (key === "phone_number" &&
                      value.length === 10 &&
                      !phoneError) ||
                    (key === "email" &&
                      value.length > 0 &&
                      !emailError &&
                      emailPattern.test(value))
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
                      className={`w-3 h-3 rounded-full mr-3 mt-1 ${
                        phoneError
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
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.length === 10
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          Must be exactly 10 digits ({value.length}/10)
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              /^\d+$/.test(value)
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          Only numbers allowed (no spaces, letters, or symbols)
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.length > 0 ? "bg-green-500" : "bg-gray-300"
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
                  className={`mt-2 text-sm ${
                    phoneError
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
                      className={`w-3 h-3 rounded-full mr-3 mt-1 ${
                        emailError
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
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.includes("@")
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          Must contain @ symbol
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.includes(".")
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          Must contain domain extension (.com, .org, etc.)
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              !value.includes(" ")
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          No spaces allowed
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.indexOf("@") === value.lastIndexOf("@")
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          Only one @ symbol allowed
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`w-2 h-2 rounded-full mr-2 ${
                              value.length > 0 ? "bg-green-500" : "bg-gray-300"
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
                  className={`mt-2 text-sm ${
                    emailError
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
        fieldName.includes("distance") ||
        fieldName.includes("flow_Rate") ||
        fieldName === "emitters"
      )
        return <Ruler size={16} />;
      return <User size={16} />;
    };

    const getFieldOptions = (fieldName: string) => {
      switch (fieldName) {
        case "plantation_Type":
          return getPlantationTypeOptions();
        case "plantation_Method":
          return getPlantationMethodOptions();
        case "irrigation_Type":
          return ["drip", "flood"];
        default:
          return null;
      }
    };

    const options = getFieldOptions(key);
    const isSelectField = options !== null && Array.isArray(options);
    const isCropTypeField = key === "crop_type";
    const labelText =
      PLOT_FIELD_LABELS[key] ||
      key.replace(/_/g, " ").replace("number", "Number");

    return (
      <div key={key} className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <span className={PLOT_FIELD_LABELS[key] ? "" : "capitalize"}>
            {labelText}
          </span>{" "}
          <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          {isCropTypeField ? (
            <div className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 sm:text-sm">
              Sugarcane
            </div>
          ) : isSelectField ? (
            <select
              value={value}
              onChange={(e) =>
                handlePlotDetailChange(plotId, key, e.target.value)
              }
              className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            >
              <option value="">Select {labelText}</option>
              {options.filter((opt) => opt != null && opt !== "" && typeof opt === "string").map((option, index) => (
                <option key={`${option}-${index}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={key === "plantation_Date" ? "date" : "text"}
              placeholder={`Enter ${labelText.toLowerCase()}`}
              value={value}
              onChange={(e) =>
                handlePlotDetailChange(plotId, key, e.target.value)
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
    "address",
    "state",
    "district",
    "taluka",
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-2 sm:py-8 px-2 sm:px-4 lg:px-8">
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
              <p className="text-sm sm:text-base text-green-800">
                {submitMessage}
              </p>
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
                {/* Aadhaar Number Input */}
              <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
                <div className="mt-4 sm:mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Aadhar Number
                  </label>
                  <input
                    type="text"
                    name="aadhar_card"
                    value={formData.aadhar_card}
                    onChange={handleAadharNumberChange}
                    placeholder="Enter 12-digit Aadhar number"
                    maxLength={12}
                    inputMode="numeric"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  {formData.aadhar_card && formData.aadhar_card.length < 12 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Aadhar number must be 12 digits ({formData.aadhar_card.length}/12)
                    </p>
                  )}
                </div>
                {/* File Upload */}
                <div className="mt-4 sm:mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Documents
                  </label>
                  <input
                    type="file"
                    multiple
                    name="documents"
                    accept=".pdf,image/*,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileChange}
                    className="block w-full text-xs sm:text-sm text-gray-500 file:mr-2 sm:file:mr-4 file:py-1 sm:file:py-2 file:px-2 sm:file:px-4 file:rounded file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                </div>
              </div>

              <div className="mt-4 sm:mt-6 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 sm:items-start">
                <div
                  className={
                    formData.sugarcane_type === "new" ? "sm:col-span-2" : ""
                  }
                >
                  <span className="block text-sm font-medium text-gray-700 mb-2">
                    Sugarcane type <span className="text-red-500">*</span>
                  </span>
                  <div className="flex flex-wrap gap-6">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800">
                      <input
                        type="radio"
                        name="sugarcane_type"
                        checked={formData.sugarcane_type === "old"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            sugarcane_type: "old",
                          }))
                        }
                        className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                      />
                      Old
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800">
                      <input
                        type="radio"
                        name="sugarcane_type"
                        checked={formData.sugarcane_type === "new"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            sugarcane_type: "new",
                            last_year_yield: "",
                          }))
                        }
                        className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                      />
                      New
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Select &quot;New&quot; if there is no previous season yield to report.
                  </p>
                </div>
                <div className="min-w-0">
                  {formData.sugarcane_type === "old" &&
                    renderFormField(
                      "last_year_yield",
                      formData.last_year_yield
                    )}
                </div>
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
                  className={`inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md ${
                    isDrawingMode
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
                        className={`bg-white p-3 sm:p-6 rounded border-2 ${
                          editingPlotId === plot.id
                            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300'
                            : plot.isSaved
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
                            {editingPlotId === plot.id ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                ✏️ Editing
                              </span>
                            ) : plot.isSaved ? (
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
                            {editingPlotId === plot.id ? (
                              <button
                                type="button"
                                onClick={handleCancelFineTune}
                                className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs sm:text-sm font-medium"
                              >
                                ✕ Cancel Edit
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleFineTunePlot(plot.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs sm:text-sm font-medium"
                                >
                                  ✏️ Fine Tune
                                </button>
                                {!plot.isSaved && (
                                  <button
                                    type="button"
                                    onClick={() => handleSavePlot(plot.id)}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs sm:text-sm font-medium"
                                  >
                                    💾 Save Plot
                                  </button>
                                )}
                              </>
                            )}
                            {editingPlotId !== plot.id && (
                              <button
                                type="button"
                                onClick={() => handleDeletePlot(plot.id)}
                                className="text-red-600 hover:text-red-800 p-1"
                              >
                                <Trash2 size={14} className="sm:w-4 sm:h-4" />
                              </button>
                            )}
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
                                {/* {renderPlotField( */}
                                  {/* plot.id, */}
                                  {/* "plants_Per_Acre", */}
                                  {/* plot.plants_Per_Acre */}
                                {/* )} */}
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

              {editingPlotId && (
                <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-purple-50 border border-purple-200 rounded">
                  <span className="text-xs sm:text-sm text-purple-700">
                    <b>✏️ Edit Mode Active:</b> The edit mode has been activated. You can now <strong>click and drag the vertices (corners)</strong> of the highlighted polygon to adjust its shape.
                    The area will be automatically recalculated when you finish editing. Click the <strong>"Save" button</strong> in the map toolbar when you're done, or click "Cancel Edit" below to exit edit mode.
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
                <MapContainer
                  center={center}
                  zoom={16}
                  style={{ height: "250px", width: "100%" }}
                  className="sm:h-[400px] mobile-draw-controls"
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

                  {/* Map Edit Handler */}
                  <MapEditHandler
                    featureGroup={featureGroupRef}
                    editingPlotId={editingPlotId}
                    plots={plots}
                    onEditStop={handleDrawEditStop}
                  />

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
                    {(isDrawingMode || plots.length > 0) && (
                      <EditControl
                        position="topright"
                        onCreated={handleDrawCreated}
                        onEdited={handleDrawEdited}
                        onEditStop={handleDrawEditStop}
                        onDrawStop={() => setIsDrawingMode(false)}
                        draw={{
                          polygon: isDrawingMode,
                          rectangle: false,
                          polyline: false,
                          circle: false,
                          marker: false,
                          circlemarker: false,
                        }}
                        edit={{
                          edit: plots.length > 0 ? {} : false, // Show edit button when there are plots (object, not boolean)
                          remove: !editingPlotId && !isDrawingMode ? {} : false,
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
                  className={`px-6 sm:px-8 py-2 sm:py-3 rounded-lg text-white font-semibold text-sm sm:text-base ${
                    isSubmitting || plots.length === 0 || plots.some((p) => !p.isSaved)
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : plots.some((p) => !p.isSaved)
                    ? "Save All Plots First"
                    : `✅ Submit Farm (${plots.length} plot${
                        plots.length !== 1 ? "s" : ""
                      })`}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddFarm;
