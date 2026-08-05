/**
 * Pure alert engine. No side effects, no timers, no I/O — every function
 * here takes the previous state plus new information and returns the next
 * state. Callers (the live-reading subscription in app state, or a test)
 * are responsible for calling `applySample` on every measurement and
 * `tick` on a regular clock so link-loss can be detected even when no
 * measurements are arriving at all.
 */

export type AlertType =
  | 'ALARM_HIGH'
  | 'ALARM_ROR'
  | 'ALARM_LOW'
  | 'LINK_LOST'
  | 'SENSOR_FAULT'
  | 'LOW_BATTERY';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export const ALERT_SEVERITY: Record<AlertType, AlertSeverity> = {
  ALARM_HIGH: 'critical',
  ALARM_ROR: 'critical',
  ALARM_LOW: 'critical',
  LINK_LOST: 'warning',
  SENSOR_FAULT: 'warning',
  LOW_BATTERY: 'info',
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 3, warning: 2, info: 1 };

export interface AlertEngineConfig {
  highThresholdC: number;
  highThresholdEnabled: boolean;
  lowThresholdC: number;
  lowThresholdEnabled: boolean;
  rorThresholdCPerMin: number;
  rorEnabled: boolean;
  rorWindowMinutes: number;
  sampleRateSeconds: number;
}

export interface Sample {
  timestampMs: number;
  temperatureC: number;
  batteryPct: number;
  sensorFault: boolean;
}

export interface AlertEvent {
  id: number;
  type: AlertType;
  openedAtMs: number;
  closedAtMs: number | null;
  /** Temperature at the moment the alert opened. Not applicable to all types. */
  temperatureAtOpenC: number | null;
  /** Most extreme temperature seen while the alert was open. */
  extremeTemperatureC: number | null;
}

interface OpenAlertTracking {
  event: AlertEvent;
  /** ms timestamp since the close condition became true, or null if not currently true. */
  closeConditionSinceMs: number | null;
}

export interface AlertEngineState {
  /** Rolling window of recent samples, trimmed to the RoR window each update. */
  window: Sample[];
  consecutiveHighCount: number;
  consecutiveLowCount: number;
  lastMeasurementAtMs: number | null;
  open: Partial<Record<AlertType, OpenAlertTracking>>;
  events: AlertEvent[];
  nextEventId: number;
}

export function createInitialState(): AlertEngineState {
  return {
    window: [],
    consecutiveHighCount: 0,
    consecutiveLowCount: 0,
    lastMeasurementAtMs: null,
    open: {},
    events: [],
    nextEventId: 1,
  };
}

const HIGH_LOW_CLOSE_MARGIN_C = 2;
const HIGH_LOW_CLOSE_DWELL_MS = 60_000;
const CONSECUTIVE_SAMPLES_TO_OPEN = 2;

/** Process one new measurement. Returns a new state; never mutates the input. */
export function applySample(
  state: AlertEngineState,
  sample: Sample,
  config: AlertEngineConfig,
): AlertEngineState {
  let next: AlertEngineState = {
    ...state,
    window: [...state.window, sample],
    open: { ...state.open },
    events: state.events,
    lastMeasurementAtMs: sample.timestampMs,
  };

  // Trim the rolling window to the RoR lookback so it stays cheap and
  // memory-bounded regardless of how long the sensor has been connected.
  const windowStartMs = sample.timestampMs - config.rorWindowMinutes * 60_000;
  next.window = next.window.filter((s) => s.timestampMs >= windowStartMs);

  next = evaluateAbsoluteThreshold(next, sample, config, 'high');
  next = evaluateAbsoluteThreshold(next, sample, config, 'low');
  next = evaluateRateOfRise(next, sample, config);
  next = evaluateSensorFault(next, sample);
  next = evaluateLowBattery(next, sample);

  // A measurement just arrived, so the link is alive by definition.
  next = closeAlert(next, 'LINK_LOST', sample.timestampMs);

  return next;
}

/**
 * Call on a regular wall-clock cadence (independent of measurements) so
 * link loss can be detected even when nothing is arriving at all, and so
 * hysteresis dwell timers can close alarms even between samples.
 */
export function tick(state: AlertEngineState, nowMs: number, config: AlertEngineConfig): AlertEngineState {
  let next = state;

  if (state.lastMeasurementAtMs !== null) {
    const silenceMs = nowMs - state.lastMeasurementAtMs;
    const linkLostThresholdMs = 3 * config.sampleRateSeconds * 1000;
    if (silenceMs >= linkLostThresholdMs) {
      next = openAlert(next, 'LINK_LOST', nowMs, null);
    }
  }

  next = maybeCloseByDwell(next, 'ALARM_HIGH', nowMs);
  next = maybeCloseByDwell(next, 'ALARM_LOW', nowMs);

  return next;
}

// ---------------------------------------------------------------------------
// 6.1 / 6.3 — Absolute thresholds (high critical, low informational-off-by-default)
// ---------------------------------------------------------------------------

function evaluateAbsoluteThreshold(
  state: AlertEngineState,
  sample: Sample,
  config: AlertEngineConfig,
  which: 'high' | 'low',
): AlertEngineState {
  const enabled = which === 'high' ? config.highThresholdEnabled : config.lowThresholdEnabled;
  const threshold = which === 'high' ? config.highThresholdC : config.lowThresholdC;
  const alertType: AlertType = which === 'high' ? 'ALARM_HIGH' : 'ALARM_LOW';
  const countKey = which === 'high' ? 'consecutiveHighCount' : 'consecutiveLowCount';

  if (!enabled) {
    return { ...state, [countKey]: 0, ...closeAlertPatch(state, alertType, sample.timestampMs) };
  }

  const breached = which === 'high' ? sample.temperatureC >= threshold : sample.temperatureC <= threshold;
  let next = state;

  if (!state.open[alertType]) {
    const count = breached ? state[countKey] + 1 : 0;
    next = { ...next, [countKey]: count };
    if (count >= CONSECUTIVE_SAMPLES_TO_OPEN) {
      next = openAlert(next, alertType, sample.timestampMs, sample.temperatureC);
      next = { ...next, [countKey]: 0 };
    }
  } else {
    next = updateExtreme(next, alertType, sample.temperatureC, which === 'high' ? 'max' : 'min');
    const closeConditionNow =
      which === 'high'
        ? sample.temperatureC <= threshold - HIGH_LOW_CLOSE_MARGIN_C
        : sample.temperatureC >= threshold + HIGH_LOW_CLOSE_MARGIN_C;
    next = updateDwell(next, alertType, closeConditionNow, sample.timestampMs);
    next = maybeCloseByDwell(next, alertType, sample.timestampMs);
  }

  return next;
}

// ---------------------------------------------------------------------------
// 6.2 — Rate of rise, independent of absolute temperature
// ---------------------------------------------------------------------------

function evaluateRateOfRise(
  state: AlertEngineState,
  sample: Sample,
  config: AlertEngineConfig,
): AlertEngineState {
  if (!config.rorEnabled) {
    return closeAlertState(state, 'ALARM_ROR', sample.timestampMs);
  }

  if (state.window.length < 2) return state;

  const oldest = state.window[0];
  const elapsedMinutes = (sample.timestampMs - oldest.timestampMs) / 60_000;
  if (elapsedMinutes <= 0) return state;

  const rate = (sample.temperatureC - oldest.temperatureC) / elapsedMinutes;
  let next = state;

  if (!state.open.ALARM_ROR) {
    if (rate >= config.rorThresholdCPerMin) {
      next = openAlert(next, 'ALARM_ROR', sample.timestampMs, sample.temperatureC);
    }
  } else {
    next = updateExtreme(next, 'ALARM_ROR', sample.temperatureC, 'max');
    if (rate < config.rorThresholdCPerMin / 2) {
      next = closeAlertState(next, 'ALARM_ROR', sample.timestampMs);
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// 6.5 — System alerts
// ---------------------------------------------------------------------------

function evaluateSensorFault(state: AlertEngineState, sample: Sample): AlertEngineState {
  if (sample.sensorFault) {
    return openAlert(state, 'SENSOR_FAULT', sample.timestampMs, null);
  }
  return closeAlertState(state, 'SENSOR_FAULT', sample.timestampMs);
}

const LOW_BATTERY_THRESHOLD_PCT = 15;

function evaluateLowBattery(state: AlertEngineState, sample: Sample): AlertEngineState {
  if (sample.batteryPct < LOW_BATTERY_THRESHOLD_PCT) {
    return openAlert(state, 'LOW_BATTERY', sample.timestampMs, null);
  }
  return closeAlertState(state, 'LOW_BATTERY', sample.timestampMs);
}

// ---------------------------------------------------------------------------
// Shared open/close/dwell helpers
// ---------------------------------------------------------------------------

function openAlert(
  state: AlertEngineState,
  type: AlertType,
  atMs: number,
  temperatureC: number | null,
): AlertEngineState {
  if (state.open[type]) return state;
  const event: AlertEvent = {
    id: state.nextEventId,
    type,
    openedAtMs: atMs,
    closedAtMs: null,
    temperatureAtOpenC: temperatureC,
    extremeTemperatureC: temperatureC,
  };
  return {
    ...state,
    nextEventId: state.nextEventId + 1,
    open: { ...state.open, [type]: { event, closeConditionSinceMs: null } },
    events: [...state.events, event],
  };
}

function closeAlertState(state: AlertEngineState, type: AlertType, atMs: number): AlertEngineState {
  const patch = closeAlertPatch(state, type, atMs);
  return Object.keys(patch).length ? { ...state, ...patch } : state;
}

function closeAlert(state: AlertEngineState, type: AlertType, atMs: number): AlertEngineState {
  return closeAlertState(state, type, atMs);
}

function closeAlertPatch(
  state: AlertEngineState,
  type: AlertType,
  atMs: number,
): Partial<AlertEngineState> {
  const tracking = state.open[type];
  if (!tracking) return {};
  const closedEvent: AlertEvent = { ...tracking.event, closedAtMs: atMs };
  const open = { ...state.open };
  delete open[type];
  return {
    open,
    events: state.events.map((e) => (e.id === closedEvent.id ? closedEvent : e)),
  };
}

function updateExtreme(
  state: AlertEngineState,
  type: AlertType,
  temperatureC: number,
  direction: 'max' | 'min',
): AlertEngineState {
  const tracking = state.open[type];
  if (!tracking) return state;
  const current = tracking.event.extremeTemperatureC;
  const isMoreExtreme =
    current === null || (direction === 'max' ? temperatureC > current : temperatureC < current);
  if (!isMoreExtreme) return state;
  const event = { ...tracking.event, extremeTemperatureC: temperatureC };
  return {
    ...state,
    open: { ...state.open, [type]: { ...tracking, event } },
    events: state.events.map((e) => (e.id === event.id ? event : e)),
  };
}

function updateDwell(
  state: AlertEngineState,
  type: AlertType,
  conditionNow: boolean,
  atMs: number,
): AlertEngineState {
  const tracking = state.open[type];
  if (!tracking) return state;
  const closeConditionSinceMs = conditionNow ? (tracking.closeConditionSinceMs ?? atMs) : null;
  return { ...state, open: { ...state.open, [type]: { ...tracking, closeConditionSinceMs } } };
}

function maybeCloseByDwell(state: AlertEngineState, type: AlertType, nowMs: number): AlertEngineState {
  const tracking = state.open[type];
  if (!tracking || tracking.closeConditionSinceMs === null) return state;
  if (nowMs - tracking.closeConditionSinceMs >= HIGH_LOW_CLOSE_DWELL_MS) {
    return closeAlertState(state, type, nowMs);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function activeAlertTypes(state: AlertEngineState): AlertType[] {
  return Object.keys(state.open) as AlertType[];
}

export function mostSevereActiveAlert(state: AlertEngineState): AlertType | null {
  const types = activeAlertTypes(state);
  if (types.length === 0) return null;
  return types.reduce((worst, t) =>
    SEVERITY_RANK[ALERT_SEVERITY[t]] > SEVERITY_RANK[ALERT_SEVERITY[worst]] ? t : worst,
  );
}

export function isAnyAlertActive(state: AlertEngineState): boolean {
  return activeAlertTypes(state).length > 0;
}
