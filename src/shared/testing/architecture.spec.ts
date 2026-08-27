import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Runs dependency-cruiser against src/ and fails the test suite on any
 * error-severity violation. dep-cruiser ships as ESM only; jest+ts-jest run
 * in CJS mode, so we shell out to the local CLI rather than fight the vm.
 * The truth we care about is the JSON output, not how it was produced.
 */
describe('architecture boundaries (dependency-cruiser)', () => {
  const REPO_ROOT = join(__dirname, '..', '..', '..');

  it('reports zero error-severity violations across src/', () => {
    const stdout = execFileSync(
      'npx',
      [
        '--no-install',
        'depcruise',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
        'src',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const parsed = JSON.parse(stdout) as {
      summary: {
        violations: Array<{
          rule: { severity: string; name: string };
          from: string;
          to: string;
        }>;
      };
    };

    const errors = parsed.summary.violations.filter(
      (v) => v.rule.severity === 'error',
    );

    if (errors.length > 0) {
      const rendered = errors
        .map((v) => `  [${v.rule.name}] ${v.from} -> ${v.to}`)
        .join('\n');
      throw new Error(`dependency-cruiser found forbidden edges:\n${rendered}`);
    }
  }, 60_000);
});
