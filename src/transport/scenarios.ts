/**
 * Automatic temperature profiles the simulator can run against a device.
 * Each scenario is a pure function of elapsed virtual seconds -> °C, so it
 * can be sampled at any rate and is fully driven by the shared sim clock.
 */

export type ScenarioId = 'stable' | 'slow_heat' | 'sharp_fault' | 'cooling' | 'battery_drain';

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  stable: 'יציב',
  slow_heat: 'התחממות איטית',
  sharp_fault: 'תקלה חדה',
  cooling: 'התקררות',
  battery_drain: 'סוללה מתרוקנת',
};

export interface ScenarioContext {
  elapsedSeconds: number;
  startTempC: number;
}

/** Returns the target temperature in °C for a scenario at a point in time. */
export function scenarioTemperature(id: ScenarioId, ctx: ScenarioContext): number {
  const { elapsedSeconds, startTempC } = ctx;
  switch (id) {
    case 'stable': {
      const wobble = Math.sin(elapsedSeconds / 4) * 0.3;
      return 25 + wobble;
    }
    case 'slow_heat': {
      const target = startTempC + (1 / 60) * elapsedSeconds; // 1°C/min
      return Math.min(target, 55);
    }
    case 'sharp_fault': {
      // 22°C -> 70°C over 90 seconds, then holds.
      const start = 22;
      const end = 70;
      const durationSec = 90;
      const t = Math.min(elapsedSeconds / durationSec, 1);
      // ease-in so the first samples look calm before the spike, matching a
      // developing-fault narrative rather than an instant step.
      const eased = t * t;
      return start + (end - start) * eased;
    }
    case 'cooling': {
      const target = startTempC - (0.8 / 60) * elapsedSeconds;
      return Math.max(target, 24);
    }
    case 'battery_drain':
      return startTempC; // temperature unaffected; battery handled separately
    default:
      return startTempC;
  }
}

export function scenarioIsFinished(id: ScenarioId, elapsedSeconds: number): boolean {
  switch (id) {
    case 'slow_heat':
      return elapsedSeconds > 60 * 30 + 60;
    case 'sharp_fault':
      return elapsedSeconds > 180;
    case 'cooling':
      return elapsedSeconds > 60 * 30 + 60;
    case 'battery_drain':
      return elapsedSeconds > 100 * 10 + 10;
    case 'stable':
    default:
      return false;
  }
}
