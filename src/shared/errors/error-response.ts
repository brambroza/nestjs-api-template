/**
 * The single shape every error response carries. Kept exported so
 * controllers can type their `@ApiResponse` bodies against it and so
 * external clients (LINE OA proxy, admin console, etc.) parse a stable
 * contract instead of shape-shifting Nest/Node defaults.
 */
export interface ErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly messageTh: string;
  readonly details?: Record<string, unknown>;
  readonly requestId: string;
  readonly timestamp: string;
}
