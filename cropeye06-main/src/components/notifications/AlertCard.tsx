import React from 'react';
import { NormalizedAlert } from '../../utils/alertMapper';

interface AlertCardProps {
  alert: NormalizedAlert;
  onRead?: (id: number) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onRead }) => {
  const { title, message, severity, type, timestamp, is_read } = alert;

  const severityColors = {
    high: 'bg-red-50 border-red-200 text-red-800',
    moderate: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    low: 'bg-green-50 border-green-200 text-green-800',
  };

  const severityBadgeColors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-green-100 text-green-800 border-green-200',
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pest': return 'bug_report';
      case 'disease': return 'coronavirus';
      case 'spray': return 'pest_control';
      case 'growth': return 'eco';
      case 'health': return 'monitor_heart';
      case 'canopy': return 'forest';
      case 'ripening': return 'wb_sunny';
      case 'irrigation': return 'water_drop';
      case 'harvest': return 'agriculture';
      case 'fertilizer': return 'science';
      case 'nutrient': return 'biotech';
      default: return 'notifications';
    }
  };

  return (
    <div className={`p-4 mb-3 border rounded-lg shadow-sm transition-all ${is_read ? 'opacity-70 bg-white border-gray-200' : severityColors[severity]}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full flex-shrink-0 ${is_read ? 'bg-gray-100 text-gray-500' : severityBadgeColors[severity]} flex items-center justify-center`}>
          <span className="material-icons" style={{ fontSize: '20px' }}>{getIcon(type)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className={`text-sm font-bold truncate ${is_read ? 'text-gray-700' : 'text-gray-900'}`}>{title}</h4>
            <span className="text-xs font-semibold whitespace-nowrap text-gray-500">
              {new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className={`text-sm mb-2 ${is_read ? 'text-gray-600' : 'text-gray-800'}`}>{message}</p>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${is_read ? 'bg-gray-100 text-gray-600 border-gray-200' : severityBadgeColors[severity]} uppercase tracking-wider`}>
              {severity}
            </span>
            {!is_read && onRead && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRead(alert.id);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
              >
                Mark as read
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
