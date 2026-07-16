import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('defaults contract tooling to the matching Anchor version and localnet', async () => {
  const config = await readFile(new URL('../Anchor.toml', import.meta.url), 'utf8');

  assert.match(config, /anchor_version\s*=\s*"0\.30\.1"/);
  assert.match(config, /\[provider\][\s\S]*?cluster\s*=\s*"localnet"/);
});
