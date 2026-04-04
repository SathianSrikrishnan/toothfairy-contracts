/**
 * TFN Clean Profile Setup — March 24, 2026
 *
 * Creates clean child profiles for Isa and Sia (born March 24, 2019, turning 7 today!)
 * using the deploy wallet as guardian.
 *
 * Phase 1: Create profiles + milestones
 * Phase 2 (separate): Deposits (waiting for Sathian's amount decision)
 *
 * Usage: node scripts/setup-clean-profiles.mjs
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

// Load deploy wallet
const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
const deployWallet = Keypair.fromSecretKey(Uint8Array.from(keypairData))
console.log(`Deploy wallet: ${deployWallet.publicKey.toBase58()}`)

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

// ── Tooth Types ──
// Using the Anchor IDL enum format
const TOOTH_TYPES = {
  upperRightCentralIncisor: { upperRightCentralIncisor: {} },
  upperLeftCentralIncisor: { upperLeftCentralIncisor: {} },
  lowerRightCentralIncisor: { lowerRightCentralIncisor: {} },
  lowerLeftCentralIncisor: { lowerLeftCentralIncisor: {} },
}

// ── Setup ──
const connection = new Connection(RPC_URL, "confirmed")
const wallet = new Wallet(deployWallet)
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" })
const program = new Program(idl, provider)

async function checkBalance() {
  const bal = await connection.getBalance(deployWallet.publicKey)
  console.log(`Deploy wallet balance: ${bal / 1e9} SOL`)
  if (bal < 0.1 * 1e9) {
    throw new Error("Deploy wallet needs at least 0.1 SOL for operations")
  }
  return bal
}

async function createChildProfile(childName) {
  const childWallet = deriveChildWallet(deployWallet.publicKey, childName)
  const [childProfilePda] = getChildProfilePDA(deployWallet.publicKey, childWallet)

  console.log(`\n═══ Creating profile for ${childName} ═══`)
  console.log(`  Child wallet (derived): ${childWallet.toBase58()}`)
  console.log(`  Child profile PDA: ${childProfilePda.toBase58()}`)

  // Check if already exists
  try {
    const existing = await program.account.childProfile.fetch(childProfilePda)
    console.log(`  ✓ Profile already exists (${existing.milestoneCount} milestones)`)
    return { childProfilePda, childWallet, milestoneCount: existing.milestoneCount, existed: true }
  } catch {
    // Doesn't exist, create it
  }

  const tx = await program.methods
    .initializeChild(childName)
    .accounts({
      guardian: deployWallet.publicKey,
      childWallet: childWallet,
      childProfile: childProfilePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`  ✓ Profile created: ${tx}`)
  console.log(`  → https://solscan.io/tx/${tx}`)

  return { childProfilePda, childWallet, milestoneCount: 0, existed: false }
}

async function createMilestone(childProfilePda, milestoneIndex, toothType, metadataUri) {
  const [milestonePda] = getMilestonePDA(childProfilePda, milestoneIndex)

  console.log(`  Creating milestone #${milestoneIndex} (${Object.keys(toothType)[0]})...`)
  console.log(`    Milestone PDA: ${milestonePda.toBase58()}`)

  // Check if already exists
  try {
    await program.account.milestone.fetch(milestonePda)
    console.log(`    ✓ Milestone already exists`)
    return milestonePda
  } catch {
    // Doesn't exist, create it
  }

  const tx = await program.methods
    .createMilestone(toothType, metadataUri)
    .accounts({
      guardian: deployWallet.publicKey,
      childProfile: childProfilePda,
      milestone: milestonePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`    ✓ Milestone created: ${tx}`)
  console.log(`    → https://solscan.io/tx/${tx}`)

  return milestonePda
}

// ── Main ──
async function main() {
  console.log("╔════════════════════════════════════════════╗")
  console.log("║  TFN Clean Profile Setup — March 24, 2026 ║")
  console.log("║  Happy 7th Birthday, Isa & Sia! 🎂        ║")
  console.log("╚════════════════════════════════════════════╝\n")

  await checkBalance()

  // ── ISA: 1 tooth lost ──
  const isa = await createChildProfile("Isa")

  const isaMilestones = []
  if (isa.milestoneCount < 1) {
    // First tooth: Upper Right Central Incisor (the classic first-lost tooth)
    const m0 = await createMilestone(
      isa.childProfilePda,
      isa.milestoneCount,
      TOOTH_TYPES.upperRightCentralIncisor,
      "https://arweave.net/tfn-isa-tooth-1" // Placeholder — will be updated with real cNFT metadata
    )
    isaMilestones.push(m0)
  }

  // ── SIA: 2 teeth lost ──
  const sia = await createChildProfile("Sia")

  const siaMilestones = []
  if (sia.milestoneCount < 1) {
    const m0 = await createMilestone(
      sia.childProfilePda,
      sia.milestoneCount,
      TOOTH_TYPES.lowerRightCentralIncisor,
      "https://arweave.net/tfn-sia-tooth-1" // Placeholder
    )
    siaMilestones.push(m0)
  }

  if (sia.milestoneCount < 2) {
    const currentCount = sia.milestoneCount + (siaMilestones.length > 0 ? 1 : 0)
    if (currentCount < 2) {
      const m1 = await createMilestone(
        sia.childProfilePda,
        currentCount,
        TOOTH_TYPES.lowerLeftCentralIncisor,
        "https://arweave.net/tfn-sia-tooth-2" // Placeholder
      )
      siaMilestones.push(m1)
    }
  }

  // ── Summary ──
  console.log("\n╔════════════════════════════════════════╗")
  console.log("║  SETUP COMPLETE                        ║")
  console.log("╚════════════════════════════════════════╝")

  console.log("\nISA:")
  console.log(`  Profile PDA: ${isa.childProfilePda.toBase58()}`)
  console.log(`  Child Wallet: ${isa.childWallet.toBase58()}`)
  console.log(`  Guardian: ${deployWallet.publicKey.toBase58()}`)
  console.log(`  Milestones: ${isa.milestoneCount + isaMilestones.length}`)

  console.log("\nSIA:")
  console.log(`  Profile PDA: ${sia.childProfilePda.toBase58()}`)
  console.log(`  Child Wallet: ${sia.childWallet.toBase58()}`)
  console.log(`  Guardian: ${deployWallet.publicKey.toBase58()}`)
  console.log(`  Milestones: ${sia.milestoneCount + siaMilestones.length}`)

  // 18th birthday calculation
  const dob = new Date("2019-03-24T00:00:00Z")
  const eighteenth = new Date(dob)
  eighteenth.setFullYear(eighteenth.getFullYear() + 18)
  const lockTimestamp = Math.floor(eighteenth.getTime() / 1000)

  console.log("\n18TH BIRTHDAY LOCK:")
  console.log(`  DOB: March 24, 2019`)
  console.log(`  18th birthday: ${eighteenth.toISOString().split('T')[0]}`)
  console.log(`  Unix timestamp: ${lockTimestamp}`)
  console.log(`  Human-readable: ${eighteenth.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`)

  console.log("\nCHILD PAGE URLs:")
  console.log(`  Isa: https://toothfairy.network/toothfairy/app/child/isa?g=${deployWallet.publicKey.toBase58()}`)
  console.log(`  Sia: https://toothfairy.network/toothfairy/app/child/sia?g=${deployWallet.publicKey.toBase58()}`)

  console.log("\n⏳ NEXT: Run deposit script when Sathian decides on amounts")
  console.log("   Suggested: 1 SOL per tooth (1 for Isa, 2 for Sia)")
  console.log("   Lock: UntilTimestamp with 18th birthday (March 24, 2037)")
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
