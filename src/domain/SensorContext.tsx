import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { decodeConfig, decodeDeviceInfo, decodeLiveReading, encodeConfig, type SensorConfig } from '../protocol';
import { simClock, transport, type ConnState, type DiscoveredDevice } from '../transport';
import {
  applySample,
  createInitialState,
  tick as tickAlertEngine,
  type AlertEngineConfig,
  type AlertEvent,
} from './alertEngine';
import { capArray, loadJSON, saveJSON } from './localStorage';
import type { HistoryPoint, SensorMeta, SensorRuntime } from './types';

const MAX_HISTORY_POINTS = 20_000;
const PAIRED_DEVICES_KEY = 'pairedDevices';
const META_KEY_PREFIX = 'meta.';

const DEFAULT_META: SensorMeta = { nickname: '', locationLabel: '' };

function loadMeta(deviceId: string, fallbackName: string): SensorMeta {
  const stored = loadJSON<SensorMeta | null>(META_KEY_PREFIX + deviceId, null);
  if (stored) return stored;
  return { ...DEFAULT_META, nickname: fallbackName };
}

function toAlertConfig(config: SensorConfig): AlertEngineConfig {
  return config;
}

function makeInitialRuntime(deviceId: string, hardwareName: string, config: SensorConfig): SensorRuntime {
  return {
    deviceId,
    hardwareName,
    serialNumber: '',
    firmwareVersion: '',
    connState: 'disconnected',
    rssi: -60,
    temperatureC: null,
    humidityPct: null,
    batteryPct: null,
    sensorFault: false,
    lastMeasurementAtMs: null,
    history: [],
    config,
    meta: loadMeta(deviceId, hardwareName),
    alertState: createInitialState(),
  };
}

type State = Record<string, SensorRuntime>;

type Action =
  | { type: 'ENSURE_DEVICE'; deviceId: string; hardwareName: string; config: SensorConfig }
  | { type: 'CONN_CHANGE'; deviceId: string; connState: ConnState }
  | { type: 'DEVICE_INFO'; deviceId: string; serialNumber: string; firmwareVersion: string }
  | { type: 'CONFIG'; deviceId: string; config: SensorConfig }
  | { type: 'LIVE_READING'; deviceId: string; virtualNowMs: number; temperatureC: number; humidityPct: number; batteryPct: number; sensorFault: boolean }
  | { type: 'TICK'; virtualNowMs: number }
  | { type: 'META'; deviceId: string; meta: SensorMeta };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ENSURE_DEVICE': {
      if (state[action.deviceId]) return state;
      return { ...state, [action.deviceId]: makeInitialRuntime(action.deviceId, action.hardwareName, action.config) };
    }
    case 'CONN_CHANGE': {
      const s = state[action.deviceId];
      if (!s) return state;
      return { ...state, [action.deviceId]: { ...s, connState: action.connState } };
    }
    case 'DEVICE_INFO': {
      const s = state[action.deviceId];
      if (!s) return state;
      return {
        ...state,
        [action.deviceId]: { ...s, serialNumber: action.serialNumber, firmwareVersion: action.firmwareVersion },
      };
    }
    case 'CONFIG': {
      const s = state[action.deviceId];
      if (!s) return state;
      return { ...state, [action.deviceId]: { ...s, config: action.config } };
    }
    case 'LIVE_READING': {
      const s = state[action.deviceId];
      if (!s) return state;
      const point: HistoryPoint = {
        timestampMs: action.virtualNowMs,
        temperatureC: action.temperatureC,
        humidityPct: action.humidityPct,
      };
      const history = capArray([...s.history, point], MAX_HISTORY_POINTS);
      const alertState = applySample(
        s.alertState,
        {
          timestampMs: action.virtualNowMs,
          temperatureC: action.temperatureC,
          batteryPct: action.batteryPct,
          sensorFault: action.sensorFault,
        },
        toAlertConfig(s.config),
      );
      return {
        ...state,
        [action.deviceId]: {
          ...s,
          temperatureC: action.temperatureC,
          humidityPct: action.humidityPct,
          batteryPct: action.batteryPct,
          sensorFault: action.sensorFault,
          lastMeasurementAtMs: action.virtualNowMs,
          history,
          alertState,
        },
      };
    }
    case 'TICK': {
      let changed = false;
      const next: State = { ...state };
      for (const s of Object.values(state)) {
        if (s.connState !== 'connected') continue;
        const alertState = tickAlertEngine(s.alertState, action.virtualNowMs, toAlertConfig(s.config));
        if (alertState !== s.alertState) {
          next[s.deviceId] = { ...s, alertState };
          changed = true;
        }
      }
      return changed ? next : state;
    }
    case 'META': {
      const s = state[action.deviceId];
      if (!s) return state;
      saveJSON(META_KEY_PREFIX + action.deviceId, action.meta);
      return { ...state, [action.deviceId]: { ...s, meta: action.meta } };
    }
    default:
      return state;
  }
}

interface SensorContextValue {
  sensors: SensorRuntime[];
  getSensor: (deviceId: string) => SensorRuntime | undefined;
  scan: () => Promise<DiscoveredDevice[]>;
  addSensor: (deviceId: string, hardwareName: string) => Promise<void>;
  removeSensor: (deviceId: string) => Promise<void>;
  updateMeta: (deviceId: string, meta: SensorMeta) => void;
  writeConfig: (deviceId: string, config: SensorConfig) => Promise<void>;
  allAlertEvents: Array<{ deviceId: string; event: AlertEvent }>;
}

const SensorContext = createContext<SensorContextValue | null>(null);

export function SensorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {} as State);
  const liveUnsubs = useRef(new Map<string, () => void>());
  const componentAliveToken = useRef({ alive: true }).current;
  useEffect(() => () => {
    componentAliveToken.alive = false;
  }, [componentAliveToken]);

  // wireUpDevice is only ever called once the device is already connected
  // (callers either skip it or await transport.connect() first), so it can
  // set the runtime's connection state directly instead of waiting for an
  // onConnectionChange event that, for devices connected before this
  // component mounted, will never fire.
  async function wireUpDevice(deviceId: string, hardwareName: string, aliveToken: { alive: boolean }) {
    if (liveUnsubs.current.has(deviceId)) return;
    // Claim this device id synchronously (before any await) so a second,
    // concurrent wire-up attempt for the same id — e.g. from React 18
    // StrictMode's dev-only double-invoke of effects — backs off instead of
    // creating a duplicate subscription.
    liveUnsubs.current.set(deviceId, () => {});

    dispatch({ type: 'ENSURE_DEVICE', deviceId, hardwareName, config: DEFAULT_PLACEHOLDER_CONFIG });
    dispatch({ type: 'CONN_CHANGE', deviceId, connState: 'connected' });

    try {
      const [configBytes, infoBytes] = await Promise.all([
        transport.readConfig(deviceId),
        transport.readDeviceInfo(deviceId),
      ]);
      if (!aliveToken.alive) return;
      dispatch({ type: 'CONFIG', deviceId, config: decodeConfig(configBytes) });
      const info = decodeDeviceInfo(infoBytes);
      dispatch({ type: 'DEVICE_INFO', deviceId, serialNumber: info.serialNumber, firmwareVersion: info.firmwareVersion });
    } catch {
      // Device may have gone offline between connect and read; live updates
      // will still resume once it reconnects.
    }

    if (!aliveToken.alive) return;
    const unsub = transport.subscribeLive(deviceId, (raw) => {
      const reading = decodeLiveReading(raw);
      dispatch({
        type: 'LIVE_READING',
        deviceId,
        virtualNowMs: simClock.now(),
        temperatureC: reading.temperatureC,
        humidityPct: reading.humidityPct,
        batteryPct: reading.batteryPct,
        sensorFault: reading.sensorFault,
      });
    });
    liveUnsubs.current.set(deviceId, unsub);
  }

  useEffect(() => {
    const aliveToken = { alive: true };

    const unsubConn = transport.onConnectionChange((deviceId, connState) => {
      dispatch({ type: 'CONN_CHANGE', deviceId, connState });
    });

    (async () => {
      const paired = loadJSON<string[]>(PAIRED_DEVICES_KEY, []);
      const defaults = transport
        .listSnapshots()
        .filter((d) => d.connState === 'connected')
        .map((d) => d.deviceId);
      const allIds = Array.from(new Set([...defaults, ...paired]));
      saveJSON(PAIRED_DEVICES_KEY, allIds);

      for (const deviceId of allIds) {
        if (!aliveToken.alive) return;
        const snapshot = transport.listSnapshots().find((d) => d.deviceId === deviceId);
        if (!snapshot) continue;
        if (snapshot.connState !== 'connected') {
          try {
            await transport.connect(deviceId);
          } catch {
            continue;
          }
        }
        if (!aliveToken.alive) return;
        await wireUpDevice(deviceId, snapshot.name, aliveToken);
      }
    })();

    const unsubTick = simClock.onTick(() => dispatch({ type: 'TICK', virtualNowMs: simClock.now() }));

    return () => {
      aliveToken.alive = false;
      unsubConn();
      unsubTick();
      liveUnsubs.current.forEach((unsub) => unsub());
      liveUnsubs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SensorContextValue>(() => {
    const sensors = Object.values(state).sort((a, b) => {
      const aAlert = a.alertState.events.some((e) => e.closedAtMs === null);
      const bAlert = b.alertState.events.some((e) => e.closedAtMs === null);
      if (aAlert !== bAlert) return aAlert ? -1 : 1;
      return a.meta.nickname.localeCompare(b.meta.nickname, 'he');
    });

    const allAlertEvents = Object.values(state)
      .flatMap((s) => s.alertState.events.map((event) => ({ deviceId: s.deviceId, event })))
      .sort((a, b) => b.event.openedAtMs - a.event.openedAtMs);

    return {
      sensors,
      getSensor: (deviceId) => state[deviceId],
      scan: () => transport.scan(),
      addSensor: async (deviceId, hardwareName) => {
        await transport.connect(deviceId);
        const paired = loadJSON<string[]>(PAIRED_DEVICES_KEY, []);
        saveJSON(PAIRED_DEVICES_KEY, Array.from(new Set([...paired, deviceId])));
        await wireUpDevice(deviceId, hardwareName, componentAliveToken);
      },
      removeSensor: async (deviceId) => {
        await transport.disconnect(deviceId);
        liveUnsubs.current.get(deviceId)?.();
        liveUnsubs.current.delete(deviceId);
        const paired = loadJSON<string[]>(PAIRED_DEVICES_KEY, []);
        saveJSON(PAIRED_DEVICES_KEY, paired.filter((id) => id !== deviceId));
      },
      updateMeta: (deviceId, meta) => dispatch({ type: 'META', deviceId, meta }),
      writeConfig: async (deviceId, config) => {
        await transport.writeConfig(deviceId, encodeConfig(config));
        dispatch({ type: 'CONFIG', deviceId, config });
      },
      allAlertEvents,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <SensorContext.Provider value={value}>{children}</SensorContext.Provider>;
}

const DEFAULT_PLACEHOLDER_CONFIG: SensorConfig = {
  highThresholdC: 40.0,
  highThresholdEnabled: true,
  lowThresholdC: 0.0,
  lowThresholdEnabled: false,
  rorThresholdCPerMin: 8.0,
  rorEnabled: true,
  rorWindowMinutes: 3,
  sampleRateSeconds: 5,
};

export function useSensorContext(): SensorContextValue {
  const ctx = useContext(SensorContext);
  if (!ctx) throw new Error('useSensorContext must be used within SensorProvider');
  return ctx;
}

export function useSensors(): SensorRuntime[] {
  return useSensorContext().sensors;
}

export function useSensor(deviceId: string | undefined): SensorRuntime | undefined {
  const { getSensor } = useSensorContext();
  return deviceId ? getSensor(deviceId) : undefined;
}
