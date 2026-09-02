import { ScryptPasswordHasher } from './scrypt-password-hasher';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('produces a different hash each time (salt is fresh)', async () => {
    const a = await hasher.hash('secret');
    const b = await hasher.hash('secret');
    expect(a).not.toBe(b);
  });

  it('verify returns true for the original password', async () => {
    const stored = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('correct horse battery staple', stored)).toBe(
      true,
    );
  });

  it('verify returns false for a wrong password', async () => {
    const stored = await hasher.hash('right');
    expect(await hasher.verify('wrong', stored)).toBe(false);
  });

  it('verify returns false for a malformed stored hash', async () => {
    expect(await hasher.verify('anything', 'not-a-valid-hash')).toBe(false);
    expect(await hasher.verify('anything', 'aa:bb')).toBe(false); // right shape, wrong length
    expect(await hasher.verify('anything', '')).toBe(false);
  });
});
