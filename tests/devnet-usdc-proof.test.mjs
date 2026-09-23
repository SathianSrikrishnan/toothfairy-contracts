import assert from 'node:assert/strict';
import test from 'node:test';

const proofModule = await import('../scripts/devnet-usdc-proof.mjs').catch(() => ({}));

test('pins the proof flow to TFN devnet and canonical Circle USDC', () => {
  assert.equal(proofModule.PROGRAM_ID, 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
  assert.equal(proofModule.USDC_MINT, '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  assert.equal(proofModule.DEVNET_RPC, 'https://api.devnet.solana.com');
});

test('rejects a proof RPC that is not Solana devnet', () => {
  assert.equal(typeof proofModule.assertDevnetRpc, 'function');
  assert.throws(() => proofModule.assertDevnetRpc('https://api.mainnet-beta.solana.com'), /devnet/i);
  assert.doesNotThrow(() => proofModule.assertDevnetRpc('https://api.devnet.solana.com'));
});

test('calculates the exact two-percent fee and net USDC units', () => {
  assert.equal(typeof proofModule.calculateDepositSplit, 'function');
  assert.deepEqual(proofModule.calculateDepositSplit(1_250_000n), {
    grossUnits: 1_250_000n,
    feeUnits: 25_000n,
    netUnits: 1_225_000n,
  });
});

test('derives the deployed config and token-config addresses', () => {
  assert.equal(typeof proofModule.deriveProgramAddresses, 'function');
  const addresses = proofModule.deriveProgramAddresses();
  assert.equal(addresses.config, '44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X');
  assert.equal(addresses.tokenConfig, '8xRT3sCyveZaFhoGgtsn8ZvTx4YwxDYSZuCs9gfdH6UM');
  assert.equal(addresses.treasury, 'BnJcGtas4pJh9JBEqrYLb7ze3HzeEDAcCctsiYeZfyR3');
});

test('derives deterministic proof accounts for a known child wallet', () => {
  assert.equal(typeof proofModule.deriveProofAddresses, 'function');
  const addresses = proofModule.deriveProofAddresses(
    '5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq',
  );

  assert.equal(addresses.childProfile, 'AB7RrpFtNJsJ5zMa39kJoaGtaCg56LR8pkVWMGATkGNp');
  assert.equal(addresses.milestone, '4gRpUjMJXLzg9mP4HPG6ffkAhs76JR7qbADTma7vy3C8');
  assert.equal(addresses.tokenMilestone, '88p3u9PfyiSqBq7Mjs4dR3441yxNQcR9NKSXCwvKJZvk');
  assert.equal(addresses.tokenDeposit, 'AzSaLowfcFS4pngD83JJzV5pWHqntyd38ugf4SgBjm9E');
});

test('builds a devnet explorer receipt URL', () => {
  assert.equal(typeof proofModule.explorerUrl, 'function');
  assert.equal(
    proofModule.explorerUrl('example-signature'),
    'https://explorer.solana.com/tx/example-signature?cluster=devnet',
  );
});

test('derives the legacy SOL deposit receipt without changing its seed layout', () => {
  assert.equal(typeof proofModule.deriveSolDepositAddress, 'function');
  assert.equal(
    proofModule.deriveSolDepositAddress('4gRpUjMJXLzg9mP4HPG6ffkAhs76JR7qbADTma7vy3C8'),
    '7vKcyvMHoGcVMb8zuNJh6z7SjsMW3uMXfcfoXbmYc49G',
  );
});

test('recognizes only state 1 with an empty vault as a completed claim', () => {
  assert.equal(typeof proofModule.isCompletedTokenClaim, 'function');
  assert.equal(proofModule.isCompletedTokenClaim(0n, 1), true);
  assert.equal(proofModule.isCompletedTokenClaim(0n, 2), false);
  assert.equal(proofModule.isCompletedTokenClaim(1n, 1), false);
});
