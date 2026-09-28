// Snapshot every TFN account on mainnet (type, address, lamports, data hash) so an upgrade can be proven
// not to change existing deposits. Usage: MAINNET_RPC=... node scripts/mainnet-state-snapshot.mjs <out.json> [compare.json]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import bs58 from 'bs58';

const rpc = process.env.MAINNET_RPC;
if (!rpc) throw Error('MAINNET_RPC required');
const idl = JSON.parse(readFileSync('docs/audits/2026-09-28-vault-v2/idl.json', 'utf8'));
const call = async (method, params) => { const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Error(j.error.message); return j.result; };
const accounts = [];
for (const a of idl.accounts) {
  const rows = await call('getProgramAccounts', ['FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC', { encoding: 'base64', commitment: 'finalized', filters: [{ memcmp: { offset: 0, bytes: bs58.encode(Buffer.from(a.discriminator)) } }] }]);
  for (const r of rows) accounts.push({ type: a.name, address: r.pubkey, lamports: r.account.lamports, dataSha256: createHash('sha256').update(Buffer.from(r.account.data[0], 'base64')).digest('hex') });
}
accounts.sort((x, y) => x.address.localeCompare(y.address));
const counts = Object.fromEntries(idl.accounts.map(a => [a.name, accounts.filter(x => x.type === a.name).length]));
const out = { at: new Date().toISOString(), counts, accounts };
writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
if (process.argv[3]) {
  const before = new Map(JSON.parse(readFileSync(process.argv[3], 'utf8')).accounts.map(a => [a.address, a]));
  const changed = accounts.filter(a => before.has(a.address) && (before.get(a.address).dataSha256 !== a.dataSha256 || before.get(a.address).lamports !== a.lamports)).map(a => ({ type: a.type, address: a.address }));
  const missing = [...before.keys()].filter(k => !accounts.some(a => a.address === k));
  const added = accounts.filter(a => !before.has(a.address)).map(a => ({ type: a.type, address: a.address }));
  console.log(JSON.stringify({ counts, unchangedExisting: before.size - changed.length - missing.length, changed, missing, added }));
} else console.log(JSON.stringify({ counts }));
