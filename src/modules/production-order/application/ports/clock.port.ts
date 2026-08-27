export const CLOCK = Symbol('CLOCK');

/** Time source injected everywhere the domain would otherwise call `new Date()`. */
export interface Clock {
  now(): Date;
}
