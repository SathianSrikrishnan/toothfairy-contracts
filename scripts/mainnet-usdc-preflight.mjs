import anchor from '@coral-xyz/anchor';
import { getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { PublicKey };

export const PROGRAM_ID = 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC';
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
export const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CANONICAL_USDC_DECIMALS = 6;
export const CURRENT_SINGLE_AUTHORITY = '5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq';
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

export function assertMainnetGenesisHash(genesisHash) {
  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error(`Mainnet preflight refused cluster with genesis hash ${genesisHash}`);
  }
}

export function parseUpgradeableProgram(data) {
  if (!Buffer.isBuffer(data) || data.length < 36 || data.readUInt32LE(0) !== 2) {
    throw new Error('Program account is not an upgradeable-loader Program account');
  }
  return { programDataAddress: new PublicKey(data.subarray(4, 36)).toBase58() };
}

export function parseProgramData(data) {
  if (!Buffer.isBuffer(data) || data.length < 13 || data.readUInt32LE(0) !== 3) {
    throw new Error('ProgramData account has an unexpected layout');
  }
  const hasAuthority = data.readUInt8(12);
  if (hasAuthority !== 0 && hasAuthority !== 1) {
    throw new Error('ProgramData upgrade-authority option is invalid');
  }
  if (hasAuthority === 1 && data.length < 45) {
    throw new Error('ProgramData account is missing its upgrade authority');
  }
  return {
    slot: data.readBigUInt64LE(4),
    upgradeAuthority: hasAuthority === 1
      ? new PublicKey(data.subarray(13, 45)).toBase58()
      : null,
  };
}

export function deriveProgramAddresses() {
  const programId = new PublicKey(PROGRAM_ID);
  const derive = (seed) => PublicKey.findProgramAddressSync(
    [Buffer.from(seed)],
    programId,
  )[0].toBase58();
  return {
    config: derive('config'),
    tokenConfig: derive('token_config'),
    treasury: derive('treasury'),
  };
}

export function evaluatePredeployReadiness(snapshot, expectedAuthority) {
  const blockers = [];
  if (snapshot.genesisHash !== MAINNET_GENESIS_HASH) blockers.push('RPC is not Solana mainnet.');
  if (!snapshot.programExecutable) blockers.push('Program account is missing or not executable.');
  if (snapshot.upgradeAuthority !== expectedAuthority) blockers.push('Program upgrade authority does not match the approved release authority.');
  if (snapshot.canonicalMint !== CANONICAL_USDC_MINT || snapshot.mintDecimals !== CANONICAL_USDC_DECIMALS) {
    blockers.push('Canonical Circle USDC mint or decimals do not match the release allowlist.');
  }
  if (snapshot.configAuthority !== expectedAuthority) blockers.push('Config authority does not match the approved release authority.');
  if (snapshot.treasuryAuthority !== expectedAuthority) blockers.push('Treasury authority does not match the approved release authority.');
  if (snapshot.tokenConfig && (
    snapshot.tokenConfig.allowedMint !== CANONICAL_USDC_MINT
    || snapshot.tokenConfig.decimals !== CANONICAL_USDC_DECIMALS
    || snapshot.tokenConfig.authority !== expectedAuthority
  )) {
    blockers.push('Existing token config is not the approved canonical-USDC configuration.');
  }
  return blockers;
}

async function fetchSnapshot(rpcUrl) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  assertMainnetGenesisHash(genesisHash);

  const programId = new PublicKey(PROGRAM_ID);
  const programInfo = await connection.getAccountInfo(programId, 'confirmed');
  if (!programInfo) throw new Error('Mainnet program account was not found');
  if (!programInfo.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    throw new Error(`Program is owned by unexpected loader ${programInfo.owner.toBase58()}`);
  }
  const { programDataAddress } = parseUpgradeableProgram(programInfo.data);
  const programDataInfo = await connection.getAccountInfo(new PublicKey(programDataAddress), 'confirmed');
  if (!programDataInfo) throw new Error('ProgramData account was not found');
  const programData = parseProgramData(programDataInfo.data);

  const mint = await getMint(
    connection,
    new PublicKey(CANONICAL_USDC_MINT),
    'confirmed',
    TOKEN_PROGRAM_ID,
  );

  const idlPath = path.resolve('target', 'idl', 'toothfairy_escrow.json');
  const idl = JSON.parse(await readFile(idlPath, 'utf8'));
  if (idl.address !== PROGRAM_ID) throw new Error(`IDL address ${idl.address} does not match ${PROGRAM_ID}`);
  const readOnlyWallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, readOnlyWallet, { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);
  const addresses = deriveProgramAddresses();
  const [config, treasury, tokenConfig] = await Promise.all([
    program.account.config.fetchNullable(new PublicKey(addresses.config)),
    program.account.treasury.fetchNullable(new PublicKey(addresses.treasury)),
    program.account.tokenConfig.fetchNullable(new PublicKey(addresses.tokenConfig)),
  ]);

  return {
    genesisHash,
    programId: PROGRAM_ID,
    programExecutable: programInfo.executable,
    programDataAddress,
    lastDeploySlot: programData.slot,
    upgradeAuthority: programData.upgradeAuthority,
    canonicalMint: CANONICAL_USDC_MINT,
    mintDecimals: mint.decimals,
    addresses,
    configAuthority: config?.authority?.toBase58() ?? null,
    treasuryAuthority: treasury?.authority?.toBase58() ?? null,
    tokenConfig: tokenConfig ? {
      authority: tokenConfig.authority.toBase58(),
      allowedMint: tokenConfig.allowedMint.toBase58(),
      decimals: tokenConfig.decimals,
    } : null,
  };
}

function json(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
}

async function main() {
  const rpcUrl = process.env.TFN_MAINNET_RPC_URL || MAINNET_RPC;
  const expectedAuthority = process.env.TFN_EXPECTED_RELEASE_AUTHORITY || CURRENT_SINGLE_AUTHORITY;
  const snapshot = await fetchSnapshot(rpcUrl);
  const blockers = evaluatePredeployReadiness(snapshot, expectedAuthority);
  console.log(json({
    mode: 'read-only-mainnet-preflight',
    expectedAuthority,
    snapshot,
    blockers,
    readyForMultisigMigration: blockers.length === 0,
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
