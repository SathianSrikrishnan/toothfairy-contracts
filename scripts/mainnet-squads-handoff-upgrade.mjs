// Build the Squads (current multisig) transaction that moves ONLY the TFN program's upgrade authority to the
// time-locked safe's vault. Config (pause, coin settings) and treasury authority stay with the current safe.
//   node scripts/mainnet-squads-handoff-upgrade.mjs              print the unsigned tx to import into Squads
//   node scripts/mainnet-squads-handoff-upgrade.mjs --simulate   simulate as the current vault
//   node scripts/mainnet-squads-handoff-upgrade.mjs --verify     read the program's upgrade authority
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bs58 from 'bs58';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

const connection = new Connection(process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const PROGRAM_DATA = new PublicKey('5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM');
const CURRENT = new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
const safe = JSON.parse(readFileSync('docs/audits/2026-09-28-vault-v2/mainnet-timelock-safe.json', 'utf8'));
if (!safe.ok || safe.timeLockSeconds !== 604800) throw Error('Time-locked safe not verified');
const NEW = new PublicKey(safe.vault);

if (process.argv[2] === '--verify') {
  const d = (await connection.getAccountInfo(PROGRAM_DATA, 'finalized')).data;
  const authority = d[12] === 1 ? bs58.encode(d.subarray(13, 45)) : null;
  console.log(JSON.stringify({ upgradeAuthority: authority, isTimeLockedSafe: authority === NEW.toBase58() }));
  process.exit(authority === NEW.toBase58() ? 0 : 1);
}
// Loader instruction 4 = SetAuthority: [ProgramData (w), current authority (signer), new authority].
const ix = new TransactionInstruction({ programId: LOADER, data: Buffer.from([4, 0, 0, 0]), keys: [
  { pubkey: PROGRAM_DATA, isSigner: false, isWritable: true },
  { pubkey: CURRENT, isSigner: true, isWritable: false },
  { pubkey: NEW, isSigner: false, isWritable: false },
] });
const { blockhash } = await connection.getLatestBlockhash('finalized');
const tx = new VersionedTransaction(new TransactionMessage({ payerKey: CURRENT, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
if (process.argv[2] === '--simulate') {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log(JSON.stringify({ err: sim.value.err, logs: sim.value.logs }, null, 2));
  process.exit(sim.value.err ? 1 : 0);
}
const bytes = tx.serialize();
console.log(JSON.stringify({ action: 'move program upgrade authority to the 7-day safe', from: CURRENT.toBase58(), to: NEW.toBase58(), timeLockedMultisig: safe.multisig,
  sha256: createHash('sha256').update(bytes).digest('hex'), base58Transaction: bs58.encode(bytes) }, null, 2));
