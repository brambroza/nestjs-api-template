import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import type { PasswordHasher } from '../application/ports/password-hasher.port';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_LEN = 16;
const KEY_LEN = 32;

/**
 * Node built-in scrypt password hasher — no native compilation, no
 * extra dependency. Format: `<salt-hex>:<key-hex>`. Swap for argon2id
 * (`@node-rs/argon2`) if you want the stronger algorithm; the port
 * stays the same and the hash column widens (200 -> 400 is enough).
 *
 * `verify` uses timingSafeEqual so a wrong-length or wrong-byte match
 * takes the same time as a correct one.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const key = await scrypt(plaintext, salt, KEY_LEN);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
  }

  async verify(plaintext: string, stored: string): Promise<boolean> {
    const [saltHex, keyHex] = stored.split(':');
    if (!saltHex || !keyHex) return false;
    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(saltHex, 'hex');
      expected = Buffer.from(keyHex, 'hex');
    } catch {
      return false;
    }
    if (expected.length !== KEY_LEN) return false;
    const actual = await scrypt(plaintext, salt, KEY_LEN);
    return timingSafeEqual(actual, expected);
  }
}
