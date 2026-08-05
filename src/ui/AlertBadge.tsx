import { AlertTriangle, WifiOff, BatteryWarning, Wrench, Flame, TrendingUp, type LucideIcon } from 'lucide-react';
import type { AlertType } from '../domain/alertEngine';
import { ALERT_LABELS, SEVERITY_COLORS } from './alertPresentation';
import { ALERT_SEVERITY } from '../domain/alertEngine';
import { Badge } from './primitives';

const ICONS: Record<AlertType, LucideIcon> = {
  ALARM_HIGH: Flame,
  ALARM_ROR: TrendingUp,
  ALARM_LOW: AlertTriangle,
  LINK_LOST: WifiOff,
  SENSOR_FAULT: Wrench,
  LOW_BATTERY: BatteryWarning,
};

export function AlertBadge({ type }: { type: AlertType }) {
  const severity = ALERT_SEVERITY[type];
  const colors = SEVERITY_COLORS[severity];
  const Icon = ICONS[type];
  return (
    <Badge className={`${colors.bg} ${colors.text} border ${colors.border}/30`}>
      <Icon size={13} />
      {ALERT_LABELS[type]}
    </Badge>
  );
}
