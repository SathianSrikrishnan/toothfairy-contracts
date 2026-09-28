// Vault 2.0: grow mainnet ProgramData so the upgrade fits (owner-approved plan, 2026-09-28).
// Uses the loader's plain ExtendProgram (instruction 6), which mainnet still accepts from any payer
// (ExtendProgramChecked is inactive). Solana CLI 3.1 refuses client-side unless it holds the upgrade
// authority, which is the Squads vault. Simulates first; sends only with --execute and a clean simulation.
// Usage (WSL): MAINNET_RPC=... node scripts/mainnet-extend-program.mjs <additional_bytes> [--execute]
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const PROGRAM = new PublicKey('FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const EXPECTED_PROGRAM_DATA = '5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM';
const TARGET_PROGRAM_BYTES = 547_680; // the Vault 2.0 artifact
const MAX_FEE_LAMPORTS = 100_000;

const rpc = process.env.MAINNET_RPC;
if (!rpc || !new URL(rpc).hostname.includes('mainnet')) throw Error('MAINNET_RPC required');
const additional = Number(process.argv[2]);
const execute = process.argv.includes('--execute');
const connection = new Connection(rpc, 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))));

const programData = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], LOADER)[0];
if (programData.toBase58() !== EXPECTED_PROGRAM_DATA) throw Error('Unexpected ProgramData address');
const before = await connection.getAccountInfo(programData);
const currentProgramBytes = before.data.length - 45;
if (currentProgramBytes + additional !== TARGET_PROGRAM_BYTES) throw Error(`Extend must reach exactly ${TARGET_PROGRAM_BYTES} bytes (now ${currentProgramBytes})`);

const data = Buffer.alloc(8);
data.writeUInt32LE(6, 0); // ExtendProgram
data.writeUInt32LE(additional, 4);
const ix = new TransactionInstruction({
  programId: LOADER,
  keys: [
    { pubkey: programData, isSigner: false, isWritable: true },
    { pubkey: PROGRAM, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
  ],
  data,
});
const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ix);
tx.feePayer = payer.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const rent = await connection.getMinimumBalanceForRentExemption(before.data.length + additional) - before.lamports;
const sim = await connection.simulateTransaction(tx);
const report = { programData: programData.toBase58(), currentProgramBytes, additional, targetProgramBytes: TARGET_PROGRAM_BYTES, rentLamports: rent, simulation: { err: sim.value.err, logs: sim.value.logs } };
if (sim.value.err) { console.log(JSON.stringify(report, null, 2)); throw Error('Simulation failed; nothing sent'); }
if (!execute) { console.log(JSON.stringify({ ...report, dryRun: true })); process.exit(0); }

const balanceBefore = await connection.getBalance(payer.publicKey);
const signature = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(signature, 'finalized');
const after = await connection.getAccountInfo(programData, 'finalized');
const spent = balanceBefore - await connection.getBalance(payer.publicKey, 'finalized');
if (spent - rent > MAX_FEE_LAMPORTS) console.warn('Fee above the expected ceiling; reconcile');
const receipt = { ...report, signature, programBytesAfter: after.data.length - 45, lamportsSpent: spent, at: new Date().toISOString() };
writeFileSync('docs/audits/2026-09-28-vault-v2/mainnet-extend.json', JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ signature, programBytesAfter: receipt.programBytesAfter, solSpent: spent / 1e9 }));
