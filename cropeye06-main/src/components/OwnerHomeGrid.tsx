import React from 'react';
import OwnerIntelligenceDashboard from './ownerDashboard/OwnerIntelligenceDashboard';

interface OwnerHomeGridProps {
  onMenuClick: (menuTitle: string) => void;
}

const OwnerHomeGrid: React.FC<OwnerHomeGridProps> = ({ onMenuClick }) => (
  <OwnerIntelligenceDashboard onMenuClick={onMenuClick} />
);

export default OwnerHomeGrid;
