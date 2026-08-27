/* eslint-disable no-restricted-syntax */
// Test-only env seeding. Real infra values arrive via testcontainers in
// dedicated e2e specs (Phase 5); this file just satisfies the zod schema
// so AppModule boots for smoke tests.

process.env['APP_ENV'] ??= 'test';
process.env['DATABASE_URL'] ??=
  'sqlserver://localhost:1433;database=nestjs_api_template_test;user=sa;password=Test@Password123;trustServerCertificate=true';
process.env['REDIS_URL'] ??= 'redis://localhost:6379/1';
process.env['JWT_SECRET'] ??=
  'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['LINE_CHANNEL_ACCESS_TOKEN'] ??= 'test-line-channel-access-token';
process.env['LINE_CHANNEL_SECRET'] ??= 'test-line-channel-secret';
