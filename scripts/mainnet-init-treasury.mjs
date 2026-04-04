/**
 * Initialize Treasury PDA on Mainnet
 *
 * Run AFTER deploying the upgraded contract.
 * Creates the global treasury PDA that receives 2% deposit fees.
 *
 * Run: node scripts/mainnet-init-treasury.mjs
 * Cost: ~0.001 SOL (rent for treasury account)
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
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

console.log("\n🏦 Tooth Fairy Network — Treasury Initialization");
console.log("═".repeat(55));
console.log("  Authority:", authority.publicKey.toBase58());
console.log("  Treasury PDA:", treasuryPda.toBase58());
console.log("  Program:", PROGRAM_ID.toBase58());

// Check if treasury already exists
const treasuryInfo = await connection.getAccountInfo(treasuryPda);
if (treasuryInfo) {
  console.log("\n  ⚠️  Treasury PDA already exists!");
  const treasury = await program.account.treasury.fetch(treasuryPda);
  console.log("  Authority:", treasury.authority.toBase58());
  console.log("  Total collected:", treasury.totalCollected.toNumber() / LAMPORTS_PER_SOL, "SOL");
  console.log("  Balance:", treasuryInfo.lamports / LAMPORTS_PER_SOL, "SOL");
  process.exit(0);
}

// Initialize treasury
console.log("\n  Initializing treasury...");
try {
  const tx = await program.methods
    .initializeTreasury()
    .accounts({
      authority: authority.publicKey,
      treasury: treasuryPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("  ✅ Treasury initialized!");
  console.log("  Tx:", tx);

  const treasury = await program.account.treasury.fetch(treasuryPda);
  console.log("  Authority:", treasury.authority.toBase58());
  console.log("  Total collected:", treasury.totalCollected.toNumber(), "lamports");

  const balance = await connection.getBalance(authority.publicKey);
  console.log("\n  Wallet balance:", balance / LAMPORTS_PER_SOL, "SOL");
} catch (err) {
  console.log("  ❌ Failed:", err.message);
  if (err.logs) {
    console.log("  Logs:", err.logs.slice(-5).join("\n  "));
  }
}
console.log("");
