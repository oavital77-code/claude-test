/**
 * The single boundary between the app and "hardware". The app is never
 * allowed to know whether it is talking to a real BLE sensor or to the
 * simulator — everything crosses this interface as raw bytes.
 *
 * Today the only implementation is `MockBleTransport`. A future
 * `WebBleTransport` (Web Bluetooth) or `FlutterBleTransport` implements the
 * exact same interface and nothing else in the app changes.
 */

export type ConnState = 'connected' | 'connecting' | 'disconnected';

export interface DiscoveredDevice {
  deviceId: string;
  name: string;
  rssi: number;
}

export interface VoltsafeTransport {
  scan(): Promise<DiscoveredDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  readConfig(deviceId: string): Promise<Uint8Array>;
  writeConfig(deviceId: string, payload: Uint8Array): Promise<void>;
  readDeviceInfo(deviceId: string): Promise<Uint8Array>;
  subscribeLive(deviceId: string, cb: (raw: Uint8Array) => void): () => void;
  onConnectionChange(cb: (deviceId: string, state: ConnState) => void): () => void;
}
