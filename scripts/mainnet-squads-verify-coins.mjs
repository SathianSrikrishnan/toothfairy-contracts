// Verify the latest Squads vault transaction is exactly the coin-settings transaction (3 x initialize_asset_config,
// Dollars/Bitcoin/Solana, fee 0) and print its proposal status. Read-only.
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey } from '@solana/web3.js';
const connection = new Connection(process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
const MULTISIG = new PublicKey('1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5');
const EXPECT = [
  ['BLQ9i2HqfcMD1KCuuCcs46CNPYHw29z4fXfp3Ha5uvZa', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 10_000n],
  ['14d1h2WyR5TCETNxzXo7Y894NRMmxnccaxRo47X13PgY', 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', 1_000n],
  ['6YS4Dw7fpMajpkYY9HUPAfH3uHW7tXLxRoYW5zsA1ip5', 'So11111111111111111111111111111111111111112', 1_000_000n],
];
const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG);
const index = BigInt(ms.transactionIndex.toString());
if (index < 5n) { console.log(JSON.stringify({ transactionIndex: index.toString(), status: 'not yet created' })); process.exit(2); }
const [txPda] = multisig.getTransactionPda({ multisigPda: MULTISIG, index });
const [proposalPda] = multisig.getProposalPda({ multisigPda: MULTISIG, transactionIndex: index });
const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, txPda);
const keys = vt.message.accountKeys.map(k => k.toBase58());
const ixs = vt.message.instructions.map(ix => ({ program: keys[ix.programIdIndex], accounts: [...ix.accountIndexes].map(i => keys[i]), data: Buffer.from(ix.data) }));
const ok = ixs.length === 3 && ixs.every((ix, i) => ix.program === 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC'
  && ix.data.subarray(0, 8).equals(Buffer.from([201, 180, 166, 88, 111, 8, 150, 205])) && ix.data.readBigUInt64LE(8) === EXPECT[i][2] && ix.data.readUInt16LE(16) === 0 && ix.data.length === 18
  && JSON.stringify(ix.accounts) === JSON.stringify(['Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko', '44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X', EXPECT[i][0], EXPECT[i][1], '11111111111111111111111111111111']));
let status = 'no proposal';
try { const p = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda); status = `${p.status.__kind} ${p.approved.length}/2`; } catch {}
console.log(JSON.stringify({ transactionIndex: index.toString(), exactlyTheCoinSettings: ok, status }));
process.exit(ok ? 0 : 1);
