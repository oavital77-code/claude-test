/**
 * VOLTSAFE GATT protocol — PLACEHOLDER / TEMPORARY.
 *
 * Every UUID, byte layout and field defined in this file is an invention of
 * this demo, made up in the absence of a real specification from the sensor
 * manufacturer. When the manufacturer's spec arrives, only this file (and
 * its companion in `protocol/deviceInfo.ts`) should need to change — no
 * other part of the app should ever import raw byte offsets directly.
 *
 * Open questions tracked against the manufacturer are listed in the top
 * level spec document, section 12.
 */

export const VOLTSAFE_SERVICE_UUID = '0000fe80-0000-1000-8000-00805f9b34fb';

export const CHARACTERISTIC_UUIDS = {
  liveReading: '0000fe81-0000-1000-8000-00805f9b34fb',
  config: '0000fe82-0000-1000-8000-00805f9b34fb',
  deviceInfo: '0000fe83-0000-1000-8000-00805f9b34fb',
} as const;

export type CharacteristicKey = keyof typeof CHARACTERISTIC_UUIDS;

// ---------------------------------------------------------------------------
// Live Reading — 8 bytes, little endian
// ---------------------------------------------------------------------------

export interface LiveReading {
  /** Degrees Celsius, one decimal place of precision. */
  temperatureC: number;
  /** Relative humidity percentage, one decimal place of precision. */
  humidityPct: number;
  /** Battery charge, 0-100. */
  batteryPct: number;
  /** True when the sensor's own fault bit is set. */
  sensorFault: boolean;
  /** Rolling measurement counter, used to detect dropped packets. */
  sequence: number;
}

export const LIVE_READING_BYTE_LENGTH = 8;

export function encodeLiveReading(reading: LiveReading): Uint8Array {
  const buf = new ArrayBuffer(LIVE_READING_BYTE_LENGTH);
  const view = new DataView(buf);
  view.setInt16(0, Math.round(reading.temperatureC * 10), true);
  view.setUint16(2, Math.round(reading.humidityPct * 10), true);
  view.setUint8(4, Math.round(reading.batteryPct));
  view.setUint8(5, reading.sensorFault ? 0b0000_0001 : 0);
  view.setUint16(6, reading.sequence & 0xffff, true);
  return new Uint8Array(buf);
}

export function decodeLiveReading(bytes: Uint8Array): LiveReading {
  if (bytes.byteLength < LIVE_READING_BYTE_LENGTH) {
    throw new Error(
      `Live Reading payload too short: expected ${LIVE_READING_BYTE_LENGTH} bytes, got ${bytes.byteLength}`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const statusFlags = view.getUint8(5);
  return {
    temperatureC: view.getInt16(0, true) / 10,
    humidityPct: view.getUint16(2, true) / 10,
    batteryPct: view.getUint8(4),
    sensorFault: (statusFlags & 0b0000_0001) !== 0,
    sequence: view.getUint16(6, true),
  };
}

// ---------------------------------------------------------------------------
// Config — 10 bytes, little endian
// ---------------------------------------------------------------------------

export interface SensorConfig {
  highThresholdC: number;
  highThresholdEnabled: boolean;
  lowThresholdC: number;
  lowThresholdEnabled: boolean;
  rorThresholdCPerMin: number;
  rorEnabled: boolean;
  rorWindowMinutes: number;
  sampleRateSeconds: number;
}

export const CONFIG_BYTE_LENGTH = 10;

const CONFIG_FLAG_HIGH_ENABLED = 0b0000_0001;
const CONFIG_FLAG_LOW_ENABLED = 0b0000_0010;
const CONFIG_FLAG_ROR_ENABLED = 0b0000_0100;

export function encodeConfig(config: SensorConfig): Uint8Array {
  const buf = new ArrayBuffer(CONFIG_BYTE_LENGTH);
  const view = new DataView(buf);
  view.setInt16(0, Math.round(config.highThresholdC * 10), true);
  view.setInt16(2, Math.round(config.lowThresholdC * 10), true);
  let flags = 0;
  if (config.highThresholdEnabled) flags |= CONFIG_FLAG_HIGH_ENABLED;
  if (config.lowThresholdEnabled) flags |= CONFIG_FLAG_LOW_ENABLED;
  if (config.rorEnabled) flags |= CONFIG_FLAG_ROR_ENABLED;
  view.setUint8(4, flags);
  view.setUint8(5, Math.round(config.rorThresholdCPerMin * 10));
  view.setUint8(6, Math.round(config.rorWindowMinutes));
  view.setUint8(7, Math.round(config.sampleRateSeconds));
  view.setUint16(8, 0, true); // reserved
  return new Uint8Array(buf);
}

export function decodeConfig(bytes: Uint8Array): SensorConfig {
  if (bytes.byteLength < CONFIG_BYTE_LENGTH) {
    throw new Error(
      `Config payload too short: expected ${CONFIG_BYTE_LENGTH} bytes, got ${bytes.byteLength}`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint8(4);
  return {
    highThresholdC: view.getInt16(0, true) / 10,
    lowThresholdC: view.getInt16(2, true) / 10,
    highThresholdEnabled: (flags & CONFIG_FLAG_HIGH_ENABLED) !== 0,
    lowThresholdEnabled: (flags & CONFIG_FLAG_LOW_ENABLED) !== 0,
    rorEnabled: (flags & CONFIG_FLAG_ROR_ENABLED) !== 0,
    rorThresholdCPerMin: view.getUint8(5) / 10,
    rorWindowMinutes: view.getUint8(6),
    sampleRateSeconds: view.getUint8(7),
  };
}

// ---------------------------------------------------------------------------
// Device Info — variable length
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  name: string;
  serialNumber: string;
  firmwareVersion: string; // e.g. "1.4.2"
}

export function encodeDeviceInfo(info: DeviceInfo): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(info.name).slice(0, 255);
  const serialBytes = encoder.encode(info.serialNumber).slice(0, 255);
  const [major = 0, minor = 0, patch = 0] = info.firmwareVersion.split('.').map(Number);

  const out = new Uint8Array(1 + nameBytes.length + 1 + serialBytes.length + 3);
  let offset = 0;
  out[offset++] = nameBytes.length;
  out.set(nameBytes, offset);
  offset += nameBytes.length;
  out[offset++] = serialBytes.length;
  out.set(serialBytes, offset);
  offset += serialBytes.length;
  out[offset++] = major & 0xff;
  out[offset++] = minor & 0xff;
  out[offset++] = patch & 0xff;
  return out;
}

export function decodeDeviceInfo(bytes: Uint8Array): DeviceInfo {
  const decoder = new TextDecoder();
  let offset = 0;
  const nameLen = bytes[offset++];
  const name = decoder.decode(bytes.slice(offset, offset + nameLen));
  offset += nameLen;
  const serialLen = bytes[offset++];
  const serialNumber = decoder.decode(bytes.slice(offset, offset + serialLen));
  offset += serialLen;
  const [major, minor, patch] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]];
  return {
    name,
    serialNumber,
    firmwareVersion: `${major}.${minor}.${patch}`,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by the traffic log)
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}
