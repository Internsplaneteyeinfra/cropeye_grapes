import React from 'react';
import { useFarmerProfile } from '../hooks/useFarmerProfile';

interface HeaderFarmProps {}

export const Header: React.FC<HeaderFarmProps> = () => {
  const { profile, loading: profileLoading } = useFarmerProfile();

  // Note: Profile is automatically fetched by useFarmerProfile hook using the new my-profile endpoint



  // Format current date to display like "27 May 2025"
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="bg-green-800 py-2 shadow-md w-full box-border">
      <div className="flex flex-row justify-between items-center w-full pl-3 pr-3 sm:pl-4 sm:pr-4 gap-2">
        {profileLoading ? (
          <div className="text-gray-500 text-xs sm:text-sm">Loading...</div>
        ) : profile ? (
          <>
            {/* Farmer Name */}
            <div className="flex items-center">
              <span className="font-bold text-white text-xs sm:text-sm">
                {profile.farmer_profile?.personal_info?.full_name || 'Unknown'}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center text-white text-center font-medium text-xs sm:text-sm">
              {formattedDate}
            </div>

            {/* Total Plots */}
            <div className="flex items-center">
              <span className="font-bold text-white mr-1 sm:mr-2 text-xs sm:text-sm">Total Plots:</span>
              <span className="font-bold text-white text-xs sm:text-sm">
                {profile.agricultural_summary?.total_plots || 0}
              </span>
            </div>
          </>
        ) : (
          <div className="text-red-500 text-xs sm:text-sm">Failed to load profile</div>
        )}
      </div>
    </header>
  );
};

export default Header;
