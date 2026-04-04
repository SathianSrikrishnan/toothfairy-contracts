/**
 * Send 0.01 SOL from deploy wallet to Sathian's Phantom for tx fees
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RPC_URL = process.env.HELIUS_RPC_URL;
if (!RPC_URL) throw new Error('HELIUS_RPC_URL not set');
const PHANTOM_GUARDIAN = new PublicKey("5fWRv9gLT23uZnrRXRtCrqnQG1y8E4h2NftrVh9YdYq9")

const keypairPath = process.env.DEPLOY_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
const deployWallet = Keypair.fromSecretKey(Uint8Array.from(keypairData))

const connection = new Connection(RPC_URL, "confirmed")

async function main() {
  const amount = 0.015 * 1e9 // 0.015 SOL — enough for ~30 claim transactions
  console.log(`Sending ${amount / 1e9} SOL from deploy wallet to Phantom guardian...`)
  console.log(`  From: ${deployWallet.publicKey.toBase58()}`)
  console.log(`  To:   ${PHANTOM_GUARDIAN.toBase58()}`)

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: deployWallet.publicKey,
      toPubkey: PHANTOM_GUARDIAN,
      lamports: amount,
    })
  )

  const sig = await sendAndConfirmTransaction(connection, tx, [deployWallet])
  console.log(`\n✓ Sent! Tx: ${sig}`)
  console.log(`→ https://solscan.io/tx/${sig}`)

  const bal = await connection.getBalance(PHANTOM_GUARDIAN)
  console.log(`\nPhantom balance now: ${bal / 1e9} SOL`)
}

main().catch(err => { console.error("FATAL:", err); process.exit(1) })
