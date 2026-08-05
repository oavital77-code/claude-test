import { describe, expect, it } from 'vitest';
import {
  ALERT_SEVERITY,
  activeAlertTypes,
  applySample,
  createInitialState,
  mostSevereActiveAlert,
  tick,
  type AlertEngineConfig,
  type AlertEngineState,
  type Sample,
} from './alertEngine';

const BASE_CONFIG: AlertEngineConfig = {
  highThresholdC: 40.0,
  highThresholdEnabled: true,
  lowThresholdC: 0.0,
  lowThresholdEnabled: false,
  rorThresholdCPerMin: 8.0,
  rorEnabled: true,
  rorWindowMinutes: 3,
  sampleRateSeconds: 5,
};

const T0 = 1_000_000;

function sample(offsetMs: number, temperatureC: number, extra: Partial<Sample> = {}): Sample {
  return {
    timestampMs: T0 + offsetMs,
    temperatureC,
    batteryPct: 90,
    sensorFault: false,
    ...extra,
  };
}

function feed(
  state: AlertEngineState,
  samples: Sample[],
  config: AlertEngineConfig = BASE_CONFIG,
): AlertEngineState {
  return samples.reduce((s, sm) => applySample(s, sm, config), state);
}

describe('ALARM_HIGH (6.1)', () => {
  it('does not fire on a single sample above threshold', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 41), BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('ALARM_HIGH');
  });

  it('fires after two consecutive samples at or above threshold', () => {
    let state = createInitialState();
    state = feed(state, [sample(0, 41), sample(5000, 41)]);
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');
  });

  it('resets the consecutive counter on a dip below threshold', () => {
    let state = createInitialState();
    state = feed(state, [sample(0, 41), sample(5000, 39), sample(10000, 41)]);
    expect(activeAlertTypes(state)).not.toContain('ALARM_HIGH');
  });

  it('does not fire at all when the high threshold is disabled', () => {
    const config: AlertEngineConfig = { ...BASE_CONFIG, highThresholdEnabled: false };
    let state = createInitialState();
    state = feed(state, [sample(0, 90), sample(5000, 95)], config);
    expect(activeAlertTypes(state)).not.toContain('ALARM_HIGH');
  });

  it('closes only after dropping 2C below threshold and dwelling 60s', () => {
    let state = createInitialState();
    state = feed(state, [sample(0, 41), sample(5000, 41)]);
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');

    // Drops below threshold but not 2C below yet -> stays open.
    state = applySample(state, sample(10000, 39), BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');

    // Drops 2C below (<=38) but hasn't dwelled 60s -> still open.
    state = applySample(state, sample(15000, 37), BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');

    // 60s later, still below the close margin -> closes.
    state = applySample(state, sample(15000 + 60_000, 37), BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('ALARM_HIGH');
  });

  it('cancels the dwell timer if temperature climbs back up before 60s', () => {
    let state = createInitialState();
    state = feed(state, [sample(0, 41), sample(5000, 41)]);
    state = applySample(state, sample(10000, 37), BASE_CONFIG); // below close margin, dwell starts
    state = applySample(state, sample(30000, 39), BASE_CONFIG); // back above close margin -> dwell cancelled
    state = applySample(state, sample(10000 + 60_000, 39), BASE_CONFIG); // 60s from original dwell start
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');
  });
});

describe('ALARM_ROR (6.2) — independent of absolute temperature', () => {
  it('fires on a sharp rise even while far below the high threshold', () => {
    // 20C -> 45C over 2 minutes = 12.5C/min >= 8C/min threshold, well under 40C high threshold.
    let state = createInitialState();
    state = feed(state, [
      sample(0, 20),
      sample(30_000, 26),
      sample(60_000, 32),
      sample(90_000, 38),
      sample(120_000, 45),
    ]);
    expect(activeAlertTypes(state)).toContain('ALARM_ROR');
    expect(activeAlertTypes(state)).not.toContain('ALARM_HIGH');
  });

  it('does not fire for a slow, gradual rise', () => {
    // 1C/min, far under the 8C/min threshold.
    let state = createInitialState();
    let t = 0;
    let temp = 20;
    for (let i = 0; i < 10; i++) {
      state = applySample(state, sample(t, temp), BASE_CONFIG);
      t += 30_000;
      temp += 0.5;
    }
    expect(activeAlertTypes(state)).not.toContain('ALARM_ROR');
  });

  it('only looks within the configured rolling window', () => {
    const config: AlertEngineConfig = { ...BASE_CONFIG, rorWindowMinutes: 1 };
    let state = createInitialState();
    // Rises 20C over 4 minutes overall (5C/min average) but the last 1-minute
    // window only captures a slow 1C rise, so it should not trigger.
    state = feed(
      state,
      [
        sample(0, 20),
        sample(60_000, 25),
        sample(120_000, 30),
        sample(180_000, 35),
        sample(240_000, 36),
      ],
      config,
    );
    expect(activeAlertTypes(state)).not.toContain('ALARM_ROR');
  });

  it('closes when the rate drops below half the threshold', () => {
    // Short 1-minute window makes the arithmetic easy to follow: ramp up
    // fast enough to open ALARM_ROR, then hold flat so that as the old
    // steep samples age out of the window the computed rate falls, closing
    // the alert once it drops under half the threshold (4C/min).
    const config: AlertEngineConfig = { ...BASE_CONFIG, rorWindowMinutes: 1 };
    let state = createInitialState();
    state = feed(
      state,
      [sample(0, 20), sample(15_000, 25), sample(30_000, 30), sample(45_000, 35), sample(60_000, 40)],
      config,
    );
    expect(activeAlertTypes(state)).toContain('ALARM_ROR');

    // Hold flat at 40C: the window's oldest sample keeps advancing while
    // its temperature climbs toward 40 too, so the implied rate decays.
    state = applySample(state, sample(75_000, 40), config); // rate ~15
    expect(activeAlertTypes(state)).toContain('ALARM_ROR');
    state = applySample(state, sample(90_000, 40), config); // rate ~10
    expect(activeAlertTypes(state)).toContain('ALARM_ROR');
    state = applySample(state, sample(105_000, 40), config); // rate ~5
    expect(activeAlertTypes(state)).toContain('ALARM_ROR');
    state = applySample(state, sample(120_000, 40), config); // rate 0 -> closes
    expect(activeAlertTypes(state)).not.toContain('ALARM_ROR');
  });

  it('does not fire at all when RoR is disabled', () => {
    const config: AlertEngineConfig = { ...BASE_CONFIG, rorEnabled: false };
    let state = createInitialState();
    state = feed(
      state,
      [sample(0, 20), sample(30_000, 26), sample(60_000, 32), sample(90_000, 38), sample(120_000, 45)],
      config,
    );
    expect(activeAlertTypes(state)).not.toContain('ALARM_ROR');
  });
});

describe('ALARM_LOW (6.3)', () => {
  it('is off by default even at extreme low temperatures', () => {
    let state = createInitialState();
    state = feed(state, [sample(0, -20), sample(5000, -20)]);
    expect(activeAlertTypes(state)).not.toContain('ALARM_LOW');
  });

  it('fires after two consecutive samples at or below threshold when enabled', () => {
    const config: AlertEngineConfig = { ...BASE_CONFIG, lowThresholdC: 5, lowThresholdEnabled: true };
    let state = createInitialState();
    state = feed(state, [sample(0, 3), sample(5000, 3)], config);
    expect(activeAlertTypes(state)).toContain('ALARM_LOW');
  });
});

describe('System alerts (6.5)', () => {
  it('LINK_LOST fires after 3x the sample interval with no measurement', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 25), BASE_CONFIG);
    state = tick(state, T0 + 3 * BASE_CONFIG.sampleRateSeconds * 1000, BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('LINK_LOST');
  });

  it('LINK_LOST does not fire before the 3x interval has elapsed', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 25), BASE_CONFIG);
    state = tick(state, T0 + 2 * BASE_CONFIG.sampleRateSeconds * 1000, BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('LINK_LOST');
  });

  it('LINK_LOST clears as soon as a new measurement arrives', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 25), BASE_CONFIG);
    state = tick(state, T0 + 20_000, BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('LINK_LOST');
    state = applySample(state, sample(21_000, 25), BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('LINK_LOST');
  });

  it('LOW_BATTERY fires under 15% and clears at or above it', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 25, { batteryPct: 10 }), BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('LOW_BATTERY');
    state = applySample(state, sample(5000, 25, { batteryPct: 20 }), BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('LOW_BATTERY');
  });

  it('SENSOR_FAULT tracks the fault bit directly', () => {
    let state = createInitialState();
    state = applySample(state, sample(0, 25, { sensorFault: true }), BASE_CONFIG);
    expect(activeAlertTypes(state)).toContain('SENSOR_FAULT');
    state = applySample(state, sample(5000, 25, { sensorFault: false }), BASE_CONFIG);
    expect(activeAlertTypes(state)).not.toContain('SENSOR_FAULT');
  });
});

describe('Severity ranking (6.6)', () => {
  it('reports the most severe alert when several are active at once', () => {
    let state = createInitialState();
    state = applySample(
      state,
      sample(0, 25, { batteryPct: 10, sensorFault: true }),
      BASE_CONFIG,
    );
    // LOW_BATTERY (info) and SENSOR_FAULT (warning) active -> warning wins.
    expect(mostSevereActiveAlert(state)).toBe('SENSOR_FAULT');

    state = feed(state, [
      sample(5000, 41, { batteryPct: 10, sensorFault: true }),
      sample(10000, 41, { batteryPct: 10, sensorFault: true }),
    ]);
    // ALARM_HIGH (critical) now also active -> critical wins over warning/info.
    expect(activeAlertTypes(state)).toContain('ALARM_HIGH');
    const winner = mostSevereActiveAlert(state);
    expect(winner).not.toBeNull();
    expect(ALERT_SEVERITY[winner!]).toBe('critical');
  });

  it('returns null when nothing is active', () => {
    const state = createInitialState();
    expect(mostSevereActiveAlert(state)).toBeNull();
  });
});
