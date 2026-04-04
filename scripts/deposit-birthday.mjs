/**
 * TFN Birthday Deposits — March 24, 2026
 *
 * Makes time-locked deposits to Isa and Sia's profiles.
 * Locked until their 18th birthday (March 24, 2037).
 *
 * Usage: node scripts/deposit-birthday.mjs [sol-per-tooth]
 * Example: node scripts/deposit-birthday.mjs 1.0
 *   → Deposits 1 SOL per tooth: 1 SOL to Isa (1 tooth), 2 SOL to Sia (2 teeth)
 */

import 'dotenv/config';
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js"
import pkg from "@coral-xyz/anchor"
const { Program, AnchorProvider, BN, Wallet } = pkg
import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ──
const RPC_URL = process.env.HELIUS_RPC_URL;
if (!RPC_URL) throw new Error('HELIUS_RPC_URL not set');
const PROGRAM_ID = new PublicKey("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC")
const SOL_PER_TOOTH = parseFloat(process.argv[2] || "1.0")

// DOB: March 24, 2019 → 18th birthday: March 24, 2037
const DOB = new Date("2019-03-24T00:00:00Z")
const EIGHTEENTH = new Date(DOB)
EIGHTEENTH.setFullYear(EIGHTEENTH.getFullYear() + 18)
const LOCK_TIMESTAMP = Math.floor(EIGHTEENTH.getTime() / 1000)

// Load deploy wallet
const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
const deployWallet = Keypair.fromSecretKey(Uint8Array.from(keypairData))

// Load IDL
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/toothfairy_escrow.json"), "utf-8"))

// ── PDA Derivation ──
function deriveChildWallet(guardian, childName) {
  const [derived] = PublicKey.findProgramAddressSync(
    [Buffer.from("tfn_child"), guardian.toBuffer(), Buffer.from(childName.toLowerCase().trim())],
    PROGRAM_ID
  )
  return derived
}

function getChildProfilePDA(guardian, childWallet) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("child_profile"), guardian.toBuffer(), childWallet.toBuffer()],
    PROGRAM_ID
  )
}

function getMilestonePDA(childProfile, milestoneIndex) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), childProfile.toBuffer(), Buffer.from([milestoneIndex])],
    PROGRAM_ID
  )
}

function getDepositPDA(milestone, depositCount) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(depositCount)
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), milestone.toBuffer(), buf],
    PROGRAM_ID
  )
}

function getTreasuryPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  )
}

// ── Setup ──
const connection = new Connection(RPC_URL, "confirmed")
const wallet = new Wallet(deployWallet)
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" })
const program = new Program(idl, provider)

async function makeDeposit(childName, milestoneIndex, depositorName) {
  const childWallet = deriveChildWallet(deployWallet.publicKey, childName)
  const [childProfilePda] = getChildProfilePDA(deployWallet.publicKey, childWallet)
  const [milestonePda] = getMilestonePDA(childProfilePda, milestoneIndex)

  // Get current deposit count
  const milestone = await program.account.milestone.fetch(milestonePda)
  const depositCount = milestone.depositCount

  const [depositPda] = getDepositPDA(milestonePda, depositCount)
  const [treasuryPda] = getTreasuryPDA()

  const amountLamports = Math.floor(SOL_PER_TOOTH * 1e9)
  const feeLamports = Math.floor(amountLamports * 100 / 10000) // 1% fee
  const netLamports = amountLamports - feeLamports

  console.log(`\n  Depositing ${SOL_PER_TOOTH} SOL to ${childName}'s tooth #${milestoneIndex + 1}`)
  console.log(`    Gross: ${amountLamports / 1e9} SOL`)
  console.log(`    Fee (1%): ${feeLamports / 1e9} SOL`)
  console.log(`    Net to escrow: ${netLamports / 1e9} SOL`)
  console.log(`    Locked until: ${EIGHTEENTH.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`)
  console.log(`    Depositor: "${depositorName}"`)

  const tx = await program.methods
    .deposit(
      new BN(amountLamports),
      { untilTimestamp: { lockUntil: new BN(LOCK_TIMESTAMP) } },
      depositorName
    )
    .accounts({
      depositor: deployWallet.publicKey,
      childProfile: childProfilePda,
      milestone: milestonePda,
      depositAccount: depositPda,
      treasury: treasuryPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`    ✓ Deposit confirmed: ${tx}`)
  console.log(`    → https://solscan.io/tx/${tx}`)

  return tx
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗")
  console.log("║  TFN Birthday Deposits — March 24, 2026     ║")
  console.log("║  Isa & Sia's 7th Birthday! 🎂🦷             ║")
  console.log("╚══════════════════════════════════════════════╝")

  const bal = await connection.getBalance(deployWallet.publicKey)
  console.log(`\nDeploy wallet: ${deployWallet.publicKey.toBase58()}`)
  console.log(`Balance: ${bal / 1e9} SOL`)

  // Total needed: Isa (1 tooth × SOL_PER_TOOTH) + Sia (2 teeth × SOL_PER_TOOTH) + rent + fees
  const totalDeposits = 3 * SOL_PER_TOOTH
  const totalFees = totalDeposits * 0.01 // 1% platform fee
  const rentPerDeposit = 0.003 // ~3 milliSOL per deposit PDA
  const totalNeeded = totalDeposits + totalFees + (3 * rentPerDeposit) + 0.01 // buffer

  console.log(`\nPlan: ${SOL_PER_TOOTH} SOL per tooth`)
  console.log(`  Isa: 1 tooth → ${SOL_PER_TOOTH} SOL`)
  console.log(`  Sia: 2 teeth → ${2 * SOL_PER_TOOTH} SOL`)
  console.log(`  Total deposits: ${totalDeposits} SOL`)
  console.log(`  Platform fees (1%): ${totalFees.toFixed(4)} SOL`)
  console.log(`  PDA rent (3 deposits): ${(3 * rentPerDeposit).toFixed(4)} SOL`)
  console.log(`  Total needed: ~${totalNeeded.toFixed(3)} SOL`)

  if (bal / 1e9 < totalNeeded) {
    console.error(`\n❌ Insufficient balance! Need ${totalNeeded.toFixed(3)} SOL, have ${(bal / 1e9).toFixed(3)} SOL`)
    process.exit(1)
  }

  console.log(`\n═══ ISA — 1 deposit ═══`)
  await makeDeposit("Isa", 0, "Dad")

  // Small delay between transactions
  await new Promise(r => setTimeout(r, 2000))

  console.log(`\n═══ SIA — 2 deposits ═══`)
  await makeDeposit("Sia", 0, "Dad")

  await new Promise(r => setTimeout(r, 2000))

  await makeDeposit("Sia", 1, "Dad")

  // Final balances
  const finalBal = await connection.getBalance(deployWallet.publicKey)
  console.log(`\n╔══════════════════════════════════╗`)
  console.log(`║  ALL DEPOSITS COMPLETE           ║`)
  console.log(`╚══════════════════════════════════╝`)
  console.log(`\n  SOL spent: ${((bal - finalBal) / 1e9).toFixed(4)} SOL`)
  console.log(`  Remaining: ${(finalBal / 1e9).toFixed(4)} SOL`)
  console.log(`  Locked until: March 24, 2037 (18th birthday)`)
  console.log(`\n  Isa: ${SOL_PER_TOOTH} SOL locked → ${(SOL_PER_TOOTH * 0.99).toFixed(4)} SOL net`)
  console.log(`  Sia: ${2 * SOL_PER_TOOTH} SOL locked → ${(2 * SOL_PER_TOOTH * 0.99).toFixed(4)} SOL net`)
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
