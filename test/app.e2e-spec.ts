import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';

/**
 * Compile-only smoke — proves the DI graph resolves without needing a
 * live MSSQL/Redis. Phase 5 replaces this with testcontainers-backed
 * e2e that actually calls `init()` and exercises the golden path.
 */
describe('AppModule compile (smoke)', () => {
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it('compiles the module graph', () => {
    expect(moduleFixture).toBeDefined();
  });
});
