import React, { useState, useEffect, lazy, Suspense } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import FarmerInfoBar from "./components/FarmerInfoBar";
import { jwtDecode } from "jwt-decode";
import { getAuthToken } from "./utils/auth";
import CommonSpinner from "./components/CommanSpinner";
import { preloadAllFarmerData } from "./services/dataPreloader";
import { useFarmerProfile } from "./hooks/useFarmerProfile";
import { useAppContext } from "./context/AppContext";

const OwnerFarmDash = lazy(() => import("./components/OwnerFarmDash"));
const OwnerHarvestDash = lazy(() => import("./components/OwnerHarvestDash"));
const ManagerHomeGrid = lazy(() => import("./components/ManagerHomeGrid"));
const OwnerHomeGrid = lazy(() => import("./components/OwnerHomeGrid"));
const Addusers = lazy(() => import("./components/Addusers").then(m => ({ default: m.Addusers })));
const UserList = lazy(() => import("./components/userList").then(m => ({ default: m.UserList })));
const Contactuser = lazy(() => import("./components/Contactuser"));
const Addvendor = lazy(() => import("./components/AddVendor").then(m => ({ default: m.Addvendor })));
const VendorList = lazy(() => import("./components/Vendorlist").then(m => ({ default: m.VendorList })));
const Addorder = lazy(() => import("./components/Addorder").then(m => ({ default: m.Addorder })));
const OrderList = lazy(() => import("./components/orderlist").then(m => ({ default: m.OrderList })));
const AddStock = lazy(() => import("./components/AddStock").then(m => ({ default: m.AddStock })));
const StockList = lazy(() => import("./components/stocklist").then(m => ({ default: m.StockList })));
const BookingList = lazy(() => import("./components/Bookinglist").then(m => ({ default: m.BookingList })));
const AddBooking = lazy(() => import("./components/AddBooking"));
const FarmList = lazy(() => import("./components/FarmList").then(m => ({ default: m.FarmList })));
const CalendarView = lazy(() => import("./components/CalendarView"));
const MyList = lazy(() => import("./components/MyList"));
const TeamList = lazy(() => import("./components/TeamList"));
const FieldOfficerHomeGrid = lazy(() => import("./components/FieldOfficerHomeGrid"));
const FarmerHomeGrid = lazy(() => import("./components/FarmerHomeGrid"));
const Calendar = lazy(() => import("./components/Calendar"));
const AddFarm = lazy(() => import("./components/Add Farm"));
const TaskCalendar = lazy(() => import("./components/TaskCalendar"));
const ViewList = lazy(() => import("./components/ViewList"));
const Tasklist = lazy(() => import("./components/Tasklist").then(m => ({ default: m.Tasklist })));
const PestDisease = lazy(() => import("./components/pestt/Pest & Disease").then(m => ({ default: m.PestDisease })));
const Fertilizer = lazy(() => import("./components/Fertilizer"));
const Irrigation = lazy(() => import("./components/Irrigation/Irrigation"));
const BlogCard = lazy(() => import("./components/BlogCard"));
const AgricultureData = lazy(() => import("./components/AgricultureData"));
const Map = lazy(() => import("./components/Map"));
const FarmerDashboard = lazy(() => import("./components/FarmerDashboard"));
const OfficerDashboard = lazy(() => import("./components/FarmCropStatus"));
const AgroDashboard = lazy(() => import("./components/AgroDash/AgroDashboard"));
const ManagerFarmDash = lazy(() => import("./components/ManagerFarmDash"));
const HarvestDashboard = lazy(() => import("./components/HarvestDashboard"));
const DashboardGrid = lazy(() => import("./components/DashboardGrid").then(m => ({ default: m.DashboardGrid })));

enum View {
  Home = "home",
  ManagerHomeGrid = "ManagerHomeGrid",
  HarvestDashboard = "HarvestDashboard",
  Dashboard = "dashboard",
  AgroDashboard = "AgroDashboard",
  ManagerFarmDash = "ManagerFarmDash",
  OwnerFarmDash = "OwnerFarmDash",
  OwnerHarvestDash = "OwnerHarvestDash",
  AddUsers = "addusers",
  userList = "userlist",
  Contactuser = "Contactuser",
  Addvendor = "AddVendor",
  VendorList = "Vendorlist",
  Addorder = "Addorder",
  orderlist = "orderlist",
  Addstock = "Addstock",
  stocklist = "stocklist",
  AddBooking = "AddBooking",
  Bookinglist = "Bookinglist",
  FarmList = "farmlist",
  CalendarView = "CalendarView",
  MyList = "MyList",
  TeamList = "TeamList",
  Calendar = "Calendar",
  AddFarm = "AddFarm",
  TaskCalendar = "TaskCalendar",
  ViewList = "ViewList",
  Tasklist = "Tasklist",
  Fertilizer = "Fertilizer",
  Irrigation = "Irrigation",
  BlogCard = "BlogCard",
  PestDisease = "Pest & Disease",
  AgricultureData = "AgricultureData",
  Map = "Map",
  FarmerDashboard = "FarmerDashboard",
  FarmCropStatus = "FarmCropStatus",
}

interface AppProps {
  userRole: "manager" | "admin" | "fieldofficer" | "farmer" | "owner";
  onLogout: () => void;
}

const App: React.FC<AppProps> = ({ userRole, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.Home);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [expandedSidebarMenu, setExpandedSidebarMenu] = useState<string | null>(
    null
  );
  const [users, setUsers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedPlotName, setSelectedPlotName] = useState<string | null>(null);
  void FarmerHomeGrid;

  const [soilData, setSoilData] = useState({
    phValue: null as number | null,
    nitrogenValue: null as number | null,
    fertilityStatus: "Moderate",
  });

  // NEW: Add currentUser state
  void soilData;

  const [currentUser, setCurrentUser] = useState<{
    id: number;
    role: string;
    name: string;
  } | null>(null);

  // NEW: Get user from JWT token
  useEffect(() => {
    const token = getAuthToken();

    if (token) {
      try {
        const decoded: any = jwtDecode(token);

        setCurrentUser({
          id: decoded.user_id || decoded.id,
          role: decoded.role || userRole,
          name: decoded.username || decoded.first_name || "User",
        });
      } catch (error) {
        console.error("Error decoding token:", error);
        // Fallback for development/testing
        setCurrentUser({
          id: 3, // Default field officer ID for testing
          role: userRole,
          name: "Test User",
        });
      }
    } else {
      // No token - set default for testing
      setCurrentUser({
        id: 3,
        role: userRole,
        name: "Test User",
      });
    }
  }, [userRole]);

  // Preload data for farmer immediately after login
  const { profile: farmerProfile, loading: farmerProfileLoading } = useFarmerProfile();
  const { setApiData, setPreloading, setPreloadComplete, isPreloading, isPreloadComplete } = useAppContext();

  useEffect(() => {
    // Only preload for farmers
    if (userRole === 'farmer') {
      // Prevent repeated preloads
      if (isPreloading() || isPreloadComplete()) {
        return;
      }
      // If profile is already loaded, start preloading immediately
      if (!farmerProfileLoading && farmerProfile?.plots) {
        const plots = farmerProfile.plots || [];
        if (plots.length > 0) {
          console.log('🚀 Farmer logged in, starting immediate data preload for', plots.length, 'plot(s)...');
          // Preload in background (don't block UI) with context
          const context = {
            setApiData,
            setPreloading,
            setPreloadComplete,
          };
          // Use requestIdleCallback if available for smoother experience, otherwise use setTimeout
          const preloadFn = () => {
            preloadAllFarmerData(plots, context).catch(error => {
              console.error('Failed to preload farmer data:', error);
              setPreloading(false);
            });
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(preloadFn, { timeout: 1000 });
          } else {
            setTimeout(preloadFn, 100);
          }
        }
      }
      // If profile is still loading, wait for it
      // The effect will re-run when farmerProfileLoading becomes false
    }
  }, [userRole, farmerProfileLoading, farmerProfile, setApiData, setPreloading, setPreloadComplete, isPreloading, isPreloadComplete]);

  const handleMenuSelect = (menu: string) => {
    setActiveSubmenu(null);

    let nextView = View.Home;

    switch (menu) {
      case "Farm Crop Status":
      case "farm-crop-status":
        // Use ManagerFarmDash for manager/owner, FarmCropStatus for field officer
        if (userRole === "owner") {
          nextView = View.OwnerFarmDash;
        } else if (userRole === "manager") {
          nextView = View.ManagerFarmDash;
        } else {
          nextView = View.FarmCropStatus;
        }
        break;
      case "Harvesting Planning":
        if (userRole === "owner") {
          nextView = View.OwnerHarvestDash;
        } else {
          nextView = View.HarvestDashboard;
        }
        break;
      case "ViewFarmerPlot":
        nextView = View.FarmCropStatus;
        break;
      case "Agroclimatic":
        nextView = View.AgroDashboard;
        break;
      case "Plot View":
        nextView = View.Dashboard;
        setActiveSubmenu(menu);
        break;
      case "Add User":
        nextView = View.AddUsers;
        break;
      case "User List":
        nextView = View.userList;
        break;
      case "Contactuser":
        nextView = View.Contactuser;
        break;
      case "Add Vendor":
        nextView = View.Addvendor;
        break;
      case "Vendor list":
        nextView = View.VendorList;
        // Component handles its own data fetching via useEffect
        break;
      case "Add order":
        nextView = View.Addorder;
        break;
      case "order list":
        nextView = View.orderlist;
        // Component handles its own data fetching via useEffect
        break;
      case "Add Stock":
        nextView = View.Addstock;
        break;
      case "stock list":
        nextView = View.stocklist;
        // Component handles its own data fetching via useEffect
        break;
      case "Add Booking":
        nextView = View.AddBooking;
        break;
      case "Booking List":
        nextView = View.Bookinglist;
        break;
      case "Farmlist":
        nextView = View.FarmList;
        break;
      case "CalendarView":
        nextView = View.CalendarView;
        break;
      case "MyList":
        nextView = View.MyList;
        break;
      case "Team List":
      case "Team Connect":
      case "TeamConnect":
        nextView = View.TeamList;
        break;
      case "Calendar":
        nextView = View.Calendar;
        break;
      case "AddFarm":
        nextView = View.AddFarm;
        break;
      case "TaskCalendar":
        nextView = View.TaskCalendar;
        break;
      case "ViewList":
        nextView = View.ViewList;
        break;
      case "Tasklist":
        nextView = View.Tasklist;
        break;
      case "Pest & Disease":
        nextView = View.PestDisease;
        break;
      case "Fertilizer":
        nextView = View.Fertilizer;
        break;
      case "Irrigation":
        nextView = View.Irrigation;
        break;
      case "BlogCard":
        nextView = View.BlogCard;
        break;
      case "AgricultureData":
        nextView = View.AgricultureData;
        break;
      case "Map":
        nextView = View.Map;
        break;
      case "FarmerDashboard":
        nextView = View.FarmerDashboard;
        break;
      default:
        nextView = View.Home;
        break;
    }

    setCurrentView(nextView);
    setIsSidebarOpen(false);
  };

  // Allow other components (e.g. notifications) to request navigation
  useEffect(() => {
    const onNav = (ev: Event) => {
      const ce = ev as CustomEvent<{ menu?: string }>;
      const menu = ce?.detail?.menu;
      if (!menu) return;
      handleMenuSelect(menu);
    };
    window.addEventListener("cropeye:navigate", onNav as EventListener);
    return () => window.removeEventListener("cropeye:navigate", onNav as EventListener);
    // handleMenuSelect is stable enough for this usage in this app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHomeClick = () => {
    setCurrentView(View.Home);
    setIsSidebarOpen(false);
    setActiveSubmenu(null);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const openSidebarWithMenu = (menuTitle: string) => {
    setIsSidebarOpen(true);
    setExpandedSidebarMenu(menuTitle);
    // Clear the expanded menu after a longer delay to allow the sidebar to open and expand
    setTimeout(() => {
      setExpandedSidebarMenu(null);
    }, 1000);
  };

  const handleSoilDataChange = (data: {
    plotName: string;
    phValue: number | null;
    nitrogenValue?: number | null;
    phStatistics?: { phh2o_0_5cm_mean_mean: number };
  }) => {
    setSoilData((prev) => ({
      ...prev,
      phValue: data.phValue,
      nitrogenValue:
        data.nitrogenValue !== undefined ? data.nitrogenValue : null,
    }));
    setSelectedPlotName(data.plotName || null);
  };

  const renderHomeGrid = () => {
    switch (userRole) {
      case "manager":
        return (
          <ManagerHomeGrid
            onMenuClick={handleMenuSelect}
            onOpenSidebarWithMenu={openSidebarWithMenu}
          />
        );
      case "owner":
        return <OwnerHomeGrid onMenuClick={handleMenuSelect} />;
      case "fieldofficer":
        return (
          <FieldOfficerHomeGrid
            onMenuClick={handleMenuSelect}
            onOpenSidebarWithMenu={openSidebarWithMenu}
          />
        );
      case "farmer":
        return <Map onSoilDataChange={handleSoilDataChange} />;
      default:
        return <div>Invalid user role: {userRole}</div>;
    }
  };

  return (
    <>
      <div className="main-background" />
      <div className="min-h-screen flex flex-col">
      <div className="flex flex-col">
        {/* Header - responsive margin on desktop only */}
        <div className={`transition-all duration-300 ease-in-out ${isSidebarOpen ? "lg:ml-[280px]" : "lg:ml-0"}`}>
          <div className="app-container-header">
            <Header toggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
          </div>
        </div>

        {/* Farmer Information Bar - Only show for farmers */}
        {userRole === 'farmer' && (
          <div className={`transition-all duration-300 ease-in-out ${isSidebarOpen ? "lg:ml-[280px]" : "lg:ml-0"}`}>
            <div className="app-container-header">
              <FarmerInfoBar />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 relative">
        {/* Sidebar - overlay on mobile, fixed on desktop */}
        <div
          className={`fixed top-0 left-0 h-full z-[999999] transition-all duration-300 ease-in-out ${isSidebarOpen
              ? "w-[280px] translate-x-0"
              : "-translate-x-full"
            } lg:translate-x-0 ${isSidebarOpen ? "lg:w-[280px]" : "lg:w-0"} overflow-hidden`}
        >
          {/* Mobile overlay backdrop */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
              onClick={toggleSidebar}
            />
          )}
          <Sidebar
            isOpen={isSidebarOpen}
            onMenuSelect={handleMenuSelect}
            onHomeClick={handleHomeClick}
            onLogout={onLogout}
            userRole={userRole}
            expandedMenu={expandedSidebarMenu}
          />
        </div>

        {/* Main content - responsive margin */}
        <main
          className={`flex-1 transition-all duration-300 ease-in-out w-full ${isSidebarOpen ? "lg:ml-[280px]" : "lg:ml-0"
            } overflow-auto`}
          style={{ minHeight: '100vh' }}
        >
          <div className="w-full h-full app-content" style={{ minHeight: '100vh' }}>
            <div className="app-container">
              <Suspense fallback={<CommonSpinner message="Loading..." />}>
                {currentView === View.Home && renderHomeGrid()}

                {currentView === View.Dashboard && activeSubmenu && (
                  <DashboardGrid
                    submenu={activeSubmenu}
                    userRole={userRole}
                    onClose={() => setActiveSubmenu(null)}
                  />
                )}

                {currentView === View.AddUsers && (
                  <Addusers setUsers={setUsers} users={users} />
                )}

              {currentView === View.userList && currentUser && (
                <UserList
                  users={users}
                  setUsers={setUsers}
                  currentUserId={currentUser.id}
                  currentUserRole={
                    currentUser.role as
                    | "owner"
                    | "manager"
                    | "fieldofficer"
                    | "farmer"
                  }
                />
              )}

              {currentView === View.Contactuser && (
                <Contactuser users={users} setUsers={setUsers} />
              )}

              {currentView === View.Addvendor && (
                <Addvendor setUsers={setUsers} users={users} />
              )}

              {currentView === View.VendorList && (
                <VendorList users={users} setUsers={setUsers} />
              )}

              {currentView === View.Addorder && (
                <Addorder setItems={setItems} items={items} />
              )}

              {currentView === View.orderlist && (
                <OrderList items={items} setItems={setItems} />
              )}

              {currentView === View.Addstock && (
                <AddStock setStocks={setStocks} />
              )}

              {currentView === View.stocklist && (
                <StockList stocks={stocks} setStocks={setStocks} />
              )}

              {currentView === View.AddBooking && (
                <AddBooking bookings={bookings} setBookings={setBookings} />
              )}

              {currentView === View.Bookinglist && (
                <BookingList bookings={bookings} setBookings={setBookings} />
              )}

              {currentView === View.FarmList && (
                <FarmList users={users} setUsers={setUsers} />
              )}

              {currentView === View.CalendarView && <CalendarView />}

              {currentView === View.MyList && <MyList />}

              {currentView === View.TeamList && (
                <TeamList setUsers={setUsers} users={users} />
              )}

              {/* {currentView === View.Calendar && <Calendar />} */}

              {currentView === View.Calendar && currentUser && (
                <Calendar
                  currentUserId={currentUser.id}
                  currentUserRole={
                    currentUser.role as "manager" | "fieldofficer" | "farmer"
                  }
                />
              )}

              {currentView === View.AddFarm && <AddFarm />}

              {/* {currentView === View.TaskCalendar && <TaskCalendar currentUserId={3} currentUserRole="fieldofficer" />} */}

              {currentView === View.TaskCalendar && currentUser && (
                <TaskCalendar
                  currentUserId={currentUser.id}
                  currentUserRole={
                    currentUser.role as "manager" | "fieldofficer" | "farmer"
                  }
                />
              )}

              {/* {currentView === View.ViewList && <ViewList />}
            
            {currentView === View.Tasklist && <Tasklist  />} */}

              {currentView === View.ViewList && currentUser && (
                <ViewList
                  currentUserId={currentUser.id}
                  currentUserRole={
                    currentUser.role as "manager" | "fieldofficer" | "farmer"
                  }
                  currentUserName={currentUser.name}
                />
              )}

              {/* UPDATED: Tasklist with currentUser */}
              {currentView === View.Tasklist && currentUser && (
                <Tasklist
                  currentUserId={currentUser.id}
                  currentUserRole={
                    currentUser.role as "manager" | "fieldofficer" | "farmer"
                  }
                  currentUserName={currentUser.name}
                />
              )}
              {currentView === View.PestDisease && <PestDisease />}

              {currentView === View.Fertilizer && <Fertilizer />}

              {currentView === View.Irrigation && (
                <Irrigation selectedPlotName={selectedPlotName} />
              )}

              {currentView === View.BlogCard && <BlogCard />}

              {currentView === View.AgricultureData && <AgricultureData />}

              {currentView === View.Map && (
                <Map onSoilDataChange={handleSoilDataChange} />
              )}

              {currentView === View.FarmerDashboard && <FarmerDashboard />}

              {currentView === View.FarmCropStatus && <OfficerDashboard />}

              {currentView === View.ManagerFarmDash && <ManagerFarmDash />}

                {currentView === View.AgroDashboard && <AgroDashboard />}
                {currentView === View.HarvestDashboard && <HarvestDashboard />}

                {currentView === View.OwnerFarmDash && <OwnerFarmDash />}

                {currentView === View.OwnerHarvestDash && <OwnerHarvestDash />}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
        </div>
      </>
    );
  };
  
  export default App;
