import React from 'react';
import { useFarmerProfile } from '../hooks/useFarmerProfile';
import { useI18nLite } from '../i18nLite.ts';

interface HeaderFarmProps {}

export const Header: React.FC<HeaderFarmProps> = () => {
  const { profile, loading: profileLoading } = useFarmerProfile();
  const { lang, setLanguage, t } = useI18nLite();

  // Note: Profile is automatically fetched by useFarmerProfile hook using the new my-profile endpoint



  // Format current date to display like "27 May 2025"
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="bg-green-800 py-2 shadow-md">
      <div className="flex flex-row justify-between items-center px-2 sm:px-4 gap-2">
        {profileLoading ? (
          <div className="text-gray-500 text-xs sm:text-sm">{t("headerFarm.loading", { defaultValue: "Loading..." })}</div>
        ) : profile ? (
          <>
            {/* Farmer Name */}
            <div className="flex items-center">
              <span className="font-bold text-white text-xs sm:text-sm">
                {profile.farmer_profile?.personal_info?.full_name || t("headerFarm.unknown", { defaultValue: "Unknown" })}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center text-white text-center font-medium text-xs sm:text-sm">
              {formattedDate}
            </div>

            {/* Total Plots */}
            <div className="flex items-center">
              <span className="font-bold text-white mr-1 sm:mr-2 text-xs sm:text-sm">
                {t("headerFarm.totalPlotsLabel", { defaultValue: "Total Plots:" })}
              </span>
              <span className="font-bold text-white text-xs sm:text-sm">
                {profile.agricultural_summary?.total_plots || 0}
              </span>
            </div>

            {/* Language selector */}
            {/* <div className="flex items-center gap-2">
              <label className="text-white/90 text-[10px] sm:text-xs">
                {t("headerFarm.languageLabel", { defaultValue: "Language" })}
              </label>
              <select
                value={lang}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-white/95 text-gray-800 text-[10px] sm:text-xs px-2 py-1 rounded-md focus:outline-none"
                aria-label="Select language"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="kn">Kannada</option>
              </select>
            </div> */}
          </>
        ) : (
          <div className="text-red-500 text-xs sm:text-sm">
            {t("headerFarm.failedToLoad", { defaultValue: "Failed to load profile" })}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;



 {/* Left: Farmer Name
        <div className="flex items-center">
          <h2 className="font-semibold mr-2">Ajay Dhale</h2>
          <span className="bg-green-600 px-2 py-0.5 rounded">(2.48 acres)</span>
        </div> */}
 {/* Right: Total Fields
        <div className="text-right">
          Total Fields: 2
        </div> */}
