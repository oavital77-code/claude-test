import type { ConnState } from '../transport';
import type { SensorConfig } from '../protocol';
import type { AlertEngineState } from './alertEngine';

export interface HistoryPoint {
  timestampMs: number;
  temperatureC: number;
  humidityPct: number;
}

/** User-editable fields that live only in the app (never sent over the wire). */
export interface SensorMeta {
  nickname: string;
  locationLabel: string;
}

export interface SensorRuntime {
  deviceId: string;
  hardwareName: string;
  serialNumber: string;
  firmwareVersion: string;
  connState: ConnState;
  rssi: number;
  temperatureC: number | null;
  humidityPct: number | null;
  batteryPct: number | null;
  sensorFault: boolean;
  lastMeasurementAtMs: number | null;
  history: HistoryPoint[];
  config: SensorConfig;
  meta: SensorMeta;
  alertState: AlertEngineState;
}

export type TimeRange = '1h' | '24h' | '7d';

export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
