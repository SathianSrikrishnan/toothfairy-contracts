import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/mainnet-usdc-admin.mjs', import.meta.url));

test('mainnet admin command is dry-run by default', () => {
  const result = spawnSync(process.execPath, [script, '--action', 'pause'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.action, 'pause');
  assert.equal(output.programId, 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
});

test('mainnet admin execution requires the exact release acknowledgement', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--action',
    'pause',
    '--execute',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TFN_MAINNET_EXECUTE: '' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TFN_MAINNET_EXECUTE=I_UNDERSTAND/);
});

test('authority migration dry-run is pinned to the verified Squads vault', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--action',
    'migrate-authorities',
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.action, 'migrate-authorities');
  assert.equal(
    output.newAuthority,
    'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko',
  );
  assert.deepEqual(output.accounts, {
    config: '44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X',
    treasury: 'BnJcGtas4pJh9JBEqrYLb7ze3HzeEDAcCctsiYeZfyR3',
  });
});

test('authority migration execution requires the exact release acknowledgement', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--action',
    'migrate-authorities',
    '--execute',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TFN_MAINNET_EXECUTE: '' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TFN_MAINNET_EXECUTE=I_UNDERSTAND/);
});
