import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const profile = JSON.parse(readFileSync(join(root, '.quality/config.json')));
function fixture(t, ids) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-quality-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.quality'));
  for (const file of ['run.mjs', 'hook.mjs', 'builtin.mjs', 'manifest.json', 'native.mjs']) {
    copyFileSync(join(root, '.quality', file), join(dir, '.quality', file));
  }
  copyFileSync(join(root, '.oxlintrc.json'), join(dir, '.oxlintrc.json'));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.quality-local/\n');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, types: [] }, include: ['sample.ts'] }));
  writeFileSync(join(dir, '.quality/config.json'), JSON.stringify({ ...profile, checks: profile.checks.filter(c => ids.includes(c.id)), coverage: [] }));
  for (const args of [['init', '-q'], ['config', 'user.name', 'Quality fixture'], ['config', 'user.email', 'quality@example.invalid'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  }
  return dir;
}
function run(dir, level) {
  const child = spawnSync(process.execPath, ['.quality/run.mjs', level, '--json'], { cwd: dir, encoding: 'utf8', env: process.env });
  assert.ifError(child.error);
  return { code: child.status, report: child.stdout.trim() ? JSON.parse(child.stdout) : null, error: child.stderr };
}
test('fast detects an actual Oxlint violation and passes the restored source', t => {
  const dir = fixture(t, ['lint-changed']);
  writeFileSync(join(dir, 'sample.ts'), 'debugger;\n');
  assert.equal(run(dir, 'fast').report.checks[0].status, 'failed');
  writeFileSync(join(dir, 'sample.ts'), 'export const answer = 42;\n');
  assert.equal(run(dir, 'fast').code, 0);
});
test('affected detects a TypeScript regression and missing local compiler', t => {
  const dir = fixture(t, ['types']);
  writeFileSync(join(dir, 'sample.ts'), 'export const answer: string = 42;\n');
  assert.equal(run(dir, 'affected').report.checks[0].status, 'failed');
  writeFileSync(join(dir, 'sample.ts'), 'export const answer: string = "42";\n');
  assert.equal(run(dir, 'affected').code, 0);
  rmSync(join(dir, 'node_modules'));
  assert.notEqual(run(dir, 'affected').code, 0);
});
test('native Bun discovery rejects missing/empty suites and real failed assertions', t => {
  const dir = fixture(t, ['unit']);
  assert.notEqual(run(dir, 'gate').code, 0);
  mkdirSync(join(dir, 'tests'));
  assert.notEqual(run(dir, 'gate').code, 0);
  const suite = join(dir, 'tests/sample.test.ts');
  writeFileSync(suite, 'import {test, expect} from "bun:test"; test("quality regression", () => expect(1).toBe(2));\n');
  assert.equal(run(dir, 'gate').report.checks[0].status, 'failed');
  writeFileSync(suite, 'import {test, expect} from "bun:test"; test("module5 passes validation", () => expect(1).toBe(1));\n');
  const result = run(dir, 'gate');
  assert.equal(result.code, 0);
  assert.equal(result.report.checks[0].testCount, 1);
});
test('managed runtime drift fails before any check can pass', t => {
  const dir = fixture(t, ['unit']);
  writeFileSync(join(dir, '.quality/run.mjs'), readFileSync(join(dir, '.quality/run.mjs'), 'utf8') + '\n// drift\n');
  const result = run(dir, 'gate');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Standard drift/);
});
