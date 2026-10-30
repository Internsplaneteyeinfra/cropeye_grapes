import React, { useMemo } from 'react';
import { NormalizedAlert, AlertCategory, AlertSeverity } from '../../utils/alertMapper';
import { AlertCard } from './AlertCard';
import { AlertFilter } from './AlertFilterTabs';

interface AlertListProps {
  alerts: NormalizedAlert[];
  filter: AlertFilter;
  onRead?: (id: number) => void;
}

export const AlertList: React.FC<AlertListProps> = ({ alerts, filter, onRead }) => {
  const filteredAlerts = useMemo(() => {
    let filtered = alerts;
    if (filter !== 'All') {
      filtered = alerts.filter((alert) => {
        switch (filter) {
          case 'Critical':
            return alert.severity === 'high';
          case 'Crop Health':
            return alert.type === 'health' || alert.type === 'growth' || alert.type === 'canopy';
          case 'Irrigation':
            return alert.type === 'irrigation';
          case 'Pest/Disease':
            return alert.type === 'pest' || alert.type === 'disease' || alert.type === 'spray';
          default:
            return true;
        }
      });
    }

    // Sort: Unread first, then by severity (high > moderate > low), then by timestamp (newest first)
    return filtered.sort((a, b) => {
      if (a.is_read !== b.is_read) {
        return a.is_read ? 1 : -1;
      }

      const severityOrder: Record<AlertSeverity, number> = { high: 3, moderate: 2, low: 1 };
      const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (sevDiff !== 0) return sevDiff;

      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [alerts, filter]);

  if (filteredAlerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-gray-500 h-64">
        <span className="material-icons mb-3" style={{ fontSize: '48px', color: '#CBD5E1' }}>notifications_off</span>
        <p className="text-sm font-semibold">No alerts found</p>
        <p className="text-xs mt-1">Check back later for updates</p>
      </div>
    );
  }

  // Group by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groupedAlerts = filteredAlerts.reduce((acc, alert) => {
    const alertDate = new Date(alert.timestamp);
    alertDate.setHours(0, 0, 0, 0);

    let group = 'Older';
    if (alertDate.getTime() === today.getTime()) {
      group = 'Today';
    } else if (alertDate.getTime() === yesterday.getTime()) {
      group = 'Yesterday';
    }

    if (!acc[group]) acc[group] = [];
    acc[group].push(alert);
    return acc;
  }, {} as Record<string, NormalizedAlert[]>);

  const order = ['Today', 'Yesterday', 'Older'];

  return (
    <div className="p-3 overflow-y-auto max-h-[400px]">
      {order.map((group) => {
        if (!groupedAlerts[group] || groupedAlerts[group].length === 0) return null;
        return (
          <div key={group} className="mb-4">
            <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3 px-1">{group}</h3>
            {groupedAlerts[group].map((alert) => (
              <AlertCard key={alert.id} alert={alert} onRead={onRead} />
            ))}
          </div>
        );
      })}
    </div>
  );
};
