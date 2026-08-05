import { MockBleTransport } from './MockBleTransport';

/**
 * Single shared transport instance for the whole demo. The `app/` package
 * only ever calls the plain `VoltsafeTransport` methods on it; only
 * `simulator/` reaches for the extra simulator-only control surface
 * (`setTemperature`, `runScenario`, `onTraffic`, ...). Swapping this for a
 * real transport later means changing this one file.
 */
export const transport = new MockBleTransport();
