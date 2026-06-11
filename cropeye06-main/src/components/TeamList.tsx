import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, RefreshCw, Search, Users } from "lucide-react";
import { PieChart, Pie, ResponsiveContainer, Cell } from "recharts";
import {
  getRecentFarmers,
  getContactDetails,
  getUsers,
  getCurrentUser,
  getTeamConnect,
} from "../api";
import { getAuthToken } from "../utils/auth";

type CategoryKey =
  | "farmers"
  | "fieldOfficers"
  | "managers"
  | "owners"
  | "vendors"
  | "stock"
  | "bookings"
  | "orders";

interface TeamMember {
  id: string | number;
  username: string;
  phone: string;
  email: string;
  password: string;
  role: string;
  meta?: Record<string, string>;
}

const EMPTY_TEAM_DATA = (): Record<CategoryKey, TeamMember[]> => ({
  farmers: [],
  fieldOfficers: [],
  managers: [],
  owners: [],
  vendors: [],
  stock: [],
  bookings: [],
  orders: [],
});

const CATEGORY_ORDER: CategoryKey[] = [
  "farmers",
  "fieldOfficers",
  "managers",
  "owners",
  "vendors",
  "stock",
  "bookings",
  "orders",
];

const CATEGORY_INFO: Record<
  CategoryKey,
  { label: string; color: string; description: string }
> = {
  farmers: {
    label: "Farmers",
    color: "#2563eb",
    description: "Farmers registered in the system (via farm list)",
  },
  fieldOfficers: {
    label: "Field Officers",
    color: "#f97316",
    description: "Field officers fetched from the user directory",
  },
  managers: {
    label: "Managers",
    color: "#8b5cf6",
    description: "Managers from the user directory",
  },
  owners: {
    label: "Factory Head Office",
    color: "#16a34a",
    description: "Factory Head Office and admins from the user directory",
  },
  vendors: {
    label: "Vendors",
    color: "#9333ea",
    description: "Vendors from the vendor list (Add New)",
  },
  stock: {
    label: "Stock",
    color: "#f59e0b",
    description: "Stock entries added under inventory",
  },
  bookings: {
    label: "Bookings",
    color: "#0ea5e9",
    description: "Booking requests captured through Add Booking",
  },
  orders: {
    label: "Orders",
    color: "#ef4444",
    description: "Purchase orders raised in the system",
  },
};

const REMOTE_API_BASE =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api/backend' : "https://cropeye-backendd.up.railway.app/api");
const LOCAL_API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '/api/backend' : "https://cropeye-backendd.up.railway.app/api")
).replace(/\/api\/?$/, "");

const ensureArray = (payload: any): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.farmers)) return payload.farmers;
  return [];
};

const toStringValue = (value: any, fallback = "N/A"): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const extractRoleName = (user: any): string => {
  const candidates = [
    user?.role,
    user?.role_name,
    user?.role_display,
    user?.user_role,
    user?.userType,
    user?.roleType,
    user?.role_data?.name,
    user?.roleData?.name,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "object") {
      if (typeof candidate.name === "string" && candidate.name.trim()) {
        return candidate.name;
      }
      if (typeof candidate.label === "string" && candidate.label.trim()) {
        return candidate.label;
      }
    }
  }
  return "";
};

const parseNumericValue = (value: any): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const ACRES_PER_HECTARE = 2.47105381;

const hectaresToAcres = (hectares: any): number =>
  parseNumericValue(hectares) * ACRES_PER_HECTARE;

const fetchFromEndpointList = async (
  remotePaths: string[],
  localPaths: string[] = [],
): Promise<any[]> => {
  const token = getAuthToken();
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }
  const tryFetch = async (url: string) => {
    const response = await fetch(url, {
      method: "GET",
      headers: baseHeaders,
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    const data = await response.json();
    return ensureArray(data);
  };

  let lastError: Error | null = null;

  for (const path of remotePaths) {
    try {
      return await tryFetch(path);
    } catch (error: any) {
      lastError = error;
    }
  }

  for (const path of localPaths) {
    try {
      return await tryFetch(path);
    } catch (error: any) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
};

const mapUserRecord = (
  record: any,
  fallbackRole: string,
  index: number,
  overrides: Partial<TeamMember> = {},
): TeamMember => {
  const username =
    toStringValue(record?.username, "").trim() ||
    [record?.first_name, record?.last_name]
      .map((part: any) => toStringValue(part, "").trim())
      .filter(Boolean)
      .join(" ") ||
    `${fallbackRole} ${index + 1}`;

  const phone =
    toStringValue(
      record?.phone_number ??
      record?.phone ??
      record?.mobile ??
      record?.contact_number ??
      record?.contact,
      "N/A",
    ) || "N/A";

  const email = toStringValue(
    record?.email ?? record?.contact_email ?? record?.mail,
    "N/A",
  );

  const password = toStringValue(
    record?.password ??
    record?.plain_password ??
    record?.raw_password ??
    record?.password_text ??
    record?.passcode,
    "N/A",
  );

  const roleFromRecord = extractRoleName(record);
  const role =
    overrides.role ?? (roleFromRecord ? roleFromRecord : fallbackRole);

  return {
    id: overrides.id ?? record?.id ?? `${fallbackRole}-${index}`,
    username: overrides.username ?? username,
    phone: overrides.phone ?? phone,
    email: overrides.email ?? email,
    password: overrides.password ?? password,
    role: overrides.role ?? role,
    meta: overrides.meta,
  };
};

const fetchFarmersData = async (): Promise<TeamMember[]> => {
  const response = await getRecentFarmers();
  const farmers = ensureArray(response?.data ?? response);

  return farmers.map((farmer: any, index: number) => {
    const meta: Record<string, string> = {};
    const farms = Array.isArray(farmer?.farms)
      ? farmer.farms
      : Array.isArray(farmer?.plots)
        ? farmer.plots.flatMap((plot: any) => ensureArray(plot?.farms))
        : [];

    const firstFarm = farms?.[0];
    const areaSource =
      firstFarm?.area_size ??
      firstFarm?.area ??
      farmer?.area_size ??
      farmer?.area;
    const areaAcres = areaSource
      ? hectaresToAcres(areaSource)
      : parseNumericValue(farmer?.area);

    if (Number.isFinite(areaAcres)) {
      meta["Area (acres)"] = `${areaAcres.toFixed(2)} acres`;
    }

    const crop = firstFarm?.crop_type ?? farmer?.crop_type;
    const plantation = firstFarm?.plantation_type ?? farmer?.plantation_type;

    if (crop) {
      meta["Crop"] = toStringValue(crop, "N/A");
    }
    if (plantation) {
      meta["Plantation"] = toStringValue(plantation, "N/A");
    }

    meta["Location"] =
      [farmer?.village, farmer?.taluka, farmer?.district]
        .map((part) => toStringValue(part, "").trim())
        .filter(Boolean)
        .join(", ") || "N/A";

    if (farmer?.created_at || farmer?.date_joined) {
      meta["Created"] = new Date(
        farmer?.created_at ?? farmer?.date_joined,
      ).toLocaleDateString();
    }

    return mapUserRecord(
      {
        ...farmer,
        username:
          toStringValue(farmer?.username, "").trim() ||
          [farmer?.first_name, farmer?.last_name]
            .map((part: any) => toStringValue(part, "").trim())
            .filter(Boolean)
            .join(" ") ||
          `Farmer ${index + 1}`,
        phone_number: farmer?.phone_number ?? farmer?.farmer?.phone_number,
        email: farmer?.email ?? farmer?.farmer?.email,
      },
      "Farmer",
      index,
      {
        role: "Farmer",
        meta,
        password: "N/A",
      },
    );
  });
};

const fetchContactsData = async (): Promise<{
  owners: TeamMember[];
  fieldOfficers: TeamMember[];
}> => {
  const response = await getContactDetails();
  const contacts = response?.data?.contacts ?? {};

  const ownersRaw: any[] = [];
  if (contacts.owner) ownersRaw.push(contacts.owner);
  if (Array.isArray(contacts.owners)) ownersRaw.push(...contacts.owners);
  if (Array.isArray(contacts.admins)) ownersRaw.push(...contacts.admins);

  const fieldOfficersRaw: any[] = [];
  if (Array.isArray(contacts.field_officers))
    fieldOfficersRaw.push(...contacts.field_officers);
  if (Array.isArray(contacts.fieldOfficers))
    fieldOfficersRaw.push(...contacts.fieldOfficers);

  const owners = ownersRaw.map((record, index) =>
    mapUserRecord(record, "Factory Head Office", index, {
      role: "Factory Head Office",
    }),
  );

  const fieldOfficers = fieldOfficersRaw.map((record, index) =>
    mapUserRecord(record, "Field Officer", index, { role: "Field Officer" }),
  );

  return { owners, fieldOfficers };
};

// Fetch team connect data from the new API endpoint
const fetchTeamConnectData = async (
  industryId?: number | string,
): Promise<{
  owners: TeamMember[];
  fieldOfficers: TeamMember[];
  farmers: TeamMember[];
  managers: TeamMember[];
}> => {
  try {
    if (!industryId) {
      throw new Error("industry_id is required for team-connect API");
    }

    const response = await getTeamConnect(industryId);
    const data = response?.data;

    // Handle different response formats
    let ownersRaw: any[] = [];
    let fieldOfficersRaw: any[] = [];
    let farmersRaw: any[] = [];
    let managersRaw: any[] = [];

    // Check if data has role-based arrays
    if (data) {
      // Format 1: { users_by_role: { owners: [], field_officers: [], farmers: [] } }
      if (data.users_by_role) {
        if (Array.isArray(data.users_by_role.owners)) {
          ownersRaw = data.users_by_role.owners;
        }
        if (Array.isArray(data.users_by_role.field_officers)) {
          fieldOfficersRaw = data.users_by_role.field_officers;
        }
        if (Array.isArray(data.users_by_role.farmers)) {
          farmersRaw = data.users_by_role.farmers;
        }
        if (Array.isArray(data.users_by_role.managers)) {
          managersRaw = data.users_by_role.managers;
        }
      }

      // Format 2: { owners: [], field_officers: [], farmers: [] } (direct format)
      if (Array.isArray(data.owners)) {
        ownersRaw = data.owners;
      }
      if (Array.isArray(data.field_officers)) {
        fieldOfficersRaw = data.field_officers;
      }
      if (Array.isArray(data.fieldOfficers)) {
        fieldOfficersRaw = data.fieldOfficers;
      }
      if (Array.isArray(data.farmers)) {
        farmersRaw = data.farmers;
      }
      if (Array.isArray(data.managers)) {
        managersRaw = data.managers;
      }

      // Format 2: { results: [] } with role field in each item
      if (Array.isArray(data.results)) {
        data.results.forEach((user: any) => {
          const roleName = extractRoleName(user).toLowerCase();
          const roleId = user?.role_id ?? user?.role?.id;

          // Check by role_id first (1=farmer, 2=fieldofficer, 3=manager, 4=owner)
          if (
            roleId === 4 ||
            roleName.includes("owner") ||
            roleName === "admin" ||
            roleName === "administrator"
          ) {
            ownersRaw.push(user);
          } else if (
            roleId === 2 ||
            (roleName.includes("field") && roleName.includes("officer"))
          ) {
            fieldOfficersRaw.push(user);
          } else if (
            roleId === 1 ||
            roleName.includes("farmer") ||
            roleName === "farmer"
          ) {
            farmersRaw.push(user);
          } else if (
            roleId === 3 ||
            roleName.includes("manager") ||
            roleName === "manager"
          ) {
            managersRaw.push(user);
          }
        });
      }

      // Format 3: Direct array with role field
      if (Array.isArray(data)) {
        data.forEach((user: any) => {
          const roleName = extractRoleName(user).toLowerCase();
          const roleId = user?.role_id ?? user?.role?.id;

          // Check by role_id first (1=farmer, 2=fieldofficer, 3=manager, 4=owner)
          if (
            roleId === 4 ||
            roleName.includes("owner") ||
            roleName === "admin" ||
            roleName === "administrator"
          ) {
            ownersRaw.push(user);
          } else if (
            roleId === 2 ||
            (roleName.includes("field") && roleName.includes("officer"))
          ) {
            fieldOfficersRaw.push(user);
          } else if (
            roleId === 1 ||
            roleName.includes("farmer") ||
            roleName === "farmer"
          ) {
            farmersRaw.push(user);
          } else if (
            roleId === 3 ||
            roleName.includes("manager") ||
            roleName === "manager"
          ) {
            managersRaw.push(user);
          }
        });
      }

      // Format 4: Check for nested data structures (data.data)
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((user: any) => {
          const roleName = extractRoleName(user).toLowerCase();
          const roleId = user?.role_id ?? user?.role?.id;

          // Check by role_id first (1=farmer, 2=fieldofficer, 3=manager, 4=owner)
          if (
            roleId === 4 ||
            roleName.includes("owner") ||
            roleName === "admin" ||
            roleName === "administrator"
          ) {
            ownersRaw.push(user);
          } else if (
            roleId === 2 ||
            (roleName.includes("field") && roleName.includes("officer"))
          ) {
            fieldOfficersRaw.push(user);
          } else if (
            roleId === 1 ||
            roleName.includes("farmer") ||
            roleName === "farmer"
          ) {
            farmersRaw.push(user);
          } else if (
            roleId === 3 ||
            roleName.includes("manager") ||
            roleName === "manager"
          ) {
            managersRaw.push(user);
          }
        });
      }
    }

    // Map to TeamMember format
    const owners = ownersRaw.map((user, index) =>
      mapUserRecord(user, "Factory Head Office", index, {
        role: "Factory Head Office",
        meta: {
          "Full Name":
            [user?.first_name, user?.last_name]
              .map((part: any) => toStringValue(part, "").trim())
              .filter(Boolean)
              .join(" ") || "N/A",
        },
      }),
    );

    const fieldOfficers = fieldOfficersRaw.map((user, index) =>
      mapUserRecord(user, "Field Officer", index, {
        role: "Field Officer",
        meta: {
          "Full Name":
            [user?.first_name, user?.last_name]
              .map((part: any) => toStringValue(part, "").trim())
              .filter(Boolean)
              .join(" ") || "N/A",
        },
      }),
    );

    const farmers = farmersRaw.map((user, index) => {
      const meta: Record<string, string> = {};
      if (user?.village || user?.taluka || user?.district) {
        meta["Location"] =
          [user?.village, user?.taluka, user?.district]
            .map((part) => toStringValue(part, "").trim())
            .filter(Boolean)
            .join(", ") || "N/A";
      }
      if (user?.created_at || user?.date_joined) {
        meta["Created"] = new Date(
          user?.created_at ?? user?.date_joined,
        ).toLocaleDateString();
      }

      return mapUserRecord(user, "Farmer", index, {
        role: "Farmer",
        meta,
        password: "N/A",
      });
    });

    const managers = managersRaw.map((user, index) =>
      mapUserRecord(user, "Manager", index, {
        role: "Manager",
        meta: {
          "Full Name":
            [user?.first_name, user?.last_name]
              .map((part: any) => toStringValue(part, "").trim())
              .filter(Boolean)
              .join(" ") || "N/A",
        },
      }),
    );

    return { owners, fieldOfficers, farmers, managers };
  } catch (error: any) {
    throw error;
  }
};

const fetchOwnersAndFieldOfficersFromUsers = async (): Promise<{
  owners: TeamMember[];
  fieldOfficers: TeamMember[];
  managers: TeamMember[];
}> => {
  const response = await getUsers();
  let records = response?.data;

  if (
    records &&
    typeof records === "object" &&
    Array.isArray(records.results)
  ) {
    records = records.results;
  } else if (
    records &&
    typeof records === "object" &&
    Array.isArray(records.data)
  ) {
    records = records.data;
  }

  const usersArray = ensureArray(records);
  const owners: TeamMember[] = [];
  const fieldOfficers: TeamMember[] = [];
  const managers: TeamMember[] = [];

  let ownerIndex = 0;
  let fieldOfficerIndex = 0;
  let managerIndex = 0;

  usersArray.forEach((user: any) => {
    const roleName = extractRoleName(user).toLowerCase();

    if (
      roleName.includes("owner") ||
      roleName === "admin" ||
      roleName === "administrator"
    ) {
      owners.push(
        mapUserRecord(user, "Factory Head Office", ownerIndex++, {
          role: "Factory Head Office",
          meta: {
            "Full Name":
              [user?.first_name, user?.last_name]
                .map((part: any) => toStringValue(part, "").trim())
                .filter(Boolean)
                .join(" ") || "N/A",
          },
        }),
      );
      return;
    }

    if (roleName.includes("manager") || roleName === "manager") {
      managers.push(
        mapUserRecord(user, "Manager", managerIndex++, {
          role: "Manager",
          meta: {
            "Full Name":
              [user?.first_name, user?.last_name]
                .map((part: any) => toStringValue(part, "").trim())
                .filter(Boolean)
                .join(" ") || "N/A",
          },
        }),
      );
      return;
    }

    if (roleName.includes("field") && roleName.includes("officer")) {
      fieldOfficers.push(
        mapUserRecord(user, "Field Officer", fieldOfficerIndex++, {
          role: "Field Officer",
          meta: {
            "Full Name":
              [user?.first_name, user?.last_name]
                .map((part: any) => toStringValue(part, "").trim())
                .filter(Boolean)
                .join(" ") || "N/A",
          },
        }),
      );
    }
  });

  return { owners, fieldOfficers, managers };
};

const fetchCurrentUserOwner = async (): Promise<TeamMember | null> => {
  try {
    const response = await getCurrentUser();
    const user = response?.data;
    if (!user) return null;

    const roleName = extractRoleName(user).toLowerCase();
    if (
      roleName.includes("owner") ||
      roleName === "admin" ||
      roleName === "administrator"
    ) {
      return mapUserRecord(user, "Factory Head Office", 0, {
        role: "Factory Head Office",
        meta: {
          "Full Name":
            [user?.first_name, user?.last_name]
              .map((part: any) => toStringValue(part, "").trim())
              .filter(Boolean)
              .join(" ") || "N/A",
        },
      });
    }
    return null;
  } catch (error) {
    return null;
  }
};

const fetchVendorsData = async (): Promise<TeamMember[]> => {
  const vendors = await fetchFromEndpointList(
    [
      `${REMOTE_API_BASE}/vendors/`,
      `${REMOTE_API_BASE}/vendorlist`,
      `${REMOTE_API_BASE}/vendors`,
    ],
    [`${LOCAL_API_BASE}/vendorlist`],
  );

  return vendors.map((vendor, index) =>
    mapUserRecord(vendor, "Vendor", index, {
      role: "Vendor",
      meta: {
        GSTIN: toStringValue(vendor?.gstin, "N/A"),
        State: toStringValue(vendor?.state, "N/A"),
        City: toStringValue(vendor?.city, "N/A"),
      },
    }),
  );
};

const fetchStockData = async (): Promise<TeamMember[]> => {
  const stocks = await fetchFromEndpointList(
    [
      `${REMOTE_API_BASE}/stock/`,
      `${REMOTE_API_BASE}/stocks/`,
      `${REMOTE_API_BASE}/stocklist`,
    ],
    [`${LOCAL_API_BASE}/stocklist`],
  );

  return stocks.map((stock, index) =>
    mapUserRecord(
      {
        ...stock,
        username: stock?.itemName,
        phone_number: null,
        email: null,
      },
      "Stock",
      index,
      {
        role: "Stock",
        phone: "N/A",
        email: "N/A",
        password: "N/A",
        meta: {
          Type: toStringValue(stock?.itemType, "N/A"),
          Status: toStringValue(stock?.status, "N/A"),
          Make: toStringValue(stock?.make, "N/A"),
          Cost: toStringValue(stock?.estimateCost, "N/A"),
        },
      } as Partial<TeamMember>,
    ),
  );
};

const fetchBookingsData = async (): Promise<TeamMember[]> => {
  const bookings = await fetchFromEndpointList(
    [
      `${REMOTE_API_BASE}/bookings/`,
      `${REMOTE_API_BASE}/bookinglist`,
      `${REMOTE_API_BASE}/bookings`,
    ],
    [`${LOCAL_API_BASE}/bookinglist`],
  );

  return bookings.map((booking, index) =>
    mapUserRecord(
      {
        ...booking,
        username: booking?.itemName,
      },
      "Booking",
      index,
      {
        role: "Booking",
        phone: "N/A",
        email: "N/A",
        password: "N/A",
        meta: {
          "User Role": toStringValue(booking?.userRole, "N/A"),
          "Start Date": toStringValue(booking?.startDate, "N/A"),
          "End Date": toStringValue(booking?.endDate, "N/A"),
          Status: toStringValue(booking?.status, "N/A"),
        },
      } as Partial<TeamMember>,
    ),
  );
};

const fetchOrdersData = async (): Promise<TeamMember[]> => {
  const orders = await fetchFromEndpointList(
    [
      `${REMOTE_API_BASE}/orders/`,
      `${REMOTE_API_BASE}/orderlist`,
      `${REMOTE_API_BASE}/orders`,
    ],
    [`${LOCAL_API_BASE}/orderlist`],
  );

  return orders.map((order, index) =>
    mapUserRecord(
      {
        ...order,
        username: order?.vendorName ?? order?.itemName,
      },
      "Order",
      index,
      {
        role: "Order",
        phone: "N/A",
        email: "N/A",
        password: "N/A",
        meta: {
          Item: toStringValue(order?.itemName ?? order?.item, "N/A"),
          Invoice: toStringValue(order?.invoiceNumber, "N/A"),
          Date: toStringValue(order?.invoiceDate, "N/A"),
          State: toStringValue(order?.state, "N/A"),
        },
      } as Partial<TeamMember>,
    ),
  );
};

type TeamListProps = {
  users?: unknown[];
  setUsers?: React.Dispatch<React.SetStateAction<unknown[]>>;
};

const TeamList: React.FC<TeamListProps> = (_props) => {
  const [teamData, setTeamData] =
    useState<Record<CategoryKey, TeamMember[]>>(EMPTY_TEAM_DATA);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("farmers");
  const [searchTerm, setSearchTerm] = useState("");
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const errors: string[] = [];

    const nextData: Record<CategoryKey, TeamMember[]> = EMPTY_TEAM_DATA();

    // STEP 1: Get current user's industry_id
    let industryId: number | string | undefined = undefined;
    try {
      const currentUserResponse = await getCurrentUser();
      const currentUser = currentUserResponse?.data;

      if (currentUser) {
        // Try different possible field names for industry_id
        industryId =
          currentUser?.industry_id ??
          currentUser?.industry?.id ??
          currentUser?.industryId ??
          currentUser?.industry?.industry_id;
      }
    } catch (err) { }

    // PRIORITY: Try to fetch from team-connect API first with industry_id
    try {
      if (!industryId) {
        throw new Error(
          "industry_id is required but not found in current user data",
        );
      }

      const teamConnectData = await fetchTeamConnectData(industryId);
      nextData.owners = teamConnectData.owners;
      nextData.fieldOfficers = teamConnectData.fieldOfficers;
      nextData.managers = teamConnectData.managers;

      // If team-connect API returns farmers, use them; otherwise fallback to getRecentFarmers
      if (teamConnectData.farmers.length > 0) {
        nextData.farmers = teamConnectData.farmers;
      } else {
        // Fallback to getRecentFarmers if team-connect doesn't return farmers
        try {
          nextData.farmers = await fetchFarmersData();
        } catch (err) {
          errors.push("farmers");
        }
      }
    } catch (teamConnectErr: any) {
      errors.push("team-connect");

      // Fallback 1: Try getRecentFarmers for farmers
      try {
        nextData.farmers = await fetchFarmersData();
      } catch (err) {
        errors.push("farmers");
      }

      // Fallback 2: Try getUsers for owners, field officers, managers
      try {
        const { owners, fieldOfficers, managers } =
          await fetchOwnersAndFieldOfficersFromUsers();
        nextData.owners = owners;
        nextData.fieldOfficers = fieldOfficers;
        nextData.managers = managers;
      } catch (err) {
        errors.push("user directory");
        // Fallback 3: Try getContactDetails
        try {
          const { owners, fieldOfficers } = await fetchContactsData();
          nextData.owners = owners;
          nextData.fieldOfficers = fieldOfficers;
        } catch (fallbackError) {
          errors.push("contact users");
        }
      }
    }

    // If still no owners found, try to get current user
    if (nextData.owners.length === 0) {
      const selfOwner = await fetchCurrentUserOwner();
      if (selfOwner) {
        nextData.owners = [selfOwner];
      }
    }

    try {
      nextData.vendors = await fetchVendorsData();
    } catch (err) {
      errors.push("vendors");
    }

    try {
      nextData.stock = await fetchStockData();
    } catch (err) {
      errors.push("stock");
    }

    try {
      nextData.bookings = await fetchBookingsData();
    } catch (err) {
      errors.push("bookings");
    }

    try {
      nextData.orders = await fetchOrdersData();
    } catch (err) {
      errors.push("orders");
    }

    setTeamData(nextData);
    setLoading(false);

    if (errors.length > 0) {
      setError(
        `Some data could not be loaded (${errors.join(", ")}). Please try refreshing.`,
      );
    } else {
      setError(null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(
    () =>
      CATEGORY_ORDER.map((key) => ({
        name: CATEGORY_INFO[key].label,
        value: teamData[key]?.length ?? 0,
        color: CATEGORY_INFO[key].color,
      })),
    [teamData],
  );

  const totalMembers = useMemo(
    () =>
      CATEGORY_ORDER.reduce(
        (sum, key) => sum + (teamData[key]?.length ?? 0),
        0,
      ),
    [teamData],
  );

  const searchTermLower = searchTerm.trim().toLowerCase();

  const filteredData = useMemo(() => {
    const activeData = teamData[activeCategory] ?? [];
    if (!searchTermLower) return activeData;

    return activeData.filter((member) => {
      const values = [
        member.username,
        member.phone,
        member.email,
        member.role,
        member.password,
      ];

      if (member.meta) {
        values.push(...Object.values(member.meta));
      }

      return values.some((value) =>
        toStringValue(value, "").toLowerCase().includes(searchTermLower),
      );
    });
  }, [teamData, activeCategory, searchTermLower]);

  const handleTogglePassword = (category: CategoryKey, id: string | number) => {
    const key = `${category}-${id}`;
    setShowPassword((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Users className="text-blue-600 h-5 w-5" />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Team Connect Overview
                </h2>
                <p className="text-xs text-gray-500">
                  Live breakdown of farmers, team members, and add-new
                  resources.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <p className="text-sm text-gray-600">
                Total Records:{" "}
                <span className="font-semibold text-gray-900">
                  {totalMembers}
                </span>
              </p>
              <button
                onClick={loadData}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 border border-yellow-300 bg-yellow-50 rounded text-sm text-yellow-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius="80%"
                    dataKey="value"
                  >
                    {stats.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1 grid grid-cols-2 gap-3 mt-6">
              {stats.map((stat) => (
                <div
                  key={stat.name}
                  className="flex justify-between items-start border border-gray-100 rounded-lg p-3"
                >
                  <div className="flex items-start space-x-3">
                    <span
                      className="inline-block w-4 h-4 rounded-full mt-1.5"
                      style={{ backgroundColor: stat.color }}
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {stat.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {
                          CATEGORY_INFO[
                            CATEGORY_ORDER.find(
                              (key) => CATEGORY_INFO[key].label === stat.name,
                            ) as CategoryKey
                          ].description
                        }
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">
                  Team Connect Directory
                </h1>
                <p className="text-xs text-gray-500">
                  Browse farmers, team members, and operational resources
                  fetched from live APIs.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search by name, email, role, or keyword..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeCategory === key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                >
                  {CATEGORY_INFO[key].label}{" "}
                  <span className="ml-1 text-xs text-gray-400">
                    ({teamData[key]?.length ?? 0})
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div
            className="p-4 "
            style={{
              minHeight: "200px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                Loading team data...
              </div>
            ) : filteredData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No records found for the selected category and search criteria.
              </div>
            ) : (
              <>
                <div className="block xl:hidden space-y-4">
                  {filteredData.map((member) => {
                    const showKey = `${activeCategory}-${member.id}`;
                    return (
                      <div
                        key={member.id}
                        className="border border-gray-200 rounded-lg p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-base">
                              {member.username}
                            </h3>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                              {member.role}
                            </span>
                          </div>
                        </div>

                        <div className="text-sm text-gray-600 space-y-2">
                          <div>
                            <span className="font-medium">Phone:</span>{" "}
                            {member.phone}
                          </div>
                          <div>
                            <span className="font-medium">Email:</span>{" "}
                            {member.email}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">Password:</span>
                            <span>
                              {showPassword[showKey]
                                ? member.password
                                : "••••••••"}
                            </span>
                            {member.password !== "N/A" && (
                              <button
                                onClick={() =>
                                  handleTogglePassword(
                                    activeCategory,
                                    member.id,
                                  )
                                }
                                className="text-gray-500"
                                aria-label="Toggle password visibility"
                              >
                                {showPassword[showKey] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                          {member.meta && (
                            <div className="space-y-1 pt-2 border-t border-gray-100">
                              {Object.entries(member.meta).map(
                                ([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span>{" "}
                                    {value}
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden xl:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          {[
                            "Username / Name",
                            "Phone Number",
                            "Email",
                            "Password",
                            "Role",
                            "Details",
                          ].map((header) => (
                            <th
                              key={header}
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.map((member) => {
                          const showKey = `${activeCategory}-${member.id}`;
                          return (
                            <tr key={member.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {member.username}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {member.phone}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {member.email}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                <div className="flex items-center space-x-2">
                                  <span>
                                    {showPassword[showKey]
                                      ? member.password
                                      : "••••••••"}
                                  </span>
                                  {member.password !== "N/A" && (
                                    <button
                                      onClick={() =>
                                        handleTogglePassword(
                                          activeCategory,
                                          member.id,
                                        )
                                      }
                                      className="text-gray-500 hover:text-gray-700"
                                      aria-label="Toggle password visibility"
                                    >
                                      {showPassword[showKey] ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                <span className="px-2 inline-flex text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                  {member.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {member.meta ? (
                                  <ul className="space-y-1">
                                    {Object.entries(member.meta).map(
                                      ([key, value]) => (
                                        <li key={key}>
                                          <span className="font-medium">
                                            {key}:
                                          </span>{" "}
                                          {value}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamList;
