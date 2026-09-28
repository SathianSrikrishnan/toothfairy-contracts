// "Grow it" rails: one Squads transaction on Eu4B (instant) that allowlists JitoSOL (Solana, staked) and jlUSDC
// (Dollars, growing) on the asset rails at 0%, exactly as mainnet-squads-coins.mjs did for Dollars/Bitcoin/Solana
// (Squads tx 5). The Squads vault is the config authority and pays the two AssetConfig accounts (~0.0013 SOL each).
//   node scripts/mainnet-squads-grow-rails.mjs                    print the unsigned transaction to import into Squads
//   node scripts/mainnet-squads-grow-rails.mjs --simulate         simulate it against the live program
//   node scripts/mainnet-squads-grow-rails.mjs --verify-proposal  check the latest Squads vault transaction is exactly this (read-only)
//   node scripts/mainnet-squads-grow-rails.mjs --verify           read the two configs back from chain
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

const RPC = process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
const MULTISIG = new PublicKey('1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5');
const SQUADS_VAULT = new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
const INITIALIZE_ASSET_CONFIG = [201, 180, 166, 88, 111, 8, 150, 205];
const RAILS = [
  { rail: 'solana-staked (JitoSOL)', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, minUnits: 1_000_000n }, // 0.001 JitoSOL
  { rail: 'dollars-growing (jlUSDC)', mint: '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', decimals: 6, minUnits: 10_000n }, // 0.01 jlUSDC
];
const derive = (...seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const config = derive(Buffer.from('config'));
const assetConfig = mint => derive(Buffer.from('asset_config'), new PublicKey(mint).toBuffer());

function instruction({ mint, minUnits }) {
  const data = Buffer.alloc(8 + 8 + 2);
  Buffer.from(INITIALIZE_ASSET_CONFIG).copy(data, 0);
  data.writeBigUInt64LE(minUnits, 8);
  data.writeUInt16LE(0, 16); // fee: 0 bps
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: SQUADS_VAULT, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: assetConfig(mint), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

const connection = new Connection(RPC, 'confirmed');
const mode = process.argv[2];
if (mode === '--verify') {
  const out = [];
  for (const r of RAILS) {
    const info = await connection.getAccountInfo(assetConfig(r.mint));
    if (!info) { out.push({ rail: r.rail, configured: false }); continue; }
    const d = info.data; // 8 disc | mint 32 | decimals 1 | min u64 | fee u16 | enabled bool
    out.push({ rail: r.rail, configured: true, mintOk: new PublicKey(d.subarray(8, 40)).toBase58() === r.mint, decimals: d[40], minUnits: d.readBigUInt64LE(41).toString(), feeBps: d.readUInt16LE(49), enabled: d[51] === 1 });
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.every(o => o.configured && o.mintOk && o.feeBps === 0 && o.enabled) ? 0 : 1);
}
if (mode === '--verify-proposal') {
  // Resolves address lookup tables (the Squads Tx Builder import compresses accounts into one).
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG);
  const index = BigInt(ms.transactionIndex.toString());
  const [txPda] = multisig.getTransactionPda({ multisigPda: MULTISIG, index });
  const [proposalPda] = multisig.getProposalPda({ multisigPda: MULTISIG, transactionIndex: index });
  const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, txPda);
  const keys = vt.message.accountKeys.map(k => k.toBase58());
  for (const l of vt.message.addressTableLookups) {
    const table = (await connection.getAddressLookupTable(l.accountKey)).value;
    if (!table) throw Error('Lookup table missing');
    keys.push(...[...l.writableIndexes].map(i => table.state.addresses[i].toBase58()));
  }
  for (const l of vt.message.addressTableLookups) {
    const table = (await connection.getAddressLookupTable(l.accountKey)).value;
    keys.push(...[...l.readonlyIndexes].map(i => table.state.addresses[i].toBase58()));
  }
  const ixs = vt.message.instructions.map(ix => ({ program: keys[ix.programIdIndex], accounts: [...ix.accountIndexes].map(i => keys[i]), data: Buffer.from(ix.data) }));
  const expect = RAILS.map(r => [SQUADS_VAULT.toBase58(), config.toBase58(), assetConfig(r.mint).toBase58(), r.mint, SystemProgram.programId.toBase58()]);
  const exactly = ixs.length === RAILS.length && ixs.every((ix, i) => ix.program === PROGRAM_ID.toBase58()
    && ix.data.length === 18 && ix.data.subarray(0, 8).equals(Buffer.from(INITIALIZE_ASSET_CONFIG))
    && ix.data.readBigUInt64LE(8) === RAILS[i].minUnits && ix.data.readUInt16LE(16) === 0
    && JSON.stringify(ix.accounts) === JSON.stringify(expect[i]));
  let status = 'no proposal';
  try { const p = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda); status = `${p.status.__kind} ${p.approved.length}/${ms.threshold}`; } catch {}
  console.log(JSON.stringify({ transactionIndex: index.toString(), vaultIndex: vt.vaultIndex, exactlyTheGrowRails: exactly, status }, null, 2));
  process.exit(exactly && vt.vaultIndex === 0 ? 0 : 1);
}
const { blockhash } = await connection.getLatestBlockhash('finalized');
const message = new TransactionMessage({ payerKey: SQUADS_VAULT, recentBlockhash: blockhash, instructions: RAILS.map(instruction) }).compileToV0Message();
const tx = new VersionedTransaction(message);
if (mode === '--simulate') {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log(JSON.stringify({ err: sim.value.err, logs: sim.value.logs }, null, 2));
  process.exit(sim.value.err ? 1 : 0);
}
const bytes = tx.serialize();
console.log(JSON.stringify({
  mode: 'unsigned-squads-import', cluster: 'mainnet-beta', action: 'allowlist JitoSOL and jlUSDC at 0%',
  vault: SQUADS_VAULT.toBase58(), assetConfigs: Object.fromEntries(RAILS.map(r => [r.rail, assetConfig(r.mint).toBase58()])),
  sha256: createHash('sha256').update(bytes).digest('hex'), base58Transaction: bs58.encode(bytes),
}, null, 2));
