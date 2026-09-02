export const LINE_MESSAGING = Symbol('LINE_MESSAGING');

export interface LinePushRequest {
  readonly to: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export type LinePushOutcome =
  | { readonly kind: 'sent' }
  | {
      readonly kind: 'transient';
      readonly reason: string;
      readonly status?: number;
    }
  | {
      readonly kind: 'permanent';
      readonly reason: string;
      readonly status?: number;
    };

/**
 * Abstract the LINE Messaging API so the worker can be unit-tested and
 * so the transport (undici, axios, mocked in tests) is swappable.
 * `idempotencyKey` MUST be forwarded to LINE as the `X-Line-Retry-Key`
 * header — ADR 0003 §2.2.4 relies on it for exactly-once delivery.
 */
export interface LineMessagingPort {
  push(request: LinePushRequest): Promise<LinePushOutcome>;
}
