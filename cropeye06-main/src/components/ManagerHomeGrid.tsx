// ManagerHomeGrid.tsx
import React, { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Users,
  Calendar,
  Users as TeamConnect,
  Truck,
  Cloud,
  Book,
  Grape,
} from "lucide-react";
import { GiSugarCane } from "react-icons/gi";
import { DashboardNo } from "./Dashboardno";
import TeamList from "./TeamList";
import AddBooking from "./AddBooking";
import HarvestDashboard from "../components/HarvestDashboard";

interface ManagerHomeGridProps {
  onMenuClick: (menuTitle: string) => void;
  onOpenSidebarWithMenu: (menuTitle: string) => void;
}

const menuItems = [
  {
    title: "Farm Crop Status",
    description: "Track crop condition and growth across your farms.",
    icon: <BarChart3 className="h-5 w-5" />,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Harvesting Planning",
    description: "Review upcoming harvest plans and crop readiness.",
    icon: <GiSugarCane className="h-5 w-5" />,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    title: "Agroclimatic",
    description: "View local weather and agroclimate information.",
    icon: <Cloud className="h-5 w-5" />,
    tone: "bg-sky-50 text-sky-700",
  },
  {
    title: "User Desk",
    description: "Manage users and access team records.",
    icon: <Users className="h-5 w-5" />,
    tone: "bg-violet-50 text-violet-700",
  },
  {
    title: "MyTask",
    description: "Keep track of assigned tasks and schedules.",
    icon: <Calendar className="h-5 w-5" />,
    tone: "bg-teal-50 text-teal-700",
  },
  {
    title: "Team Connect",
    description: "Connect with your field team and colleagues.",
    icon: <TeamConnect className="h-5 w-5" />,
    tone: "bg-rose-50 text-rose-700",
  },
  {
    title: "Resources Planning",
    description: "Coordinate farm resources and logistics.",
    icon: <Truck className="h-5 w-5" />,
    tone: "bg-orange-50 text-orange-700",
  },
  {
    title: "Plan & Book",
    description: "Create and manage bookings for farm operations.",
    icon: <Book className="h-5 w-5" />,
    tone: "bg-indigo-50 text-indigo-700",
  },
];

const ManagerHomeGrid: React.FC<ManagerHomeGridProps> = ({
  onMenuClick,
  onOpenSidebarWithMenu,
}) => {
  const [currentPage, setCurrentPage] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);

  // If a specific page is selected, render that page instead of the grid
  if (currentPage === "team-connect") {
    return (
      <div>
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <button
            onClick={() => setCurrentPage(null)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back to Home</span>
          </button>
        </div>
        <TeamList />
      </div>
    );
  }

  if (currentPage === "add-booking") {
    return (
      <div>
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <button
            onClick={() => setCurrentPage(null)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back to Home</span>
          </button>
        </div>
        <AddBooking bookings={bookings} setBookings={setBookings} />
      </div>
    );
  }

  if (currentPage === "harvesting-planning") {
    return (
      <div>
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <button
            onClick={() => setCurrentPage(null)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back to Home</span>
          </button>
        </div>
        <HarvestDashboard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 p-5 text-white shadow-lg sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Grape className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
              Manager overview
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
              Manager Dashboard
            </h1>
            <p className="mt-1 text-sm text-emerald-50/90">
              Your farm operations, team tools, and latest activity in one place.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Manager tools</h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Choose a tool to continue managing your farm operations.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {menuItems.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                // Handle different navigation based on card type
                if (item.title === "User Desk") {
                  // Open sidebar and expand User Desk menu
                  onOpenSidebarWithMenu("UserDesk");
                } else if (item.title === "Resources Planning") {
                  // Open sidebar and expand Resources Planning menu
                  onOpenSidebarWithMenu("Resoucres Planning");
                } else if (item.title === "Team Connect") {
                  // Open TeamList page in full window
                  setCurrentPage("team-connect");
                } else if (item.title === "MyTask") {
                  // Open sidebar and expand MyTask menu
                  onOpenSidebarWithMenu("MyTask");
                } else if (item.title === "Plan & Book") {
                  // Open AddBooking page in full window
                  setCurrentPage("add-booking");
                } else if (item.title === "Harvesting Planning") {
                  // Open HarvestDashboard page in full window
                  setCurrentPage("harvesting-planning");
                } else if (item.title === "Farm Crop Status") {
                  onMenuClick("Farm Crop Status");
                } else {
                  // Default behavior for other cards
                  onMenuClick(item.title);
                }
              }}
              className="group flex min-h-28 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-700" />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Dashboard summary</h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Current totals for users, inventory, orders, and bookings.
          </p>
        </div>
        <DashboardNo />
      </section>
    </div>
  );
};

export default ManagerHomeGrid;
