import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  decodeConfig,
  decodeDeviceInfo,
  decodeLiveReading,
  encodeConfig,
  encodeDeviceInfo,
  encodeLiveReading,
  type SensorConfig,
} from './protocol';

describe('Live Reading encode/decode', () => {
  it('round-trips a normal reading', () => {
    const bytes = encodeLiveReading({
      temperatureC: 24.6,
      humidityPct: 41.2,
      batteryPct: 88,
      sensorFault: false,
      sequence: 1234,
    });
    expect(bytes.byteLength).toBe(8);
    const decoded = decodeLiveReading(bytes);
    expect(decoded.temperatureC).toBeCloseTo(24.6, 5);
    expect(decoded.humidityPct).toBeCloseTo(41.2, 5);
    expect(decoded.batteryPct).toBe(88);
    expect(decoded.sensorFault).toBe(false);
    expect(decoded.sequence).toBe(1234);
  });

  it('round-trips negative temperatures near the low end of range', () => {
    const bytes = encodeLiveReading({
      temperatureC: -40,
      humidityPct: 0,
      batteryPct: 0,
      sensorFault: true,
      sequence: 0,
    });
    const decoded = decodeLiveReading(bytes);
    expect(decoded.temperatureC).toBeCloseTo(-40, 5);
    expect(decoded.sensorFault).toBe(true);
  });

  it('round-trips the top of the documented range', () => {
    const bytes = encodeLiveReading({
      temperatureC: 105.0,
      humidityPct: 100,
      batteryPct: 100,
      sensorFault: false,
      sequence: 65535,
    });
    const decoded = decodeLiveReading(bytes);
    expect(decoded.temperatureC).toBeCloseTo(105.0, 5);
    expect(decoded.sequence).toBe(65535);
  });

  it('wraps the sequence counter at 16 bits', () => {
    const bytes = encodeLiveReading({
      temperatureC: 20,
      humidityPct: 40,
      batteryPct: 50,
      sensorFault: false,
      sequence: 70000,
    });
    const decoded = decodeLiveReading(bytes);
    expect(decoded.sequence).toBe(70000 & 0xffff);
  });

  it('throws on a too-short payload', () => {
    expect(() => decodeLiveReading(new Uint8Array(4))).toThrow();
  });

  it('produces exactly the documented byte layout', () => {
    const bytes = encodeLiveReading({
      temperatureC: 10.0, // -> 100 (0x0064)
      humidityPct: 50.0, // -> 500 (0x01F4)
      batteryPct: 90, // 0x5A
      sensorFault: true, // bit0 set -> 0x01
      sequence: 300, // 0x012C
    });
    expect(bytesToHex(bytes)).toBe('64 00 F4 01 5A 01 2C 01');
  });
});

describe('Config encode/decode', () => {
  const sample: SensorConfig = {
    highThresholdC: 40.0,
    highThresholdEnabled: true,
    lowThresholdC: 0.0,
    lowThresholdEnabled: false,
    rorThresholdCPerMin: 8.0,
    rorEnabled: true,
    rorWindowMinutes: 3,
    sampleRateSeconds: 5,
  };

  it('round-trips the default configuration', () => {
    const bytes = encodeConfig(sample);
    expect(bytes.byteLength).toBe(10);
    expect(decodeConfig(bytes)).toEqual(sample);
  });

  it('round-trips all flag combinations', () => {
    const variant: SensorConfig = {
      ...sample,
      highThresholdEnabled: false,
      lowThresholdEnabled: true,
      rorEnabled: false,
    };
    const decoded = decodeConfig(encodeConfig(variant));
    expect(decoded.highThresholdEnabled).toBe(false);
    expect(decoded.lowThresholdEnabled).toBe(true);
    expect(decoded.rorEnabled).toBe(false);
  });

  it('round-trips negative low threshold', () => {
    const variant: SensorConfig = { ...sample, lowThresholdC: -12.5, lowThresholdEnabled: true };
    const decoded = decodeConfig(encodeConfig(variant));
    expect(decoded.lowThresholdC).toBeCloseTo(-12.5, 5);
  });

  it('throws on a too-short payload', () => {
    expect(() => decodeConfig(new Uint8Array(3))).toThrow();
  });
});

describe('Device Info encode/decode', () => {
  it('round-trips name, serial and firmware version', () => {
    const info = { name: 'VOLTSAFE-4F2A', serialNumber: 'VS-4F2A99', firmwareVersion: '1.4.2' };
    const decoded = decodeDeviceInfo(encodeDeviceInfo(info));
    expect(decoded).toEqual(info);
  });

  it('round-trips Hebrew text in the name field', () => {
    const info = { name: 'לוח ראשי', serialNumber: 'VS-0001', firmwareVersion: '2.0.0' };
    const decoded = decodeDeviceInfo(encodeDeviceInfo(info));
    expect(decoded.name).toBe(info.name);
  });
});
