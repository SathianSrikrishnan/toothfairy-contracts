import assert from 'node:assert/strict';
import test from 'node:test';

const preflight = await import('../scripts/mainnet-usdc-preflight.mjs');

test('pins the release to Solana mainnet and canonical Circle USDC', () => {
  assert.equal(preflight.PROGRAM_ID, 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
  assert.equal(preflight.MAINNET_GENESIS_HASH, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  assert.equal(preflight.CANONICAL_USDC_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(preflight.CANONICAL_USDC_DECIMALS, 6);
});

test('rejects any cluster that is not Solana mainnet', () => {
  assert.doesNotThrow(() => preflight.assertMainnetGenesisHash(preflight.MAINNET_GENESIS_HASH));
  assert.throws(() => preflight.assertMainnetGenesisHash('devnet-genesis'), /mainnet/i);
});

test('parses an upgradeable program and its authority without trusting CLI text', () => {
  const programDataAddress = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const programAccount = Buffer.alloc(36);
  programAccount.writeUInt32LE(2, 0);
  Buffer.from(programDataAddress).copy(programAccount, 4);

  const authority = Uint8Array.from({ length: 32 }, (_, index) => 100 + index);
  const programDataAccount = Buffer.alloc(45);
  programDataAccount.writeUInt32LE(3, 0);
  programDataAccount.writeBigUInt64LE(42n, 4);
  programDataAccount.writeUInt8(1, 12);
  Buffer.from(authority).copy(programDataAccount, 13);

  assert.deepEqual(preflight.parseUpgradeableProgram(programAccount), {
    programDataAddress: new preflight.PublicKey(programDataAddress).toBase58(),
  });
  assert.deepEqual(preflight.parseProgramData(programDataAccount), {
    slot: 42n,
    upgradeAuthority: new preflight.PublicKey(authority).toBase58(),
  });
});

test('reports release blockers instead of silently accepting unsafe authority state', () => {
  const expectedAuthority = '5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq';
  const safeSnapshot = {
    genesisHash: preflight.MAINNET_GENESIS_HASH,
    programExecutable: true,
    upgradeAuthority: expectedAuthority,
    canonicalMint: preflight.CANONICAL_USDC_MINT,
    mintDecimals: 6,
    configAuthority: expectedAuthority,
    treasuryAuthority: expectedAuthority,
    tokenConfig: null,
  };

  assert.deepEqual(preflight.evaluatePredeployReadiness(safeSnapshot, expectedAuthority), []);
  assert.match(
    preflight.evaluatePredeployReadiness(
      { ...safeSnapshot, upgradeAuthority: '11111111111111111111111111111111' },
      expectedAuthority,
    )[0],
    /upgrade authority/i,
  );
  assert.match(
    preflight.evaluatePredeployReadiness(
      { ...safeSnapshot, tokenConfig: { allowedMint: 'wrong', decimals: 6 } },
      expectedAuthority,
    )[0],
    /token config/i,
  );
});
