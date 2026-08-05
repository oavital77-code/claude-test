/**
 * A single shared virtual clock for the simulator. Real wall-clock
 * milliseconds are multiplied by a speed factor (1x / 10x / 60x) to advance
 * "sensor time" — this is what makes it possible to demo a 3-minute RoR
 * window in a few seconds during a live meeting.
 */

type Listener = () => void;

class SimClock {
  private speed = 1;
  private lastRealMs = Date.now();
  private virtualMs = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickListeners = new Set<Listener>();

  constructor() {
    this.start();
  }

  private start() {
    if (this.timer) return;
    this.lastRealMs = Date.now();
    this.timer = setInterval(() => this.tick(), 100);
  }

  private tick() {
    const now = Date.now();
    const deltaReal = now - this.lastRealMs;
    this.lastRealMs = now;
    this.virtualMs += deltaReal * this.speed;
    this.tickListeners.forEach((cb) => cb());
  }

  setSpeed(speed: 1 | 10 | 60) {
    this.speed = speed;
  }

  getSpeed(): number {
    return this.speed;
  }

  now(): number {
    return this.virtualMs;
  }

  onTick(cb: Listener): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }
}

export const simClock = new SimClock();
