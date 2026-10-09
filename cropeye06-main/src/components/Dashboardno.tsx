// DashboardNo.tsx
import React, { useState, useEffect } from "react";
import { Users, ShoppingCart, Loader2 } from "lucide-react";
import { getTotalCounts, getUsers } from "../api";

interface DashboardStats {
  total_users?: number;
  vendors?: number;
  stock_items?: number;
  orders?: number;
  bookings?: number;
  brix?: number;
}

function readCount(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (value === "") return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

function getUsersResponseCount(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return undefined;

  const payload = data as Record<string, unknown>;
  const count =
    readCount(payload.count) ??
    readCount(payload.total_users) ??
    readCount(payload.totalUsers) ??
    readCount(payload.users);
  if (count !== undefined) return count;

  for (const key of ["results", "data", "users"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) return nested.length;
    const nestedCount = getUsersResponseCount(nested);
    if (nestedCount !== undefined) return nestedCount;
  }
  return undefined;
}

export const DashboardNo: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
   const fetchCounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const [countsResult, usersResult] = await Promise.allSettled([
          getTotalCounts(),
          getUsers(),
        ]);
        if (
          countsResult.status === "rejected" &&
          usersResult.status === "rejected"
        ) {
          throw countsResult.reason;
        }

        if (countsResult.status === "rejected") {
          console.error("Failed to load dashboard totals:", countsResult.reason);
        }
        if (usersResult.status === "rejected") {
          console.error("Failed to load users for dashboard count:", usersResult.reason);
        }

        const data =
          countsResult.status === "fulfilled" ? countsResult.value.data : {};
        const usersCount =
          usersResult.status === "fulfilled"
            ? getUsersResponseCount(usersResult.value.data)
            : undefined;

        const currentData: DashboardStats = {
          total_users:
            usersCount ??
            readCount(data.total_users) ??
            readCount(data.totalUsers) ??
            readCount(data.users) ??
            0,
          vendors: data.vendors || 0,
          stock_items: data.stock_items || data.stockItems || data.stock || 0,
          orders: data.orders || 0,
          bookings: data.bookings || 0,
          brix: data.brix || 17.5,
        };

        setStats(currentData);

        if (currentData.brix !== undefined && currentData.brix > 0 && currentData.brix < 18) {
          const alertId = "low-brix-warning";
          
          setAlerts(prev => {
            if (prev.some(a => a.id === alertId && !a.is_read)) return prev;

            const brixAlert = {
              id: alertId,
              title: "Critical: Low Sugar Content",
              message: `Current Brix level is ${currentData.brix}°. This is below the required 18° threshold.`,
              severity: "high",
              type: "ripening",
              timestamp: new Date().toISOString(),
              is_read: false,
            };
            return [brixAlert, ...prev];
          });
        }

      } catch (err: any) {
        setError('Failed to load dashboard data');
        // Set default values on error
        setStats({
          total_users: 0,
          vendors: 0,
          stock_items: 0,
          orders: 0,
          bookings: 0,
        
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []);

  const statCards = [
    { 
      title: "Total Users", 
      value: stats.total_users ?? 0, 
      icon: Users, 
      color: "blue",
      iconColor: "text-blue-500"
    },
    { 
      title: "Vendors", 
      value: stats.vendors ?? 0, 
      icon: Users, 
      color: "green",
      iconColor: "text-green-500"
    },
    { 
      title: "Stock Items", 
      value: stats.stock_items ?? 0, 
      icon: ShoppingCart, 
      color: "yellow",
      iconColor: "text-yellow-500"
    },
    { 
      title: "Orders", 
      value: stats.orders ?? 0, 
      icon: ShoppingCart, 
      color: "purple",
      iconColor: "text-purple-500"
    },
    { 
      title: "Bookings", 
      value: stats.bookings ?? 0, 
      icon: ShoppingCart, 
      color: "teal",
      iconColor: "text-teal-500"
    },
  ];

  return (
    <div className="flex flex-row gap-4 overflow-x-auto py-2">
      {loading ? (
        <div className="flex items-center justify-center w-full py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading dashboard data...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center w-full py-8">
          <span className="text-red-600">{error}</span>
        </div>
      ) : (
        statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="flex-shrink-0 bg-white rounded-lg shadow-md p-4 w-48 flex flex-col justify-between"
            >
              <div>
                <p className="text-gray-500 text-sm">{stat.title}</p>
                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
              </div>
              <div className="mt-2 flex justify-end">
                <Icon className={stat.iconColor} size={28} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default DashboardNo;
