import { DomainError } from '../../../../shared/errors';

/**
 * A single ability rule loaded from Role.permissionsJson.
 * Matches the shape CASL AbilityBuilder consumes.
 */
export interface PermissionRule {
  readonly action: string;
  readonly subject: string;
  readonly inverted?: boolean;
}

export class InvalidPermissionRuleError extends DomainError {
  readonly code = 'AUTH.INVALID_PERMISSION_RULE';
}

/** Runtime validation of JSON-loaded rules; rejects malformed shapes early. */
export function parsePermissionsJson(raw: string): readonly PermissionRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InvalidPermissionRuleError(
      `permissionsJson is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidPermissionRuleError('permissionsJson must be an array');
  }
  return parsed.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new InvalidPermissionRuleError(
        `entry ${String(i)} is not an object`,
      );
    }
    const rec = entry as Record<string, unknown>;
    const action = rec['action'];
    const subject = rec['subject'];
    if (typeof action !== 'string' || action.length === 0) {
      throw new InvalidPermissionRuleError(
        `entry ${String(i)}.action must be a non-empty string`,
      );
    }
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new InvalidPermissionRuleError(
        `entry ${String(i)}.subject must be a non-empty string`,
      );
    }
    const inverted = rec['inverted'];
    return {
      action,
      subject,
      inverted: typeof inverted === 'boolean' ? inverted : undefined,
    };
  });
}
