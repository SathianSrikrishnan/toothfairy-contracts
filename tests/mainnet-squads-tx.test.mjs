import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

const script = fileURLToPath(new URL('../scripts/mainnet-squads-tx.mjs', import.meta.url));
const vault = 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko';
const programId = 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC';
const canonicalUsdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const fixedBlockhash = '11111111111111111111111111111111';

function generate(action) {
  const result = spawnSync(process.execPath, [
    script,
    '--action',
    action,
    '--blockhash',
    fixedBlockhash,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function decode(output) {
  const bytes = bs58.decode(output.base58Transaction);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), output.sha256);
  return VersionedTransaction.deserialize(bytes).message;
}

test('builds a pinned unsigned canonical-USDC initialization for the Squads vault', () => {
  const output = generate('initialize-usdc');
  const message = decode(output);
  const keys = message.staticAccountKeys.map((key) => key.toBase58());
  const instruction = message.compiledInstructions[0];

  assert.equal(output.cluster, 'mainnet-beta');
  assert.equal(output.action, 'initialize-usdc');
  assert.equal(output.vault, vault);
  assert.equal(output.allowedMint, canonicalUsdc);
  assert.equal(output.decimals, 6);
  assert.equal(message.staticAccountKeys[0].toBase58(), vault);
  assert.equal(keys[instruction.programIdIndex], programId);
  assert.ok(keys.includes(canonicalUsdc));
  assert.deepEqual([...instruction.data], [60, 14, 114, 86, 25, 84, 93, 149]);
  assert.equal(message.header.numRequiredSignatures, 1);
  assert.equal(new PublicKey(keys[0]).toBase58(), vault);
});

test('builds separate pinned pause and unpause transactions', () => {
  const pause = generate('pause');
  const unpause = generate('unpause');
  const pauseInstruction = decode(pause).compiledInstructions[0];
  const unpauseInstruction = decode(unpause).compiledInstructions[0];

  assert.deepEqual([...pauseInstruction.data], [211, 22, 221, 251, 74, 121, 193, 47]);
  assert.deepEqual([...unpauseInstruction.data], [169, 144, 4, 38, 10, 141, 188, 255]);
  assert.notEqual(pause.base58Transaction, unpause.base58Transaction);
});

test('rejects unsupported actions', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--action',
    'arbitrary-call',
    '--blockhash',
    fixedBlockhash,
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supported actions/);
});
