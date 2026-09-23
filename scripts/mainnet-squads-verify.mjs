import * as multisig from '@sqds/multisig';
import { Connection, PublicKey } from '@solana/web3.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const SQUADS_PROGRAM_ID = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf';
export const MULTISIG_ADDRESS = '1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5';
export const EXPECTED_VAULT_ADDRESS = 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko';
export const EXPECTED_MEMBERS = [
  '5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9',
  '2UPEsHM9HCwxrfeyGun1Mx312yEktJe9jgF8PsuaTcHb',
  'ELrLeuWRUu4yFJfpwNwtxB41MFU3LLw2XGvbpmCbMKQ8',
];
const REQUIRED_PERMISSION_MASK = 7;

export function evaluateSquadsSnapshot(snapshot) {
  const blockers = [];
  if (snapshot.genesisHash !== MAINNET_GENESIS_HASH) blockers.push('RPC is not Solana mainnet.');
  if (snapshot.owner !== SQUADS_PROGRAM_ID) blockers.push('Multisig account owner is not the official Squads V4 program.');
  if (snapshot.multisig !== MULTISIG_ADDRESS) blockers.push('Multisig address does not match the approved account.');
  if (snapshot.vault !== EXPECTED_VAULT_ADDRESS) blockers.push('Derived Squads vault does not match the approved vault.');
  if (snapshot.threshold !== 2) blockers.push('Squads threshold is not exactly 2.');

  const actualKeys = snapshot.members.map(({ key }) => key).sort();
  const expectedKeys = [...EXPECTED_MEMBERS].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    blockers.push('Squads members are not exactly Signers A, B, and C.');
  }
  if (snapshot.members.some(({ permissionsMask }) => permissionsMask !== REQUIRED_PERMISSION_MASK)) {
    blockers.push('One or more Squads members lack full initiate, vote, and execute permissions.');
  }
  return blockers;
}

function numberValue(value) {
  if (typeof value === 'bigint' || typeof value === 'number') return value.toString();
  if (value && typeof value.toString === 'function') return value.toString();
  throw new Error('Unexpected Squads numeric field');
}

async function fetchSnapshot(rpcUrl) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  const multisigPda = new PublicKey(MULTISIG_ADDRESS);
  const accountInfo = await connection.getAccountInfo(multisigPda, 'confirmed');
  if (!accountInfo) throw new Error('Squads multisig account was not found');

  const account = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda,
    'confirmed',
  );
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const vaultInfo = await connection.getAccountInfo(vaultPda, 'confirmed');

  return {
    genesisHash,
    owner: accountInfo.owner.toBase58(),
    multisig: multisigPda.toBase58(),
    configAuthority: account.configAuthority.toBase58(),
    threshold: account.threshold,
    timeLockSeconds: account.timeLock,
    transactionIndex: numberValue(account.transactionIndex),
    staleTransactionIndex: numberValue(account.staleTransactionIndex),
    members: account.members.map((member) => ({
      key: member.key.toBase58(),
      permissionsMask: member.permissions.mask,
    })),
    vault: vaultPda.toBase58(),
    vaultOwner: vaultInfo?.owner.toBase58() ?? null,
    vaultLamports: vaultInfo?.lamports ?? null,
  };
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  const snapshot = await fetchSnapshot(process.env.TFN_MAINNET_RPC_URL || MAINNET_RPC);
  const blockers = evaluateSquadsSnapshot(snapshot);
  console.log(json({
    mode: 'read-only-mainnet-squads-verification',
    snapshot,
    blockers,
    verifiedTwoOfThree: blockers.length === 0,
  }));
  if (blockers.length > 0) process.exitCode = 1;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
