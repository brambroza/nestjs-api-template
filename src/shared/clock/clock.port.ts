export const CLOCK = Symbol('CLOCK');

/** Time source. Anywhere the code would otherwise call `new Date()`. */
export interface Clock {
  now(): Date;
}
