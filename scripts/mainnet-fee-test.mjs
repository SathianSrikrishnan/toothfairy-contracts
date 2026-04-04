/**
 * Mainnet Fee Test — Verifies 2% deposit fee + treasury + "Until 18" lock
 *
 * Creates a child profile, milestone, and deposit with fee split.
 * Checks that 2% went to treasury and 98% went to deposit PDA.
 * Also tests UntilTimestamp lock period (child's 18th birthday).
 *
 * Run: node scripts/mainnet-fee-test.mjs
 * Cost: ~0.02 SOL (account creation + 0.01 SOL test deposit)
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, Wallet } = anchor;
import { readFileSync } from "fs";
import { resolve } from "path";
import path from "path";
import os from "os";

const RPC_URL = process.env.HELIUS_RPC_URL;
if (!RPC_URL) throw new Error('HELIUS_RPC_URL not set');
const PROGRAM_ID = new PublicKey("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC");

const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(readFileSync(keypairPath, "utf8"));
const guardian = Keypair.fromSecretKey(new Uint8Array(keypairData));

const idl = JSON.parse(readFileSync(resolve("target/idl/toothfairy_escrow.json"), "utf8"));

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new Wallet(guardian);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(idl, provider);

// Fresh child wallet for this test
const childWallet = Keypair.generate();

// Derive PDAs
const [childProfilePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("child_profile"), guardian.publicKey.toBuffer(), childWallet.publicKey.toBuffer()],
  PROGRAM_ID
);

const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  PROGRAM_ID
);

console.log("\n🧪 Tooth Fairy Network — Fee Split Test (Mainnet)");
console.log("═".repeat(55));
console.log("  Guardian:", guardian.publicKey.toBase58());
console.log("  Child wallet:", childWallet.publicKey.toBase58().slice(0, 16) + "...");
console.log("  Treasury PDA:", treasuryPda.toBase58());

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message?.slice(0, 120)}`);
    if (err.logs) console.log("    Logs:", err.logs.slice(-3).join("\n    "));
  }
}

// ── 1. Initialize child profile ──
await test("Initialize child profile", async () => {
  await program.methods
    .initializeChild("FeeTestChild")
    .accounts({
      guardian: guardian.publicKey,
      childWallet: childWallet.publicKey,
      childProfile: childProfilePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
});

// ── 2. Create milestone (cNFT flow — no NFT mint) ──
const [milestonePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), childProfilePda.toBuffer(), Buffer.from([0])],
  PROGRAM_ID
);

await test("Create milestone", async () => {
  await program.methods
    .createMilestone(
      { upperRightCentralIncisor: {} },
      "https://arweave.net/fee-test-metadata"
    )
    .accounts({
      guardian: guardian.publicKey,
      childProfile: childProfilePda,
      milestone: milestonePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
});

// ── 3. Deposit with fee (immediate lock) ──
const depositAmount = 0.01 * LAMPORTS_PER_SOL; // 10,000,000 lamports
const expectedFee = Math.floor(depositAmount * 200 / 10_000); // 2% = 200,000 lamports
const expectedNet = depositAmount - expectedFee; // 9,800,000 lamports

const [depositPda0] = PublicKey.findProgramAddressSync(
  [Buffer.from("deposit"), milestonePda.toBuffer(), Buffer.from([0, 0, 0, 0])],
  PROGRAM_ID
);

let treasuryBalanceBefore;
await test(`Deposit 0.01 SOL with 2% fee (immediate)`, async () => {
  treasuryBalanceBefore = await connection.getBalance(treasuryPda);

  const tx = await program.methods
    .deposit(
      new BN(depositAmount),
      { immediate: {} },
      "Dad"
    )
    .accounts({
      depositor: guardian.publicKey,
      childProfile: childProfilePda,
      milestone: milestonePda,
      depositAccount: depositPda0,
      treasury: treasuryPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  // Verify deposit stores NET amount
  const deposit = await program.account.deposit.fetch(depositPda0);
  if (deposit.amountLamports.toNumber() !== expectedNet) {
    throw new Error(`Expected net ${expectedNet}, got ${deposit.amountLamports.toNumber()}`);
  }
  console.log(`    Gross: ${depositAmount} lamports`);
  console.log(`    Fee (2%): ${expectedFee} lamports`);
  console.log(`    Net to child: ${expectedNet} lamports`);
  console.log(`    Tx: ${tx}`);
});

// ── 4. Verify treasury received the fee ──
await test("Treasury received 2% fee", async () => {
  const treasuryBalanceAfter = await connection.getBalance(treasuryPda);
  const feeReceived = treasuryBalanceAfter - treasuryBalanceBefore;

  if (feeReceived !== expectedFee) {
    throw new Error(`Expected fee ${expectedFee}, treasury received ${feeReceived}`);
  }

  const treasury = await program.account.treasury.fetch(treasuryPda);
  console.log(`    Treasury balance: ${treasuryBalanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`    Total collected: ${treasury.totalCollected.toNumber()} lamports`);
});

// ── 5. Deposit with UntilTimestamp lock (child's 18th birthday) ──
// Simulate a child born March 18, 2023 — turns 18 on March 18, 2041
const childDob = new Date("2023-03-18T00:00:00Z").getTime() / 1000;
const eighteenthBirthday = Math.floor(childDob + (18 * 365.25 * 24 * 60 * 60));

const [depositPda1] = PublicKey.findProgramAddressSync(
  [Buffer.from("deposit"), milestonePda.toBuffer(), Buffer.from([1, 0, 0, 0])],
  PROGRAM_ID
);

console.log(`    Debug: DOB=${childDob}, 18th=${eighteenthBirthday}, now=${Math.floor(Date.now()/1000)}, future=${eighteenthBirthday > Math.floor(Date.now()/1000)}`);

await test(`Deposit 0.01 SOL locked until 18 (${new Date(eighteenthBirthday * 1000).toISOString().split("T")[0]})`, async () => {
  const tx = await program.methods
    .deposit(
      new BN(depositAmount),
      { untilTimestamp: { lockUntil: new BN(eighteenthBirthday) } },
      "Dad"
    )
    .accounts({
      depositor: guardian.publicKey,
      childProfile: childProfilePda,
      milestone: milestonePda,
      depositAccount: depositPda1,
      treasury: treasuryPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const deposit = await program.account.deposit.fetch(depositPda1);
  const lockDate = new Date(deposit.lockUntil.toNumber() * 1000);
  console.log(`    Locked until: ${lockDate.toISOString().split("T")[0]}`);
  console.log(`    Net amount: ${deposit.amountLamports.toNumber()} lamports`);
  console.log(`    Tx: ${tx}`);

  // Verify lock is in the future (~2041)
  if (deposit.lockUntil.toNumber() < Date.now() / 1000) {
    throw new Error("Lock should be in the future");
  }
});

// ── 6. Verify milestone totals ──
await test("Milestone totals correct (net amounts)", async () => {
  const milestone = await program.account.milestone.fetch(milestonePda);
  const expectedTotal = expectedNet * 2; // Two deposits of 0.01 SOL net each

  if (milestone.totalDeposits.toNumber() !== expectedTotal) {
    throw new Error(`Expected total ${expectedTotal}, got ${milestone.totalDeposits.toNumber()}`);
  }
  if (milestone.depositCount !== 2) {
    throw new Error(`Expected 2 deposits, got ${milestone.depositCount}`);
  }
  console.log(`    Total deposits: ${milestone.totalDeposits.toNumber()} lamports (2 deposits)`);
});

// ── Summary ──
console.log("\n" + "═".repeat(55));
console.log(`  Results: ${passed} passed, ${failed} failed`);

const balance = await connection.getBalance(guardian.publicKey);
console.log(`  Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

if (failed === 0) {
  console.log("\n  🎉 Fee split verified on mainnet!");
  console.log("  2% fee → treasury ✓ | 98% net → escrow ✓ | UntilTimestamp lock ✓");
} else {
  console.log("\n  ⚠️  Some tests failed. Review above.");
}
console.log("");
