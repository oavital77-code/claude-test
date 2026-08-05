import type { AlertSeverity, AlertType } from '../domain/alertEngine';

export const ALERT_LABELS: Record<AlertType, string> = {
  ALARM_HIGH: 'חריגת סף עליון',
  ALARM_ROR: 'קצב עלייה חד',
  ALARM_LOW: 'חריגת סף תחתון',
  LINK_LOST: 'אובדן קשר',
  SENSOR_FAULT: 'תקלת חיישן',
  LOW_BATTERY: 'סוללה חלשה',
};

export const SEVERITY_COLORS: Record<AlertSeverity, { text: string; bg: string; border: string; dot: string }> = {
  critical: { text: 'text-alarm', bg: 'bg-alarm/10', border: 'border-alarm', dot: 'bg-alarm' },
  warning: { text: 'text-warn', bg: 'bg-warn/10', border: 'border-warn', dot: 'bg-warn' },
  info: { text: 'text-info', bg: 'bg-info/10', border: 'border-info', dot: 'bg-info' },
};

export const CONN_LABELS: Record<'connected' | 'connecting' | 'disconnected', string> = {
  connected: 'מחובר',
  connecting: 'מתחבר…',
  disconnected: 'מנותק',
};
