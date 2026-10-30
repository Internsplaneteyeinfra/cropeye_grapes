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
            readCount(data.users),
          vendors: readCount(data.vendors),
          stock_items:
            readCount(data.stock_items) ??
            readCount(data.stockItems) ??
            readCount(data.stock),
          orders: readCount(data.orders),
          bookings: readCount(data.bookings),
        };

        setStats(currentData);
      } catch (err: any) {
        setError('Failed to load dashboard data');
        setStats({});
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []);

  const statCards = [
    {
      title: "Total Users",
      value: stats.total_users ?? "—",
      icon: Users,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      title: "Vendors",
      value: stats.vendors ?? "—",
      icon: Users,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      title: "Stock Items",
      value: stats.stock_items ?? "—",
      icon: ShoppingCart,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      title: "Orders",
      value: stats.orders ?? "—",
      icon: ShoppingCart,
      tone: "bg-violet-50 text-violet-700",
    },
    {
      title: "Bookings",
      value: stats.bookings ?? "—",
      icon: ShoppingCart,
      tone: "bg-teal-50 text-teal-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 py-1 sm:grid-cols-3 lg:grid-cols-5">
      {loading ? (
        <div className="col-span-full flex items-center justify-center gap-2 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>Loading dashboard data...</span>
        </div>
      ) : error ? (
        <div className="col-span-full flex items-center justify-center py-8 text-sm text-red-600">
          <span>{error}</span>
        </div>
      ) : (
        statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500">{stat.title}</p>
                <h3 className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{stat.value}</h3>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default DashboardNo;
