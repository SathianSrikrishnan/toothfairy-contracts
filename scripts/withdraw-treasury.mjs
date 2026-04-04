/**
 * Withdraw Treasury Fees
 *
 * Pulls accumulated 2% fees from the treasury PDA to the authority wallet.
 * Run: node scripts/withdraw-treasury.mjs [amount_in_sol]
 * Default: withdraws all available balance.
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = anchor;
import { readFileSync } from "fs";
import { resolve } from "path";
import path from "path";
import os from "os";

const RPC_URL = process.env.HELIUS_RPC_URL;
if (!RPC_URL) throw new Error('HELIUS_RPC_URL not set');
const PROGRAM_ID = new PublicKey("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC");

// Load deploy wallet (= treasury authority)
const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(readFileSync(keypairPath, "utf8"));
const authority = Keypair.fromSecretKey(new Uint8Array(keypairData));

// Load IDL
const idl = JSON.parse(readFileSync(resolve("target/idl/toothfairy_escrow.json"), "utf8"));

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new Wallet(authority);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(idl, provider);

// Derive treasury PDA
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  PROGRAM_ID
);

async function main() {
  console.log("Treasury PDA:", treasuryPda.toBase58());
  console.log("Authority:", authority.publicKey.toBase58());

  // Check treasury balance
  const treasuryBalance = await connection.getBalance(treasuryPda);
  const treasuryAccount = await program.account.treasury.fetch(treasuryPda);

  // Calculate available (balance minus rent-exempt minimum)
  const rentExempt = await connection.getMinimumBalanceForRentExemption(8 + 32 + 8 + 1); // Treasury struct size
  const available = treasuryBalance - rentExempt;

  console.log(`\nTreasury balance: ${treasuryBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Rent-exempt min:  ${rentExempt / LAMPORTS_PER_SOL} SOL`);
  console.log(`Available:        ${available / LAMPORTS_PER_SOL} SOL`);
  console.log(`Total collected:  ${treasuryAccount.totalCollected.toNumber() / LAMPORTS_PER_SOL} SOL`);

  if (available <= 0) {
    console.log("\nNothing to withdraw.");
    return;
  }

  // Determine withdrawal amount
  const requestedSol = process.argv[2] ? parseFloat(process.argv[2]) : null;
  const withdrawLamports = requestedSol
    ? Math.min(Math.floor(requestedSol * LAMPORTS_PER_SOL), available)
    : available;

  console.log(`\nWithdrawing: ${withdrawLamports / LAMPORTS_PER_SOL} SOL`);

  const tx = await program.methods
    .withdrawTreasury(new anchor.BN(withdrawLamports))
    .accounts({
      authority: authority.publicKey,
      treasury: treasuryPda,
    })
    .rpc();

  console.log(`\nSuccess! TX: https://solscan.io/tx/${tx}`);

  const newBalance = await connection.getBalance(authority.publicKey);
  console.log(`Authority wallet balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
}

main().catch(console.error);
