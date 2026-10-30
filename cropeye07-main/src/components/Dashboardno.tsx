// DashboardNo.tsx
import React, { useState, useEffect } from "react";
import { Users, ShoppingCart, Loader2 } from "lucide-react";
import { getTotalCounts } from "../api";

interface DashboardStats {
  total_users?: number;
  vendors?: number;
  stock_items?: number;
  orders?: number;
  bookings?: number;
}

interface DashboardNoProps {
  layout?: 'row' | 'column';
}

export const DashboardNo: React.FC<DashboardNoProps> = ({ layout = 'row' }) => {
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getTotalCounts();

        // Handle different response formats
        const data = response.data;
        setStats({
          total_users: data.total_users || data.totalUsers || data.users || 0,
          vendors: data.vendors || 0,
          stock_items: data.stock_items || data.stockItems || data.stock || 0,
          orders: data.orders || 0,
          bookings: data.bookings || 0,
        });
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

  const isColumn = layout === 'column';

  return (
    <div className={`flex gap-4 py-2 ${isColumn ? 'flex-col' : 'flex-row overflow-x-auto'}`}>
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
              className={`flex flex-col justify-between bg-white rounded-lg shadow-md p-4 ${isColumn ? 'w-full' : 'flex-shrink-0 w-48'}`}
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
