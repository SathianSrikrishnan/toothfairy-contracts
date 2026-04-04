/**
 * Cleanup Dormant Profiles — Reclaim Rent
 *
 * Lists all child profiles owned by the server wallet.
 * Identifies profiles with no deposits (dormant).
 * Closes them to reclaim ~0.0068 SOL rent per profile.
 *
 * Run: node scripts/cleanup-profiles.mjs          (dry run — list only)
 * Run: node scripts/cleanup-profiles.mjs --close   (actually close profiles)
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = anchor;
import { readFileSync } from "fs";
import { resolve } from "path";
import path from "path";
import os from "os";

const RPC_URL = process.env.HELIUS_RPC_URL;
if (!RPC_URL) throw new Error('HELIUS_RPC_URL not set');
const PROGRAM_ID = new PublicKey("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC");

// Load server mint wallet (temp guardian for server-created profiles)
const mintKeyBase64 = process.env.SERVER_KEYPAIR_BASE64;
if (!mintKeyBase64) throw new Error('SERVER_KEYPAIR_BASE64 not set');
const serverKeypair = Keypair.fromSecretKey(new Uint8Array(Buffer.from(mintKeyBase64, "base64")));

// Also load deploy wallet for profiles that were transferred
const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(readFileSync(keypairPath, "utf8"));
const deployKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

// Load IDL
const idl = JSON.parse(readFileSync(resolve("target/idl/toothfairy_escrow.json"), "utf8"));

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new Wallet(serverKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(idl, provider);

const doClose = process.argv.includes("--close");

async function main() {
  console.log("Server wallet:", serverKeypair.publicKey.toBase58());
  console.log("Mode:", doClose ? "CLOSE (reclaiming rent)" : "DRY RUN (list only)");
  console.log("");

  // Fetch all child profiles
  const allProfiles = await program.account.childProfile.all();
  console.log(`Found ${allProfiles.length} total profiles on-chain\n`);

  let reclaimable = 0;
  let dormantCount = 0;

  for (const p of allProfiles) {
    const profile = p.account;
    const pda = p.publicKey.toBase58();
    const isServerGuardian = profile.guardian.toBase58() === serverKeypair.publicKey.toBase58();
    const totalDeposited = profile.totalDeposited.toNumber();
    const totalClaimed = profile.totalClaimed.toNumber();
    const activeBalance = totalDeposited - totalClaimed;
    const milestoneCount = profile.milestoneCount;

    const status = activeBalance > 0 ? "ACTIVE" : milestoneCount === 0 ? "EMPTY" : "DORMANT";
    const guardian = isServerGuardian ? "SERVER" : profile.guardian.toBase58().slice(0, 8) + "...";

    console.log(`  ${profile.childName.padEnd(20)} | ${status.padEnd(8)} | Guardian: ${guardian} | Milestones: ${milestoneCount} | Balance: ${activeBalance / LAMPORTS_PER_SOL} SOL | PDA: ${pda.slice(0, 12)}...`);

    // Can close if: server is guardian AND no active balance
    if (isServerGuardian && activeBalance === 0 && milestoneCount === 0) {
      dormantCount++;
      const accountInfo = await connection.getAccountInfo(p.publicKey);
      if (accountInfo) {
        reclaimable += accountInfo.lamports;

        if (doClose) {
          try {
            const tx = await program.methods
              .closeProfile()
              .accounts({
                guardian: serverKeypair.publicKey,
                childProfile: p.publicKey,
              })
              .rpc();
            console.log(`    ✓ CLOSED — reclaimed ${accountInfo.lamports / LAMPORTS_PER_SOL} SOL — TX: ${tx.slice(0, 20)}...`);
          } catch (err) {
            console.log(`    ✗ Failed to close: ${err.message.slice(0, 80)}`);
          }
        }
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total profiles:    ${allProfiles.length}`);
  console.log(`Dormant (closable): ${dormantCount}`);
  console.log(`Reclaimable rent:  ${reclaimable / LAMPORTS_PER_SOL} SOL`);

  if (!doClose && dormantCount > 0) {
    console.log(`\nRun with --close to reclaim rent: node scripts/cleanup-profiles.mjs --close`);
  }
}

main().catch(console.error);
