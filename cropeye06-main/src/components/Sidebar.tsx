import React, { useState, useEffect } from 'react';
import {
  LogOut,
  ChevronDown,
  ChevronRight,
  Home,
} from 'lucide-react';
import { getUserData, getUserRole, getAuthToken } from '../utils/auth';
import { getTasksForUser } from '../api';
import { jwtDecode } from 'jwt-decode';

// ─── Crop image icon helper ───────────────────────────────────────────────────
const CropImg = ({
  src,
  alt,
  active = false,
}: {
  src: string;
  alt: string;
  active?: boolean;
}) => (
  <img
    src={src}
    alt={alt}
    className="w-[20px] h-[20px] object-contain flex-shrink-0"
    style={active ? { filter: 'brightness(0) invert(1)' } : {}}
  />
);

// ─── Image paths ──────────────────────────────────────────────────────────────
const IMG = {
  Home: '/Image/crop images/Home.png',
  Farmers: '/Image/crop images/Farmers.png',
  Tasks: '/Image/crop images/Tasks.png',
  Messages: '/Image/crop images/Messages.png',
  Weather: '/Image/crop images/Weather.png',
  Reports: '/Image/crop images/Reports.png',
  Settings: '/Image/crop images/Settings.png',
  CropStatus: '/Image/crop images/Crop Status.png',
  Irrigation: '/Image/crop images/Irrigation.png',
  Stress: '/Image/crop images/Stress.png',
  Biomass: '/Image/crop images/Biomass.png',
  OrgCarbon: '/Image/crop images/Organic Carbon.png',
  Yield: '/Image/crop images/yield.png',
  Events: '/Image/crop images/Events.png',
  Time: '/Image/crop images/Time.png',
  Location: '/Image/crop images/location.png',
};

interface SidebarProps {
  isOpen: boolean;
  onMenuSelect: (menu: string) => void;
  onHomeClick: () => void;
  onLogout: () => void;
  userRole: 'farmer' | 'admin' | 'fieldofficer' | 'manager' | 'owner';
  expandedMenu?: string | null;
}

// ─── Field Officer: Farmers row (Farmlist / Fields removed from sidebar) ───────
type FOFlatItem = {
  key: string;
  label: string;
  iconImg: string;
  action: string;
};

const FO_FARMERS: FOFlatItem = {
  key: 'farmers',
  label: 'Farmers',
  iconImg: IMG.Farmers,
  action: 'ViewFarmerPlot',
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onMenuSelect,
  onHomeClick,
  onLogout,
  userRole,
  expandedMenu,
}) => {
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [activeItem, setActiveItem] = useState<string>('home');
  const [taskCount, setTaskCount] = useState(0);

  const currentUser = getUserData();
  const currentUserRole = getUserRole();
  const username = currentUser?.username || currentUser?.first_name || 'User';
  const displayRole = currentUserRole || userRole || '';

  // Fetch pending task count for badge
  useEffect(() => {
    if (userRole !== 'fieldofficer') return;
    const fetchTaskCount = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;
        const decoded: any = jwtDecode(token);
        const userId = decoded.user_id || decoded.id;
        if (!userId) return;
        const res = await getTasksForUser(userId);
        const tasks: any[] = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.results)
            ? res.data.results
            : [];
        const pending = tasks.filter(
          (t) => !['completed', 'done', 'complete'].includes((t.status || '').toLowerCase())
        ).length;
        setTaskCount(pending);
      } catch {
        // silently fail
      }
    };
    fetchTaskCount();
  }, [userRole]);

  // Expand submenu when triggered from home grid cards
  useEffect(() => {
    if (expandedMenu && !openMenus.includes(expandedMenu)) {
      setOpenMenus((prev) => [...prev, expandedMenu]);
    }
  }, [expandedMenu]);

  const toggleSubmenu = (title: string) => {
    setOpenMenus((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  /** Farmers row */
  const renderFieldOfficerFlatItem = (item: FOFlatItem) => {
    const isActive = activeItem === item.key;
    const iconMap: Record<string, string> = {
      Farmers: 'groups',
    };
    const materialIcon = iconMap[item.label] ?? null;
    const useMaterialIcon = materialIcon !== null;

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => {
          setActiveItem(item.key);
          onMenuSelect(item.action);
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 text-left group mb-1 ${isActive ? 'sidebar-item-active' : 'text-black hover:bg-green-50/50'
          }`}
      >
        <div className="flex items-center space-x-3">
          {useMaterialIcon ? (
            <div className="icon-circle">
              <span className="material-icons">{materialIcon}</span>
            </div>
          ) : (
            <div
              className={`sidebar-icon-container ${isActive
                  ? 'bg-green-600 text-white'
                  : 'bg-transparent text-gray-500 group-hover:text-green-600'
                }`}
            >
              <CropImg src={item.iconImg} alt={item.label} active={isActive} />
            </div>
          )}
          <span className="text-sm font-semibold font-premium text-black">{item.label}</span>
        </div>

        <div className="flex items-center space-x-2">
          <ChevronRight
            size={14}
            className={`transition-colors ${isActive ? 'text-green-600' : 'text-gray-300 group-hover:text-gray-500'
              }`}
          />
        </div>
      </button>
    );
  };

  // ─── Get Material Icon for menu items ───────────────────────────────────────
  const getMaterialIconForMenu = (title: string): string | null => {
    const iconMap: Record<string, string> = {
      // Farmer menu items (keep existing)
      'FarmerDashboard': 'agriculture',
      'My Profile': 'account_circle',
      'MyTask': 'chat',
      'Irrigation': 'water_drop',
      'Pest & Disease': 'emergency_share',
      'Fertilizer': 'grass',
      'Contactuser': '3p',

      // Admin/Owner/Manager menu items
      'Farm Crop Status': 'eco',
      'Harvesting Planning': 'agriculture',
      'Agroclimatic': 'wb_sunny',
      'Team Connect': 'groups',
      'User Desk': 'person',
      'User List': 'people',
      'Add User': 'person_add',

      // Resources Planning
      'Resources Planning': 'inventory',
      'Resoucres Planning': 'inventory',
      'Add Vendor': 'store',
      'Vendor list': 'store',
      'Add order': 'add_shopping_cart',
      'order list': 'shopping_cart',
      'Add Stock': 'inventory_2',
      'stock list': 'inventory',

      // Plan & Book
      'Plan&Book': 'event',
      'Plan & Book': 'event',
      'Add Booking': 'event_available',
      'Booking List': 'event_note',

      // Tasks and Calendar
      'Calendar': 'calendar_today',
      'CalendarView': 'calendar_view_month',
      'MyList': 'list',
      'ViewList': 'view_list',
      'Tasklist': 'task',
      'TaskCalendar': 'calendar_today',
    };

    return iconMap[title] || null;
  };

  // ─── Generic submenu renderer (manager / owner / farmer / admin) ───────────
  const renderMenu = (title: string, iconImg: string, submenu?: string[]) => {
    const isOpen_ = openMenus.includes(title);

    // Get Material Icon for this menu item
    const materialIcon = getMaterialIconForMenu(title);
    const useMaterialIcon = materialIcon !== null;

    return (
      <div key={title} className="mb-1">
        <div
          className={`flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 group ${isOpen_ ? 'sidebar-item-active' : 'text-black hover:bg-green-50/50'
            }`}
          onClick={() => (submenu ? toggleSubmenu(title) : onMenuSelect(title))}
        >
          <div className="flex items-center space-x-3">
            {useMaterialIcon ? (
              <div className="icon-circle">
                <span className="material-icons">{materialIcon}</span>
              </div>
            ) : (
              <div
                className={`sidebar-icon-container ${isOpen_
                    ? 'bg-green-600 text-white'
                    : 'bg-transparent text-gray-500 group-hover:text-green-600'
                  }`}
              >
                <CropImg src={iconImg} alt={title} active={isOpen_} />
              </div>
            )}
            <span className="text-sm font-semibold font-premium text-black">{title}</span>
          </div>
          <div className="flex items-center space-x-2">
            {submenu && (
              <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                {isOpen_ ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            {!submenu && (
              <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
            )}
          </div>
        </div>
        {submenu && isOpen_ && (
          <div className="ml-10 mt-1 space-y-1 border-l border-gray-200 pl-4">
            {submenu.map((sub) => (
              <div
                key={sub}
                className="py-1.5 px-2 text-xs font-bold cursor-pointer text-black hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                onClick={() => onMenuSelect(sub)}
              >
                {sub}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Role-based menu items for non-field-officer roles ────────────────────
  const getNonFOMenuItems = () => {
    switch (userRole) {
      case 'farmer':
        return (
          <>
            {/* {renderMenu('My Profile',         IMG.Settings)} */}
            {renderMenu('FarmerDashboard', IMG.CropStatus)}
            {renderMenu('MyTask', IMG.Tasks, ['Calendar', 'ViewList'])}
            {renderMenu('Irrigation', IMG.Irrigation)}
            {renderMenu('Pest & Disease', IMG.Stress)}
            {renderMenu('Fertilizer', IMG.Biomass)}
            {renderMenu('Contactuser', IMG.Messages)}
          </>
        );
      case 'admin':
        return (
          <>
            {renderMenu('Farm Crop Status', IMG.CropStatus)}
            {renderMenu('Harvesting Planning', IMG.Yield)}
            {renderMenu('Agroclimatic', IMG.Weather)}
            {renderMenu('Team Connect', IMG.Farmers)}
            {renderMenu('User Desk', IMG.Farmers, ['Contactuser'])}
          </>
        );
      case 'owner':
        return (
          <>
            {renderMenu('Farm Crop Status', IMG.CropStatus)}
            {renderMenu('Harvesting Planning', IMG.Yield)}
            {renderMenu('Agroclimatic', IMG.Weather)}
            {renderMenu('Team Connect', IMG.Farmers)}
            {renderMenu('Contactuser', IMG.Messages)}
          </>
        );
      case 'manager':
        return (
          <>
            {renderMenu('Farm Crop Status', IMG.CropStatus)}
            {renderMenu('Harvesting Planning', IMG.Yield)}
            {renderMenu('Agroclimatic', IMG.Weather)}
            {renderMenu('UserDesk', IMG.Farmers, ['Add User', 'User List', 'Contactuser'])}
            {renderMenu('MyTask', IMG.Tasks, ['CalendarView', 'MyList'])}
            {renderMenu('Team Connect', IMG.Farmers)}
            {renderMenu('Resoucres Planning', IMG.Location, [
              'Add Vendor', 'Vendor list', 'Add order', 'order list', 'Add Stock', 'stock list',
            ])}
            {renderMenu('Plan&Book', IMG.Events, ['Add Booking', 'Booking List'])}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-full w-[280px] max-w-[85vw] flex flex-col transition-transform duration-300 z-50 sidebar-glass ${isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
    >
      {/* Stable Background Illustration Layer */}
      <div className={`sidebar-background-stable ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="sidebar-bg-overlay" />
      </div>

      {/* CONTENT LAYER - All buttons and navigation */}
      <div className="relative flex flex-col h-full" style={{ zIndex: 10 }}>
        {/* User info */}
        <div
          className="px-4 py-4 user-profile-section mt-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
        >
          <div className="flex items-center justify-between space-x-3">
            <div className="flex items-center space-x-3 flex-1">
              <div
                className="user-avatar"
                style={{ background: '#15803d', color: '#ffffff' }}
              >
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="user-username">{username}</div>
                <div className="user-role">{displayRole}</div>
              </div>
            </div>
            {/* Home icon button */}
            <button
              onClick={() => {
                setActiveItem('home');
                onHomeClick();
              }}
              className="p-2 rounded-lg hover:bg-green-50/50 transition-colors duration-200 flex items-center justify-center"
              title="Home"
            >
              <Home
                size={20}
                className={`transition-colors ${activeItem === 'home'
                    ? 'text-green-600'
                    : 'text-gray-600 hover:text-green-600'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {userRole === 'fieldofficer' ? (
            // ── Field Officer: Farmers → User Desk → My Task → Resources → Plan & Book
            <>
              {renderFieldOfficerFlatItem(FO_FARMERS)}

              {renderMenu('User Desk', IMG.Farmers, ['AddFarm', 'Farmlist', 'Contactuser'])}

              {/* My Task: Task List / Task Calendar */}
              {(() => {
                const tasksOpen = openMenus.includes('Tasks');
                const tasksActive = activeItem === 'tasks';
                return (
                  <div className="mb-1">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleSubmenu('Tasks')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSubmenu('Tasks');
                        }
                      }}
                      className={`flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 group w-full ${tasksActive || tasksOpen
                          ? 'sidebar-item-active'
                          : 'text-black hover:bg-green-50/50'
                        }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="icon-circle">
                          <span className="material-icons">task</span>
                        </div>
                        <span className="text-sm font-semibold font-premium text-black">
                          My Task
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {taskCount > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-600 text-white pulsate">
                            {taskCount}
                          </span>
                        ) : null}
                        <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                          {tasksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      </div>
                    </div>
                    {tasksOpen && (
                      <div className="ml-10 mt-1 space-y-1 border-l border-gray-200 pl-4">
                        <div
                          className="py-1.5 px-2 text-xs font-bold cursor-pointer text-black hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                          onClick={() => {
                            setActiveItem('tasks');
                            onMenuSelect('Tasklist');
                          }}
                        >
                          Task List
                        </div>
                        <div
                          className="py-1.5 px-2 text-xs font-bold cursor-pointer text-black hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                          onClick={() => {
                            setActiveItem('tasks');
                            onMenuSelect('TaskCalendar');
                          }}
                        >
                          Task Calendar
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {renderMenu('Resources Planning', IMG.Location, [
                'Add Vendor', 'Vendor list', 'Add order', 'order list', 'Add Stock', 'stock list',
              ])}
              {renderMenu('Plan & Book', IMG.Events, ['Add Booking', 'Booking List'])}
            </>
          ) : (
            // ── Other roles: submenu-based nav ──────────────────────────────
            getNonFOMenuItems()
          )}
        </nav>

        <div className="px-4 pb-6 mt-auto">
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 text-black hover:text-red-600 hover:bg-red-50/40 rounded-xl transition-all duration-200 group"
          >
            <div className="sidebar-icon-container group-hover:bg-red-100/30">
              <LogOut size={18} />
            </div>
            <span className="text-sm font-bold font-premium">Logout</span>
            <ChevronRight
              size={14}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
