import type { Clock } from '../ports/clock.port';

/** Advances only when the test calls `tick`. */
export class TestClock implements Clock {
  private current: Date;

  constructor(initial: string | Date) {
    this.current = typeof initial === 'string' ? new Date(initial) : initial;
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  tick(ms: number): Date {
    this.current = new Date(this.current.getTime() + ms);
    return this.now();
  }
}
