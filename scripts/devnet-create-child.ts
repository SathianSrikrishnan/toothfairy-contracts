/**
 * Create a child profile on devnet using the local keypair.
 * Uses Helius RPC + aggressive retry pattern.
 *
 * Usage (from WSL2):
 *   npx ts-node scripts/devnet-create-child.ts
 */
import 'dotenv/config';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { ToothfairyEscrow } from "../target/types/toothfairy_escrow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HELIUS_RPC = process.env.HELIUS_RPC_URL;
if (!HELIUS_RPC) throw new Error('HELIUS_RPC_URL not set');
const PROGRAM_ID = new PublicKey("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC");

// Isa's wallet address
const CHILD_WALLET = new PublicKey("Hau9S1szhVzeBBw1dJcLQXWeaW3ciobj5JvAFFmFeW4U");
const CHILD_NAME = "Isa";

async function main() {
  // Load local keypair
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const guardian = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Guardian:", guardian.publicKey.toBase58());
  console.log("Child wallet:", CHILD_WALLET.toBase58());
  console.log("RPC:", HELIUS_RPC);

  // Setup connection + provider
  const connection = new Connection(HELIUS_RPC, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 120000,
  });

  const balance = await connection.getBalance(guardian.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  const wallet = new anchor.Wallet(guardian);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(fs.readFileSync("target/idl/toothfairy_escrow.json", "utf-8"));
  const program = new Program(idl, provider) as Program<ToothfairyEscrow>;

  // Derive PDA
  const [childProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("child_profile"), guardian.publicKey.toBuffer(), CHILD_WALLET.toBuffer()],
    PROGRAM_ID
  );
  console.log("Child profile PDA:", childProfilePda.toBase58());

  // Check if already exists
  const existing = await connection.getAccountInfo(childProfilePda);
  if (existing) {
    console.log("Child profile already exists! Fetching...");
    const profile = await program.account.childProfile.fetch(childProfilePda);
    console.log("  Name:", profile.childName);
    console.log("  Milestones:", profile.milestoneCount);
    return;
  }

  // Build transaction manually with priority fee
  const tx = new anchor.web3.Transaction();

  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 })
  );

  const ix = await program.methods
    .initializeChild(CHILD_NAME)
    .accountsPartial({
      guardian: guardian.publicKey,
      childWallet: CHILD_WALLET,
      childProfile: childProfilePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(ix);
  tx.feePayer = guardian.publicKey;

  // Send with aggressive retry
  const MAX_ATTEMPTS = 30;

  const blockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash.blockhash;
  tx.sign(guardian);
  const serialized = tx.serialize();

  console.log("\nSending transaction (will resend every 2s for up to 60s)...");

  let sig: string | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      sig = await connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 0,
      });
      if (i === 0) console.log("Signature:", sig);
    } catch (e: any) {
      if (e.message?.includes("already been processed")) {
        console.log("Transaction already processed!");
        break;
      }
      // Blockhash expired — need to rebuild
      if (e.message?.includes("Blockhash not found") || e.message?.includes("block height")) {
        console.log("Blockhash expired, rebuilding...");
        const newBlockhash = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = newBlockhash.blockhash;
        tx.sign(guardian);
        const newSerialized = tx.serialize();
        sig = await connection.sendRawTransaction(newSerialized, { skipPreflight: true, maxRetries: 0 });
        console.log("New signature:", sig);
      }
    }

    // Check status
    if (sig) {
      const status = await connection.getSignatureStatuses([sig]);
      const result = status?.value?.[0];
      if (result) {
        if (result.err) {
          console.error("Transaction FAILED on-chain:", result.err);
          return;
        }
        if (result.confirmationStatus === "confirmed" || result.confirmationStatus === "finalized") {
          console.log(`\n✅ Transaction CONFIRMED (${result.confirmationStatus})!`);
          console.log(`Signature: ${sig}`);
          console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

          // Verify the profile
          const profile = await program.account.childProfile.fetch(childProfilePda);
          console.log("\nChild Profile Created:");
          console.log("  Name:", profile.childName);
          console.log("  Guardian:", profile.guardian.toBase58());
          console.log("  Child Wallet:", profile.childWallet.toBase58());
          console.log("  Milestones:", profile.milestoneCount);
          return;
        }
      }
    }

    process.stdout.write(`  Attempt ${i + 1}/${MAX_ATTEMPTS}...\r`);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n❌ Transaction not confirmed after all attempts.");
  if (sig) {
    console.log(`Check manually: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }
}

main().catch(console.error);
