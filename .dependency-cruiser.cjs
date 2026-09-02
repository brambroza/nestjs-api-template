/**
 * dependency-cruiser configuration
 *
 * Guards the hexagonal layout inside every feature module in src/modules/*:
 *
 *   domain         <- pure TypeScript, no framework, no ORM
 *   application    <- orchestrates domain, depends on ports (interfaces)
 *   infrastructure <- adapters that implement ports (Prisma repos, LINE HTTP)
 *   api            <- HTTP layer (controllers, DTOs, guards)
 *
 * Rules below match src paths only. Test files (spec files and the test/
 * directory) are exempted from most rules because a domain unit test may of
 * course import the domain code it is testing.
 *
 * Nested modules: some top-level folders are containers of sub-modules
 * (e.g. src/modules/master-data/customer). Every rule treats
 * `<container>/<sub>` as the module boundary, so customer/domain is
 * guarded exactly like production-order/domain, and customer must not
 * reach into vendor/application. Add a folder to CONTAINERS when you
 * introduce another such grouping.
 */

const CONTAINERS = ['master-data'];
const MODULE = `((?:(?:${CONTAINERS.join('|')})/)?[^/]+)`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-http-framework-in-domain',
      comment:
        'Domain layer must be framework-free: no @nestjs/common decorators, no HTTP concerns.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/domain(/|$)` },
      to: {
        path: [
          '^node_modules/@nestjs/(common|core|platform-express|platform-fastify|swagger|passport|jwt|throttler|terminus|schedule|bullmq|config|axios)',
        ],
      },
    },
    {
      name: 'no-orm-in-domain',
      comment: 'Domain must not know about the persistence technology.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/domain(/|$)` },
      to: {
        path: [
          '^node_modules/@prisma/client',
          '^node_modules/prisma(/|$)',
          '^node_modules/typeorm(/|$)',
          '^node_modules/@mikro-orm',
          '^node_modules/drizzle-orm',
          '^node_modules/mssql(/|$)',
          '^node_modules/tedious(/|$)',
        ],
      },
    },
    {
      name: 'domain-must-not-import-outward',
      comment:
        'Dependencies flow inward. domain -> application/infrastructure/api is forbidden.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/domain(/|$)` },
      to: { path: '^src/modules/$1/(application|infrastructure|api)(/|$)' },
    },
    {
      name: 'application-must-not-import-infra',
      comment:
        'Application depends on port interfaces, not on their infrastructure adapters.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/application(/|$)` },
      to: { path: '^src/modules/$1/(infrastructure|api)(/|$)' },
    },
    {
      name: 'api-must-not-import-infra',
      comment:
        'HTTP layer must go through application services, not skip into infrastructure.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/api(/|$)` },
      to: { path: '^src/modules/$1/infrastructure(/|$)' },
    },
    {
      name: 'no-cross-module-domain-reach',
      comment:
        'One module must not reach into another module domain directly. Use application ports or shared kernel. A container module file (e.g. master-data.module.ts) may import its own sub-modules.',
      severity: 'error',
      from: { path: `^src/modules/${MODULE}/` },
      to: {
        path: `^src/modules/(?!$1(/|$))${MODULE}/(domain|application|infrastructure)(/|$)`,
      },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies indicate a modelling problem.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Orphan modules are almost always dead code.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(cjs|js|mjs|ts)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)test/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
