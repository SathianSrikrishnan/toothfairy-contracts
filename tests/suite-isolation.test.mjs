import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('reuses the shared local config when the SOL regression suite initialized it first', async () => {
  const source = await readFile(new URL('./usdc-escrow-v2.ts', import.meta.url), 'utf8');

  assert.match(source, /fetchNullable\(configPda\)/);
  assert.match(source, /existingConfig/);
  assert.match(source, /existingConfig\.authority\.equals\(guardian\)/);
});
