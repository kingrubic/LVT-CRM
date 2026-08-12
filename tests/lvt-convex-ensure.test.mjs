import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptUrl = new URL('../scripts/lvt-convex-ensure.sh', import.meta.url);
const script = await readFile(scriptUrl, 'utf8');
const validationEnd = script.indexOf('\nlog() {');

assert.notEqual(validationEnd, -1, 'could not isolate interval validation');

const validationPrelude = `${script.slice(0, validationEnd)}\nexit 0\n`;
const zshAvailable = spawnSync('zsh', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;

function validateInterval(value) {
  return spawnSync('zsh', ['-c', validationPrelude], {
    encoding: 'utf8',
    env: { ...process.env, LVT_CONVEX_ENSURE_INTERVAL: value },
  });
}

test('Convex ensure interval accepts only integers from 1 through 3600', { skip: zshAvailable ? false : 'zsh is required to execute lvt-convex-ensure.sh' }, () => {
  assert.doesNotMatch(validationPrelude, /=~\s*['"]/, 'zsh regex operand must not be quoted');

  for (const value of ['1', '20', '3600']) {
    const result = validateInterval(value);
    assert.equal(result.status, 0, `${value} was rejected: ${result.stderr}`);
  }

  for (const value of ['0', '3601', '1.5', 'abc']) {
    const result = validateInterval(value);
    assert.equal(result.status, 64, `${value} exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, /must be an integer from 1 to 3600 seconds/);
  }
});
