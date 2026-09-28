// Vault 2.0 mainnet canary (owner yes, 2026-09-28): one tiny real gift per coin, through the live contract.
//   deploy wallet swaps a little SOL into USDC and cbBTC (Jupiter), wraps SOL for the Solana coin
//   -> deposits each into a fresh test vault (5-year lock, name "TFN canary")
//   -> the test guardian releases it early to its payout wallet
//   -> the deploy wallet recovers both rents with close_settled_asset_deposit
//   -> the test guardian sends the coins back to the deploy wallet.
// Every transaction is simulated before it is sent; steps are recorded so a rerun resumes, never repeats.
// Usage (WSL): MAINNET_RPC=... node scripts/mainnet-canary.mjs
import anchor from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction,
  createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const rpc = process.env.MAINNET_RPC;
if (!rpc || !new URL(rpc).hostname.includes('mainnet')) throw Error('MAINNET_RPC required');
const DIR = 'docs/audits/2026-09-28-vault-v2';
const STATE = `${DIR}/canary-state.json`, RECEIPT = `${DIR}/mainnet-canary.json`;
const connection = new Connection(rpc, 'confirmed');
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))));
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(deployer), { commitment: 'confirmed' });
const program = new anchor.Program(JSON.parse(readFileSync(`${DIR}/idl.json`, 'utf8')), provider);
const pid = program.programId;
const derive = (...s) => PublicKey.findProgramAddressSync(s, pid)[0];
const le4 = n => new anchor.BN(n).toArrayLike(Buffer, 'le', 4);
const config = derive(Buffer.from('config'));

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
if (!state.guardian) state.guardian = Array.from(Keypair.generate().secretKey);
const guardian = Keypair.fromSecretKey(Uint8Array.from(state.guardian));
const receipt = existsSync(RECEIPT) ? JSON.parse(readFileSync(RECEIPT, 'utf8')) : { startedAt: new Date().toISOString(), guardian: guardian.publicKey.toBase58(), steps: {} };
const save = () => { writeFileSync(STATE, JSON.stringify(state)); writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2)); };
save();
const done = key => !!receipt.steps[key];

// Simulate, then send; record the signature before moving on.
async function send(key, tx, signers) {
  if (done(key)) return receipt.steps[key].signature;
  tx.feePayer ??= deployer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(...signers);
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) throw Error(`${key}: simulation failed ${JSON.stringify(sim.value.err)} ${JSON.stringify(sim.value.logs?.slice(-6))}`);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const res = await connection.confirmTransaction(signature, 'confirmed');
  if (res.value.err) throw Error(`${key}: failed on chain ${signature}`);
  receipt.steps[key] = { signature, at: new Date().toISOString() }; save();
  console.log(key, signature);
  return signature;
}
const units = async a => { try { return BigInt((await getAccount(connection, a)).amount); } catch { return 0n; } };

// 0. The test vault: guardian and payout wallet are one fresh key (as with a parent today, D7).
const profile = derive(Buffer.from('child_profile'), guardian.publicKey.toBuffer());
const milestone = derive(Buffer.from('milestone'), profile.toBuffer(), Buffer.from([0]));
Object.assign(receipt, { childProfile: profile.toBase58(), milestone: milestone.toBase58() });
await send('fund-guardian', new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: guardian.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL })), [deployer]);
await send('create-vault', new Transaction().add(
  await program.methods.initializeChild('TFN canary').accounts({ guardian: guardian.publicKey, childWallet: guardian.publicKey, childProfile: profile, systemProgram: SystemProgram.programId }).instruction(),
  await program.methods.createMilestone({ upperLeftCentralIncisor: {} }, 'urn:tfn:canary:vault-v2-2026-09-28').accounts({ guardian: guardian.publicKey, childProfile: profile, milestone, systemProgram: SystemProgram.programId }).instruction(),
), [deployer, guardian]);

async function jupiterSwap(key, outputMint, lamports) {
  if (done(key)) return;
  const q = await (await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${NATIVE_MINT}&outputMint=${outputMint}&amount=${lamports}&slippageBps=100&onlyDirectRoutes=false`)).json();
  if (!q.outAmount) throw Error(`${key}: no quote ${JSON.stringify(q).slice(0, 200)}`);
  const s = await (await fetch('https://lite-api.jup.ag/swap/v1/swap', { method: 'POST', headers: { 'content-type': 'application/json' },
    // A busy network drops low-fee swaps (first attempt, 2026-09-28): pay a capped priority fee.
    body: JSON.stringify({ quoteResponse: q, userPublicKey: deployer.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 200_000, priorityLevel: 'high' } } }) })).json();
  const tx = VersionedTransaction.deserialize(Buffer.from(s.swapTransaction, 'base64'));
  tx.sign([deployer]);
  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  if (sim.value.err) throw Error(`${key}: swap simulation failed ${JSON.stringify(sim.value.err)}`);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 10 });
  receipt.steps[`${key}-pending`] = { signature, lastValidBlockHeight: s.lastValidBlockHeight }; save();
  // Wait for the whole validity window, so an unconfirmed swap is known dead before any retry.
  const res = await connection.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: s.lastValidBlockHeight }, 'confirmed');
  if (res.value.err) throw Error(`${key}: swap failed on chain ${signature}`);
  receipt.steps[key] = { signature, quotedOut: q.outAmount, at: new Date().toISOString() }; save();
  console.log(key, signature, 'out', q.outAmount);
}

const COINS = [
  { coin: 'dollars', mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), decimals: 6, swapLamports: 8_500_000 },   // ~US$1
  { coin: 'bitcoin', mint: new PublicKey('cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij'), decimals: 8, swapLamports: 12_000_000 },   // ~US$1.40 (> 1,000 sats min)
  { coin: 'solana', mint: NATIVE_MINT, decimals: 9, wrapLamports: 8_500_000 },                                                     // ~US$1 of SOL
];
receipt.coins ??= {};
for (const c of COINS) {
  const source = getAssociatedTokenAddressSync(c.mint, deployer.publicKey);
  const assetConfig = derive(Buffer.from('asset_config'), c.mint.toBuffer());
  const assetMilestone = derive(Buffer.from('asset_milestone'), milestone.toBuffer(), c.mint.toBuffer());
  const treasuryVault = getAssociatedTokenAddressSync(c.mint, assetConfig, true);
  const payout = getAssociatedTokenAddressSync(c.mint, guardian.publicKey);
  const r = receipt.coins[c.coin] ??= {};

  // 1. Get the coin into the deploy wallet.
  if (c.coin === 'solana') {
    await send('solana-wrap', new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, source, deployer.publicKey, NATIVE_MINT),
      SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: source, lamports: c.wrapLamports }),
      createSyncNativeInstruction(source)), [deployer]);
  } else await jupiterSwap(`${c.coin}-swap`, c.mint, c.swapLamports);

  // 2. Deposit it into the test vault, locked 5 years. Index 0 is this vault's first deposit of the coin.
  const deposit = derive(Buffer.from('asset_deposit'), milestone.toBuffer(), c.mint.toBuffer(), le4(0));
  const vault = getAssociatedTokenAddressSync(c.mint, deposit, true);
  if (!done(`${c.coin}-deposit`)) r.amount = (await units(source)).toString();
  if (!done(`${c.coin}-deposit`) && BigInt(r.amount) <= 0n) throw Error(`${c.coin}: nothing to deposit`);
  await send(`${c.coin}-deposit`, new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, vault, deposit, c.mint),
    await program.methods.depositAsset(new anchor.BN(r.amount), { fiveYears: {} }, 'TFN canary').accounts({ depositor: deployer.publicKey, milestone, config, assetConfig, tokenMint: c.mint,
      depositorTokenAccount: source, assetMilestone, assetDeposit: deposit, depositVault: vault, assetTreasuryVault: treasuryVault, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction(),
  ), [deployer]);
  const record = await program.account.tokenDeposit.fetchNullable(deposit);
  if (record) Object.assign(r, { lockedUnits: record.amountUnits.toString(), lockUntil: new Date(record.lockUntil.toNumber() * 1000).toISOString(), feeTaken: (BigInt(r.amount) - BigInt(record.amountUnits.toString())).toString() });

  // 3. The guardian releases it early to its payout wallet.
  await send(`${c.coin}-release`, new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, payout, guardian.publicKey, c.mint),
    await program.methods.earlyWithdrawAssetDeposit().accounts({ guardian: guardian.publicKey, childProfile: profile, milestone, config, tokenMint: c.mint,
      assetMilestone, assetDeposit: deposit, depositVault: vault, childTokenAccount: payout, tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
  ), [deployer, guardian]);
  if (!done(`${c.coin}-return`)) r.releasedUnits = (await units(payout)).toString();

  // 4. The depositor recovers both rents.
  const before = await connection.getBalance(deployer.publicKey);
  await send(`${c.coin}-recover-rent`, new Transaction().add(
    await program.methods.closeSettledAssetDeposit().accounts({ depositor: deployer.publicKey, config, tokenMint: c.mint, assetDeposit: deposit, depositVault: vault, tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
  ), [deployer]);
  r.rentRecoveredLamports ??= (await connection.getBalance(deployer.publicKey)) - before;

  // 5. The coins go back to the deploy wallet (wSOL is unwrapped by closing the accounts).
  const back = new Transaction();
  if (c.coin === 'solana') back.add(createCloseAccountInstruction(payout, deployer.publicKey, guardian.publicKey), createCloseAccountInstruction(source, deployer.publicKey, deployer.publicKey));
  else back.add(createTransferCheckedInstruction(payout, c.mint, source, guardian.publicKey, BigInt(r.releasedUnits), c.decimals), createCloseAccountInstruction(payout, deployer.publicKey, guardian.publicKey));
  await send(`${c.coin}-return`, back, [deployer, guardian]);
  r.passed = r.feeTaken === '0' && r.lockedUnits === r.amount && r.releasedUnits === r.amount;
  save();
  console.log(JSON.stringify({ coin: c.coin, ...r }));
}
// 6. The test guardian's unused SOL goes back too (the vault's profile and milestone rent stays on chain).
if (!done('sweep-guardian')) {
  const left = await connection.getBalance(guardian.publicKey);
  if (left > 0) await send('sweep-guardian', new Transaction().add(SystemProgram.transfer({ fromPubkey: guardian.publicKey, toPubkey: deployer.publicKey, lamports: left })), [deployer, guardian]);
}
receipt.passed = COINS.every(c => receipt.coins[c.coin]?.passed);
receipt.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ passed: receipt.passed }));
