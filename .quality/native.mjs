import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.argv[2] === 'toolchain') {
  for (const [command, expected] of [['bun', '1.3.8'], ['npm', '11.12.1']]) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8', env: process.env });
    if (result.error || result.status !== 0 || result.stdout.trim() !== expected) {
      console.error(`Required ${command} ${expected}; install the CI toolchain before checking.`);
      process.exit(1);
    }
  }
  console.log('Bun 1.3.8 and npm 11.12.1 verified');
  process.exit(0);
}
if (process.argv[2] !== 'unit') throw new Error('Expected unit');
const files = readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort().map(name => `./tests/${name}`);
if (!files.length) throw new Error('No unit/integration test suites discovered in tests/');
const child = spawnSync('bun', ['test', ...files], { stdio: 'inherit', env: process.env });
if (child.error) throw child.error;
process.exit(child.status ?? 1);
