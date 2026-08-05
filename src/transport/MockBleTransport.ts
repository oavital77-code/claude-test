import {
  bytesToHex,
  CHARACTERISTIC_UUIDS,
  decodeConfig,
  encodeConfig,
  encodeDeviceInfo,
  encodeLiveReading,
  type SensorConfig,
} from '../protocol';
import { simClock } from './simClock';
import { scenarioIsFinished, scenarioTemperature, type ScenarioId } from './scenarios';
import type { ConnState, DiscoveredDevice, VoltsafeTransport } from './VoltsafeTransport';

export interface TrafficLogEntry {
  id: number;
  timestamp: number; // real wall-clock ms, for the log's own display clock
  direction: 'in' | 'out';
  kind: 'NOTIFY' | 'READ' | 'WRITE';
  characteristic: keyof typeof CHARACTERISTIC_UUIDS;
  deviceId: string;
  bytes: Uint8Array;
  hex: string;
}

export interface SimDeviceSnapshot {
  deviceId: string;
  name: string;
  serialNumber: string;
  firmwareVersion: string;
  connState: ConnState;
  rssi: number;
  temperatureC: number;
  humidityPct: number;
  batteryPct: number;
  fault: boolean;
  scenario: ScenarioId | null;
  config: SensorConfig;
}

const DEFAULT_CONFIG: SensorConfig = {
  highThresholdC: 40.0,
  highThresholdEnabled: true,
  lowThresholdC: 0.0,
  lowThresholdEnabled: false,
  rorThresholdCPerMin: 8.0,
  rorEnabled: true,
  rorWindowMinutes: 3,
  sampleRateSeconds: 5,
};

interface InternalDevice {
  deviceId: string;
  name: string;
  serialNumber: string;
  firmwareVersion: string;
  rssi: number;
  connState: ConnState;
  discoverableOnly: boolean; // true = not yet "known"/paired, appears in scan() until connected
  config: SensorConfig;
  temperatureC: number;
  humidityPct: number;
  batteryPct: number;
  fault: boolean;
  sequence: number;
  scenario: ScenarioId | null;
  scenarioStartVirtualMs: number;
  scenarioStartTempC: number;
  lastSampleVirtualMs: number;
  batteryDrainStep: number;
}

function seedDevice(partial: Partial<InternalDevice> & { deviceId: string; name: string }): InternalDevice {
  return {
    serialNumber: `VS-${partial.deviceId.slice(-6).toUpperCase()}`,
    firmwareVersion: '1.4.2',
    rssi: -55,
    connState: 'disconnected',
    discoverableOnly: true,
    config: { ...DEFAULT_CONFIG },
    temperatureC: 25,
    humidityPct: 40,
    batteryPct: 92,
    fault: false,
    sequence: 0,
    scenario: null,
    scenarioStartVirtualMs: 0,
    scenarioStartTempC: 25,
    lastSampleVirtualMs: 0,
    batteryDrainStep: 0,
    ...partial,
  };
}

let trafficLogId = 0;

/**
 * Simulated implementation of `VoltsafeTransport`. This class — and only
 * this class — is allowed to know that there is no real radio underneath.
 * It also exposes a control surface (temperature/humidity/battery/fault/
 * connection/scenario/speed setters, plus a traffic log) that only the
 * `simulator/` package is allowed to import; the `app/` package must only
 * ever see the plain `VoltsafeTransport` interface.
 */
export class MockBleTransport implements VoltsafeTransport {
  private devices = new Map<string, InternalDevice>();
  private liveListeners = new Map<string, Set<(raw: Uint8Array) => void>>();
  private connectionListeners = new Set<(deviceId: string, state: ConnState) => void>();
  private trafficListeners = new Set<(entry: TrafficLogEntry) => void>();
  private stopTick: () => void;

  constructor() {
    this.seedFleet();
    this.stopTick = simClock.onTick(() => this.tick());
  }

  private seedFleet() {
    const seeds: [string, string, Partial<InternalDevice>][] = [
      ['vs-001-main', 'VOLTSAFE-4F2A', { connState: 'connected', discoverableOnly: false, temperatureC: 24.6, batteryPct: 88 }],
      ['vs-002-genset', 'VOLTSAFE-9B71', { connState: 'connected', discoverableOnly: false, temperatureC: 31.2, batteryPct: 64 }],
      ['vs-003-panel3', 'VOLTSAFE-2C10', { connState: 'connected', discoverableOnly: false, temperatureC: 22.9, batteryPct: 12 }],
      ['vs-004-spare', 'VOLTSAFE-7E44', { rssi: -68 }],
      ['vs-005-spare', 'VOLTSAFE-A183', { rssi: -74 }],
    ];
    for (const [deviceId, name, partial] of seeds) {
      this.devices.set(deviceId, seedDevice({ deviceId, name, ...partial }));
    }
  }

  // -- VoltsafeTransport ----------------------------------------------------

  async scan(): Promise<DiscoveredDevice[]> {
    await delay(600);
    return [...this.devices.values()]
      .filter((d) => d.discoverableOnly)
      .map((d) => ({ deviceId: d.deviceId, name: d.name, rssi: d.rssi }));
  }

  async connect(deviceId: string): Promise<void> {
    const device = this.requireDevice(deviceId);
    device.connState = 'connecting';
    this.emitConnectionChange(deviceId, 'connecting');
    await delay(500);
    device.discoverableOnly = false;
    device.connState = 'connected';
    device.lastSampleVirtualMs = simClock.now();
    this.emitConnectionChange(deviceId, 'connected');
  }

  async disconnect(deviceId: string): Promise<void> {
    const device = this.requireDevice(deviceId);
    device.connState = 'disconnected';
    this.emitConnectionChange(deviceId, 'disconnected');
  }

  async readConfig(deviceId: string): Promise<Uint8Array> {
    const device = this.requireDevice(deviceId);
    await delay(150);
    const bytes = encodeConfig(device.config);
    this.logTraffic('in', 'READ', 'config', deviceId, bytes);
    return bytes;
  }

  async writeConfig(deviceId: string, payload: Uint8Array): Promise<void> {
    const device = this.requireDevice(deviceId);
    if (device.connState !== 'connected') {
      throw new Error('הכתיבה נכשלה: החיישן מנותק');
    }
    await delay(250);
    this.logTraffic('out', 'WRITE', 'config', deviceId, payload);
    const decoded = decodeConfig(payload);
    if (decoded.highThresholdC <= decoded.lowThresholdC) {
      throw new Error('הכתיבה נכשלה: הסף העליון חייב להיות גבוה מהתחתון');
    }
    device.config = decoded;
  }

  async readDeviceInfo(deviceId: string): Promise<Uint8Array> {
    const device = this.requireDevice(deviceId);
    await delay(150);
    const bytes = encodeDeviceInfo({
      name: device.name,
      serialNumber: device.serialNumber,
      firmwareVersion: device.firmwareVersion,
    });
    this.logTraffic('in', 'READ', 'deviceInfo', deviceId, bytes);
    return bytes;
  }

  subscribeLive(deviceId: string, cb: (raw: Uint8Array) => void): () => void {
    if (!this.liveListeners.has(deviceId)) this.liveListeners.set(deviceId, new Set());
    this.liveListeners.get(deviceId)!.add(cb);
    return () => this.liveListeners.get(deviceId)?.delete(cb);
  }

  onConnectionChange(cb: (deviceId: string, state: ConnState) => void): () => void {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
  }

  // -- Simulator-only control surface ---------------------------------------

  onTraffic(cb: (entry: TrafficLogEntry) => void): () => void {
    this.trafficListeners.add(cb);
    return () => this.trafficListeners.delete(cb);
  }

  listSnapshots(): SimDeviceSnapshot[] {
    return [...this.devices.values()].map((d) => this.toSnapshot(d));
  }

  setSpeed(speed: 1 | 10 | 60) {
    simClock.setSpeed(speed);
  }

  setTemperature(deviceId: string, tempC: number) {
    const d = this.requireDevice(deviceId);
    d.scenario = null;
    d.temperatureC = clamp(tempC, -40, 105);
  }

  setHumidity(deviceId: string, humidityPct: number) {
    const d = this.requireDevice(deviceId);
    d.humidityPct = clamp(humidityPct, 0, 100);
  }

  setBattery(deviceId: string, batteryPct: number) {
    const d = this.requireDevice(deviceId);
    d.batteryPct = clamp(batteryPct, 0, 100);
  }

  setFault(deviceId: string, fault: boolean) {
    const d = this.requireDevice(deviceId);
    d.fault = fault;
  }

  setRadioConnected(deviceId: string, connected: boolean) {
    const d = this.requireDevice(deviceId);
    if (connected) {
      d.discoverableOnly = false;
      d.connState = 'connected';
      d.lastSampleVirtualMs = simClock.now();
      this.emitConnectionChange(deviceId, 'connected');
    } else {
      d.connState = 'disconnected';
      this.emitConnectionChange(deviceId, 'disconnected');
    }
  }

  runScenario(deviceId: string, scenario: ScenarioId) {
    const d = this.requireDevice(deviceId);
    d.scenario = scenario;
    d.scenarioStartVirtualMs = simClock.now();
    d.scenarioStartTempC = d.temperatureC;
    d.batteryDrainStep = 0;
  }

  stopScenario(deviceId: string) {
    const d = this.requireDevice(deviceId);
    d.scenario = null;
  }

  // -- internals --------------------------------------------------------------

  private tick() {
    const now = simClock.now();
    for (const device of this.devices.values()) {
      this.advanceScenario(device, now);
      if (device.connState !== 'connected') continue;
      const intervalMs = Math.max(device.config.sampleRateSeconds, 1) * 1000;
      if (now - device.lastSampleVirtualMs >= intervalMs) {
        device.lastSampleVirtualMs = now;
        this.emitLiveReading(device);
      }
    }
  }

  private advanceScenario(device: InternalDevice, nowVirtualMs: number) {
    if (!device.scenario) return;
    const elapsedSeconds = (nowVirtualMs - device.scenarioStartVirtualMs) / 1000;

    if (device.scenario === 'battery_drain') {
      const step = Math.floor(elapsedSeconds / 10);
      if (step > device.batteryDrainStep) {
        device.batteryDrainStep = step;
        device.batteryPct = clamp(device.batteryPct - 1, 0, 100);
      }
    } else {
      device.temperatureC = scenarioTemperature(device.scenario, {
        elapsedSeconds,
        startTempC: device.scenarioStartTempC,
      });
    }

    if (scenarioIsFinished(device.scenario, elapsedSeconds)) {
      device.scenario = null;
    }
  }

  private emitLiveReading(device: InternalDevice) {
    device.sequence = (device.sequence + 1) & 0xffff;
    const bytes = encodeLiveReading({
      temperatureC: device.temperatureC,
      humidityPct: device.humidityPct,
      batteryPct: device.batteryPct,
      sensorFault: device.fault,
      sequence: device.sequence,
    });
    this.logTraffic('in', 'NOTIFY', 'liveReading', device.deviceId, bytes);
    this.liveListeners.get(device.deviceId)?.forEach((cb) => cb(bytes));
  }

  private emitConnectionChange(deviceId: string, state: ConnState) {
    this.connectionListeners.forEach((cb) => cb(deviceId, state));
  }

  private logTraffic(
    direction: 'in' | 'out',
    kind: TrafficLogEntry['kind'],
    characteristic: keyof typeof CHARACTERISTIC_UUIDS,
    deviceId: string,
    bytes: Uint8Array,
  ) {
    const entry: TrafficLogEntry = {
      id: ++trafficLogId,
      timestamp: Date.now(),
      direction,
      kind,
      characteristic,
      deviceId,
      bytes,
      hex: bytesToHex(bytes),
    };
    this.trafficListeners.forEach((cb) => cb(entry));
  }

  private requireDevice(deviceId: string): InternalDevice {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error(`Unknown device: ${deviceId}`);
    return device;
  }

  private toSnapshot(d: InternalDevice): SimDeviceSnapshot {
    return {
      deviceId: d.deviceId,
      name: d.name,
      serialNumber: d.serialNumber,
      firmwareVersion: d.firmwareVersion,
      connState: d.connState,
      rssi: d.rssi,
      temperatureC: d.temperatureC,
      humidityPct: d.humidityPct,
      batteryPct: d.batteryPct,
      fault: d.fault,
      scenario: d.scenario,
      config: d.config,
    };
  }

  dispose() {
    this.stopTick();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
