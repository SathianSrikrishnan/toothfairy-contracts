// Devnet walk for Vault 2.0, one coin at a time, on the deployed candidate:
//   allowlist at 0% -> TFN deposits "US$10" for 5 years -> guardian releases early (the "Grow it" first half)
//   -> guardian re-locks it as "<name> · grown" to a new date -> TFN recovers the settled deposit's rent.
// Devnet only; refuses any other RPC. Coins: Dollars (6-dec mock), Bitcoin (8-dec mock, cbBTC stand-in), Solana (wSOL).
// Usage (WSL): node scripts/devnet-vault-v2-walk.mjs
import anchor from '@coral-xyz/anchor';
import {
  createMint,
  createSyncNativeInstruction,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const RPC = process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com';
if (!new URL(RPC).hostname.includes('devnet')) throw Error('Devnet only');
const STATE = 'docs/audits/2026-09-28-vault-v2/devnet-walk-state.json';
const RECEIPT = 'docs/audits/2026-09-28-vault-v2/devnet-walk.json';
const EXPECTED_SHA = '6a494ecd047dd64b8fff8ce3443b94ad13161b2ff3895482ec7fc92cb50beae6';

const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))));
const connection = new Connection(RPC, 'confirmed');
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: 'confirmed' });
const idl = JSON.parse(readFileSync('docs/audits/2026-09-28-vault-v2/idl.json', 'utf8'));
const program = new anchor.Program(idl, provider);
const pid = program.programId;
const derive = (...seeds) => PublicKey.findProgramAddressSync(seeds, pid)[0];
const le4 = n => new anchor.BN(n).toArrayLike(Buffer, 'le', 4);

// Keep generated keys private to this machine; the receipt holds public addresses only.
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const keypair = name => {
  if (!state[name]) state[name] = Array.from(Keypair.generate().secretKey);
  return Keypair.fromSecretKey(Uint8Array.from(state[name]));
};
const save = () => writeFileSync(STATE, JSON.stringify(state));
const guardian = keypair('guardian'); // the parent's key; payouts go to it (D7)
save();

const ata = async (mint, owner, offCurve = false) => (await getOrCreateAssociatedTokenAccount(connection, wallet, mint, owner, offCurve)).address;
const units = async account => (await getAccount(connection, account)).amount.toString();
const send = (ixTx, signers = []) => provider.sendAndConfirm(ixTx, signers);

const receipt = { at: new Date().toISOString(), rpc: new URL(RPC).hostname /* never the key */, programId: pid.toBase58(), candidateSha256: EXPECTED_SHA, treasury: wallet.publicKey.toBase58(), guardian: guardian.publicKey.toBase58(), coins: [] };

const config = await program.account.config.fetch(derive(Buffer.from('config')));
if (!config.authority.equals(wallet.publicKey)) throw Error(`Devnet config authority is ${config.authority.toBase58()}, not this wallet; stop.`);
if (config.paused) throw Error('Devnet program is paused; stop.');

// A fresh child for this walk (idempotent through the state file).
if ((await connection.getBalance(guardian.publicKey)) < 0.2 * LAMPORTS_PER_SOL)
  await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: guardian.publicKey, lamports: 0.3 * LAMPORTS_PER_SOL })));
const profile = derive(Buffer.from('child_profile'), guardian.publicKey.toBuffer());
const milestone = derive(Buffer.from('milestone'), profile.toBuffer(), Buffer.from([0]));
if (!(await connection.getAccountInfo(profile))) {
  await program.methods.initializeChild('Devnet Lila').accounts({ guardian: guardian.publicKey, childWallet: guardian.publicKey, childProfile: profile, systemProgram: SystemProgram.programId }).signers([guardian]).rpc();
  await program.methods.createMilestone({ upperLeftCentralIncisor: {} }, 'urn:tfn:devnet:vault-v2-walk').accounts({ guardian: guardian.publicKey, childProfile: profile, milestone, systemProgram: SystemProgram.programId }).signers([guardian]).rpc();
}
receipt.childProfile = profile.toBase58();
receipt.milestone = milestone.toBase58();

async function mintFor(name, decimals, supply) {
  if (name === 'solana') return NATIVE_MINT;
  if (!state[`mint_${name}`]) {
    state[`mint_${name}`] = (await createMint(connection, wallet, wallet.publicKey, null, decimals)).toBase58();
    save();
  }
  const mint = new PublicKey(state[`mint_${name}`]);
  const source = await ata(mint, wallet.publicKey);
  if (BigInt(await units(source)) < BigInt(supply)) await mintTo(connection, wallet, mint, source, wallet, supply);
  return mint;
}

const coins = [
  { coin: 'dollars', decimals: 6, min: 10_000, amount: 10_000_000, name: 'Mum' }, // US$10
  { coin: 'bitcoin', decimals: 8, min: 1_000, amount: 8_900, name: 'Uncle Jay' }, // ~US$10 at ~US$112k
  { coin: 'solana', decimals: 9, min: 1_000_000, amount: 50_000_000, name: 'Grandma Rosa' }, // 0.05 SOL
];

for (const c of coins) {
  const mint = await mintFor(c.coin, c.decimals, c.amount * 4);
  const step = { coin: c.coin, mint: mint.toBase58(), txs: {} };
  const assetConfig = derive(Buffer.from('asset_config'), mint.toBuffer());
  const assetMilestone = derive(Buffer.from('asset_milestone'), milestone.toBuffer(), mint.toBuffer());
  if (!(await connection.getAccountInfo(assetConfig))) {
    step.txs.allowlist = await program.methods.initializeAssetConfig(new anchor.BN(c.min), 0)
      .accounts({ authority: wallet.publicKey, config: derive(Buffer.from('config')), assetConfig, tokenMint: mint, systemProgram: SystemProgram.programId }).rpc();
  }
  const cfg = await program.account.assetConfig.fetch(assetConfig);
  if (cfg.feeBps !== 0 || !cfg.enabled) throw Error(`${c.coin} rail is not 0% and on`);

  const source = await ata(mint, wallet.publicKey);
  if (c.coin === 'solana') {
    await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: source, lamports: c.amount }), createSyncNativeInstruction(source)));
  }
  const treasuryVault = await ata(mint, assetConfig, true);
  const index = (await program.account.assetMilestone.fetchNullable(assetMilestone))?.depositCount ?? 0;
  const deposit = derive(Buffer.from('asset_deposit'), milestone.toBuffer(), mint.toBuffer(), le4(index));
  const depositVault = await ata(mint, deposit, true);

  // 1. TFN's treasury deposits the gift, locked 5 years.
  step.txs.deposit = await program.methods.depositAsset(new anchor.BN(c.amount), { fiveYears: {} }, c.name)
    .accounts({ depositor: wallet.publicKey, milestone, config: derive(Buffer.from('config')), assetConfig, tokenMint: mint, depositorTokenAccount: source, assetMilestone, assetDeposit: deposit, depositVault, assetTreasuryVault: treasuryVault, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
  step.lockedUnits = await units(depositVault);
  if (step.lockedUnits !== String(c.amount)) throw Error(`${c.coin}: locked ${step.lockedUnits}, expected ${c.amount}`);

  // 2. Guardian releases early into their own wallet (the payout wallet).
  const payout = await ata(mint, guardian.publicKey);
  const before = BigInt(await units(payout));
  step.txs.releaseEarly = await program.methods.earlyWithdrawAssetDeposit()
    .accounts({ guardian: guardian.publicKey, childProfile: profile, milestone, config: derive(Buffer.from('config')), tokenMint: mint, assetMilestone, assetDeposit: deposit, depositVault, childTokenAccount: payout, tokenProgram: TOKEN_PROGRAM_ID })
    .signers([guardian]).rpc();
  if (BigInt(await units(payout)) - before !== BigInt(c.amount)) throw Error(`${c.coin}: release amount mismatch`);

  // 3. Grow it: the guardian re-locks the same amount under the same name, 5 years from today.
  // (On mainnet a swap sits between 2 and 3; devnet has no staked/lending mints, so the coin is re-locked as is.)
  const grownDeposit = derive(Buffer.from('asset_deposit'), milestone.toBuffer(), mint.toBuffer(), le4(index + 1));
  const lockUntil = Math.floor(Date.now() / 1000) + 5 * 31_557_600;
  step.txs.grow = await program.methods.depositAsset(new anchor.BN(c.amount), { untilTimestamp: { lockUntil: new anchor.BN(lockUntil) } }, `${c.name} · grown`)
    .accounts({ depositor: guardian.publicKey, milestone, config: derive(Buffer.from('config')), assetConfig, tokenMint: mint, depositorTokenAccount: payout, assetMilestone, assetDeposit: grownDeposit, depositVault: await ata(mint, grownDeposit, true), assetTreasuryVault: treasuryVault, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .signers([guardian]).rpc();
  const grown = await program.account.tokenDeposit.fetch(grownDeposit);
  step.grown = { name: grown.depositorName, units: grown.amountUnits.toString(), lockUntil: new Date(grown.lockUntil.toNumber() * 1000).toISOString() };

  // 4. TFN recovers the rent of the settled original.
  const lamportsBefore = await connection.getBalance(wallet.publicKey);
  step.txs.recoverRent = await program.methods.closeSettledAssetDeposit()
    .accounts({ depositor: wallet.publicKey, config: derive(Buffer.from('config')), tokenMint: mint, assetDeposit: deposit, depositVault, tokenProgram: TOKEN_PROGRAM_ID }).rpc();
  step.rentRecoveredLamports = (await connection.getBalance(wallet.publicKey)) - lamportsBefore;
  if (await connection.getAccountInfo(deposit)) throw Error(`${c.coin}: settled record still open`);

  receipt.coins.push(step);
  console.log(JSON.stringify({ coin: c.coin, locked: step.lockedUnits, grown: step.grown, rentRecoveredLamports: step.rentRecoveredLamports }));
}
receipt.passed = receipt.coins.length === coins.length;
writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ passed: receipt.passed, receipt: RECEIPT }));
