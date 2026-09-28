// Vault 2.0 coin settings: one Squads transaction that allowlists Dollars (USDC), Bitcoin (cbBTC) and
// Solana (wSOL) on the asset rails, all at 0% (the program now refuses any fee). The Squads vault is the
// config authority and pays the three small AssetConfig accounts (~0.0013 SOL each).
//   node scripts/mainnet-squads-coins.mjs              print the unsigned transaction to import into Squads
//   node scripts/mainnet-squads-coins.mjs --simulate   simulate it (only works once the upgrade is live)
//   node scripts/mainnet-squads-coins.mjs --verify     read the three configs back from chain
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

const RPC = process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
const SQUADS_VAULT = new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
const INITIALIZE_ASSET_CONFIG = [201, 180, 166, 88, 111, 8, 150, 205];
export const COINS = [
  { coin: 'dollars', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, minUnits: 10_000n }, // 0.01 USDC
  { coin: 'bitcoin', mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', decimals: 8, minUnits: 1_000n }, // 1,000 sats
  { coin: 'solana', mint: 'So11111111111111111111111111111111111111112', decimals: 9, minUnits: 1_000_000n }, // 0.001 SOL
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

// Importing COINS (mainnet-coin-prep.mjs) must not run anything below.
if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) { /* imported */ } else {
const connection = new Connection(RPC, 'confirmed');
const mode = process.argv[2];
if (mode === '--verify') {
  const out = [];
  for (const c of COINS) {
    const info = await connection.getAccountInfo(assetConfig(c.mint));
    if (!info) { out.push({ coin: c.coin, configured: false }); continue; }
    const d = info.data; // 8 disc | mint 32 | decimals 1 | min u64 | fee u16 | enabled bool
    out.push({ coin: c.coin, configured: true, mintOk: new PublicKey(d.subarray(8, 40)).toBase58() === c.mint, decimals: d[40], minUnits: d.readBigUInt64LE(41).toString(), feeBps: d.readUInt16LE(49), enabled: d[51] === 1 });
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.every(o => o.configured && o.mintOk && o.feeBps === 0 && o.enabled) ? 0 : 1);
}
const { blockhash } = await connection.getLatestBlockhash('finalized');
const message = new TransactionMessage({ payerKey: SQUADS_VAULT, recentBlockhash: blockhash, instructions: COINS.map(instruction) }).compileToV0Message();
const tx = new VersionedTransaction(message);
if (mode === '--simulate') {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log(JSON.stringify({ err: sim.value.err, logs: sim.value.logs }, null, 2));
  process.exit(sim.value.err ? 1 : 0);
}
const bytes = tx.serialize();
console.log(JSON.stringify({
  mode: 'unsigned-squads-import', cluster: 'mainnet-beta', action: 'allowlist dollars, bitcoin, solana at 0%',
  vault: SQUADS_VAULT.toBase58(), assetConfigs: Object.fromEntries(COINS.map(c => [c.coin, assetConfig(c.mint).toBase58()])),
  sha256: createHash('sha256').update(bytes).digest('hex'), base58Transaction: bs58.encode(bytes),
}, null, 2));
}
