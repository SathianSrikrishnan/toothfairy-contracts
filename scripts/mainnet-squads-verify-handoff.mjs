// Verify Squads tx #6 on the current multisig is exactly the upgrade-authority handoff (resolving any lookup tables).
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey } from '@solana/web3.js';
const c = new Connection(process.env.MAINNET_RPC, 'confirmed');
const M = new PublicKey('1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5');
const ms = await multisig.accounts.Multisig.fromAccountAddress(c, M);
if (BigInt(ms.transactionIndex.toString()) < 6n) { console.log('not yet created'); process.exit(0); }
const [tx] = multisig.getTransactionPda({ multisigPda: M, index: 6n });
const [pp] = multisig.getProposalPda({ multisigPda: M, transactionIndex: 6n });
const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(c, tx);
let keys = vt.message.accountKeys.map(k => k.toBase58());
for (const l of vt.message.addressTableLookups) {
  const t = (await c.getAddressLookupTable(l.accountKey)).value.state.addresses.map(a => a.toBase58());
  keys = keys.concat([...l.writableIndexes].map(i => t[i]));
}
for (const l of vt.message.addressTableLookups) {
  const t = (await c.getAddressLookupTable(l.accountKey)).value.state.addresses.map(a => a.toBase58());
  keys = keys.concat([...l.readonlyIndexes].map(i => t[i]));
}
const ixs = vt.message.instructions.map(ix => ({ program: keys[ix.programIdIndex], accounts: [...ix.accountIndexes].map(i => keys[i]), data: Buffer.from(ix.data).toString('hex') }));
const ok = ixs.length === 1 && ixs[0].program === 'BPFLoaderUpgradeab1e11111111111111111111111' && ixs[0].data === '04000000'
  && JSON.stringify(ixs[0].accounts) === JSON.stringify(['5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM', 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko', '73uggkoDfjoeFeapDgsa1EPai9iMKFqs1QeTH5VPz4LE']);
let status = 'no proposal'; try { const p = await multisig.accounts.Proposal.fromAccountAddress(c, pp); status = `${p.status.__kind} ${p.approved.length}/2`; } catch {}
console.log(JSON.stringify({ transactionIndex: 6, exactlyTheHandoff: ok, status, ixs }));
