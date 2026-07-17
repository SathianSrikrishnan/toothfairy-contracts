import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('defaults contract tooling to the matching Anchor version and localnet', async () => {
  const config = await readFile(new URL('../Anchor.toml', import.meta.url), 'utf8');

  assert.match(config, /anchor_version\s*=\s*"0\.30\.1"/);
  assert.match(config, /\[provider\][\s\S]*?cluster\s*=\s*"localnet"/);
  assert.match(
    config,
    /\[test\.validator\][\s\S]*?bind_address\s*=\s*"127\.0\.0\.1"/,
    'the local validator must not bind gossip to an unspecified address',
  );
});

test('pins the proc-macro API required by the Anchor 0.30 IDL builder', async () => {
  const lockfile = await readFile(new URL('../Cargo.lock', import.meta.url), 'utf8');
  assert.match(lockfile, /name = "proc-macro2"\nversion = "1\.0\.94"/);
  assert.match(lockfile, /name = "serde_json"\nversion = "1\.0\.140"/);
  assert.doesNotMatch(lockfile, /name = "zmij"/);
});
