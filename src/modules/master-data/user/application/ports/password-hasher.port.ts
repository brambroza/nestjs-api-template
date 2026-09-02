export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * Abstracted so we can swap scrypt for argon2/bcrypt without touching
 * use cases. `verify` returns true/false — no throw on mismatch so the
 * caller controls the timing side-channel via constant-time compare.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}
