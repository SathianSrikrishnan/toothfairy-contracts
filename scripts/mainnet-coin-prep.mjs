// Vault 2.0 prep paid by the deploy wallet (owner yes, 2026-09-28): 0.01 SOL to the Squads vault for the
// coin-setting accounts, and each coin's rail treasury token account (owner = its AssetConfig PDA), which
// deposit_asset requires even at 0%. Idempotent. Usage (WSL): MAINNET_RPC=... node scripts/mainnet-coin-prep.mjs [--execute]
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { COINS } from './mainnet-squads-coins.mjs';

const rpc = process.env.MAINNET_RPC;
if (!rpc || !new URL(rpc).hostname.includes('mainnet')) throw Error('MAINNET_RPC required');
const connection = new Connection(rpc, 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))));
const PROGRAM_ID = new PublicKey('FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
const SQUADS_VAULT = new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
const tx = new Transaction();
if ((await connection.getBalance(SQUADS_VAULT)) < 8_000_000)
  tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: SQUADS_VAULT, lamports: 10_000_000 }));
const treasuries = {};
for (const c of COINS) {
  const mint = new PublicKey(c.mint);
  const owner = PublicKey.findProgramAddressSync([Buffer.from('asset_config'), mint.toBuffer()], PROGRAM_ID)[0];
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  treasuries[c.coin] = ata.toBase58();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint));
}
tx.feePayer = payer.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const sim = await connection.simulateTransaction(tx, [payer]);
if (sim.value.err) { console.log(JSON.stringify(sim.value, null, 2)); throw Error('Simulation failed; nothing sent'); }
if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ dryRun: true, treasuries, instructions: tx.instructions.length })); process.exit(0); }
const signature = await connection.sendTransaction(tx, [payer]);
await connection.confirmTransaction(signature, 'finalized');
const receipt = { at: new Date().toISOString(), signature, treasuries, squadsVaultLamports: await connection.getBalance(SQUADS_VAULT, 'finalized') };
writeFileSync('docs/audits/2026-09-28-vault-v2/mainnet-coin-prep.json', JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
