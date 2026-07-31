import assert from 'node:assert/strict';
import test from 'node:test';

const verifier = await import('../scripts/mainnet-squads-verify.mjs');

const expectedMembers = [
  '5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9',
  '2UPEsHM9HCwxrfeyGun1Mx312yEktJe9jgF8PsuaTcHb',
  'ELrLeuWRUu4yFJfpwNwtxB41MFU3LLw2XGvbpmCbMKQ8',
];

function safeSnapshot(overrides = {}) {
  return {
    genesisHash: verifier.MAINNET_GENESIS_HASH,
    owner: verifier.SQUADS_PROGRAM_ID,
    multisig: verifier.MULTISIG_ADDRESS,
    vault: verifier.EXPECTED_VAULT_ADDRESS,
    threshold: 2,
    members: expectedMembers.map((key) => ({ key, permissionsMask: 7 })),
    ...overrides,
  };
}

test('pins the approved Mainnet Squads identities', () => {
  assert.equal(verifier.MULTISIG_ADDRESS, '1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5');
  assert.equal(verifier.EXPECTED_VAULT_ADDRESS, 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
  assert.deepEqual(verifier.EXPECTED_MEMBERS, expectedMembers);
});

test('accepts only the exact 2-of-3 setup with full member permissions', () => {
  assert.deepEqual(verifier.evaluateSquadsSnapshot(safeSnapshot()), []);
});

test('rejects wrong threshold, membership, permissions, owner, or vault', () => {
  assert.match(verifier.evaluateSquadsSnapshot(safeSnapshot({ threshold: 1 }))[0], /threshold/i);
  assert.match(
    verifier.evaluateSquadsSnapshot(safeSnapshot({
      members: safeSnapshot().members.slice(0, 2),
    }))[0],
    /members/i,
  );
  assert.match(
    verifier.evaluateSquadsSnapshot(safeSnapshot({
      members: safeSnapshot().members.map((member, index) => (
        index === 1 ? { ...member, permissionsMask: 2 } : member
      )),
    }))[0],
    /permissions/i,
  );
  assert.match(
    verifier.evaluateSquadsSnapshot(safeSnapshot({ owner: '11111111111111111111111111111111' }))[0],
    /owner/i,
  );
  assert.match(
    verifier.evaluateSquadsSnapshot(safeSnapshot({ vault: '11111111111111111111111111111111' }))[0],
    /vault/i,
  );
});
