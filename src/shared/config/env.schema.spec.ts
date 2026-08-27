import { validateEnv } from './env.schema';

const requiredEnv = {
  DATABASE_URL:
    'sqlserver://localhost:1433;database=x;user=sa;password=P@ssw0rd!;trustServerCertificate=true',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_SECRET: 'a'.repeat(48),
  LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
  LINE_CHANNEL_SECRET: 'line-secret',
};

describe('env.schema', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv({ ...requiredEnv });
    expect(env.APP_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(env.DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG).toBe(50_000_000n);
    expect(env.DEFAULT_OVER_TOLERANCE_BASIS_POINTS).toBe(500n);
  });

  it('throws with a field-named error when a required variable is missing', () => {
    const rest: Record<string, string> = { ...requiredEnv };
    delete rest['DATABASE_URL'];
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a JWT_SECRET shorter than 32 chars', () => {
    expect(() => validateEnv({ ...requiredEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() =>
      validateEnv({
        ...requiredEnv,
        PORT: 'not-a-number',
      }),
    ).toThrow(/PORT/);
  });

  it('parses PORT from a numeric string into a number', () => {
    const env = validateEnv({ ...requiredEnv, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('parses DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG into a bigint', () => {
    const env = validateEnv({
      ...requiredEnv,
      DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG: '999999999999',
    });
    expect(env.DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG).toBe(999_999_999_999n);
  });
});
