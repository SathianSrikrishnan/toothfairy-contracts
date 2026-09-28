// Vault 2.0 trust feature (owner yes, 2026-09-28): a second Squads multisig that will hold ONLY the TFN program's
// upgrade authority, with a 7-day time lock. The same three members, 2 of 3, autonomous (no config authority), so
// even its own settings change only by a time-locked vote. Created and paid by the deploy wallet; it needs no member
// signatures to exist. Simulates first; sends only with --execute; verifies from chain.
// Usage (WSL): MAINNET_RPC=... node scripts/mainnet-create-timelock-safe.mjs [--execute]
import * as multisig from '@sqds/multisig';
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const rpc = process.env.MAINNET_RPC;
if (!rpc || !new URL(rpc).hostname.includes('mainnet')) throw Error('MAINNET_RPC required');
const OUT = 'docs/audits/2026-09-28-vault-v2/mainnet-timelock-safe.json';
const connection = new Connection(rpc, 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))));
const MEMBERS = ['5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9', '2UPEsHM9HCwxrfeyGun1Mx312yEktJe9jgF8PsuaTcHb', 'ELrLeuWRUu4yFJfpwNwtxB41MFU3LLw2XGvbpmCbMKQ8'];
const TIME_LOCK = 7 * 24 * 60 * 60; // 604,800 seconds
const THRESHOLD = 2;

async function verify(multisigPda) {
  const m = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda, 'finalized');
  const [vault] = multisig.getVaultPda({ multisigPda, index: 0 });
  const members = m.members.map(x => [x.key.toBase58(), x.permissions.mask]).sort();
  const ok = m.threshold === THRESHOLD && m.timeLock === TIME_LOCK && m.configAuthority.equals(PublicKey.default)
    && JSON.stringify(members) === JSON.stringify(MEMBERS.map(k => [k, 7]).sort());
  return { multisig: multisigPda.toBase58(), vault: vault.toBase58(), threshold: m.threshold, timeLockSeconds: m.timeLock, autonomous: m.configAuthority.equals(PublicKey.default), members, ok };
}

if (existsSync(OUT)) {
  const prior = JSON.parse(readFileSync(OUT, 'utf8'));
  console.log(JSON.stringify(await verify(new PublicKey(prior.multisig)), null, 2));
  process.exit(0); // already created: never create a second one
}
const createKey = Keypair.generate();
const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [programConfigPda] = multisig.getProgramConfigPda({});
const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);
const ix = multisig.instructions.multisigCreateV2({
  treasury: programConfig.treasury, createKey: createKey.publicKey, creator: payer.publicKey, multisigPda,
  configAuthority: null, threshold: THRESHOLD, timeLock: TIME_LOCK, rentCollector: null, memo: 'TFN program upgrades, 7-day delay',
  members: MEMBERS.map(key => ({ key: new PublicKey(key), permissions: multisig.types.Permissions.all() })),
});
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
tx.sign([payer, createKey]);
const sim = await connection.simulateTransaction(tx);
if (sim.value.err) { console.log(JSON.stringify(sim.value, null, 2)); throw Error('Simulation failed; nothing sent'); }
if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ dryRun: true, multisig: multisigPda.toBase58(), vault: multisig.getVaultPda({ multisigPda, index: 0 })[0].toBase58(), timeLock: TIME_LOCK, threshold: THRESHOLD })); process.exit(0); }
const signature = await connection.sendRawTransaction(tx.serialize());
const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'finalized');
if (res.value.err) throw Error(`Create failed on chain ${signature}`);
const receipt = { at: new Date().toISOString(), signature, createKey: createKey.publicKey.toBase58(), ...(await verify(multisigPda)) };
writeFileSync(OUT, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
