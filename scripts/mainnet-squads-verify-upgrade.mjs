// Read the latest Squads vault transaction for the TFN multisig from chain and prove it is exactly the Vault 2.0
// upgrade: one BPF Upgradeable Loader Upgrade instruction with the expected program, ProgramData, buffer, spill and
// authority. Also prints the proposal's approvals. Read-only. Usage: MAINNET_RPC=... node scripts/mainnet-squads-verify-upgrade.mjs
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
const MULTISIG = new PublicKey('1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5');
const EXPECT = {
  loader: 'BPFLoaderUpgradeab1e11111111111111111111111',
  accounts: ['5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM', 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC', 'HCjDTmWQ4a7A8n4BbJLoXPQuu6uurFu2EQVxTst6mySc',
    '5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq', 'SysvarRent111111111111111111111111111111111', 'SysvarC1ock11111111111111111111111111111111', 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko'],
};
const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG);
const index = BigInt(ms.transactionIndex.toString());
const [txPda] = multisig.getTransactionPda({ multisigPda: MULTISIG, index });
const [proposalPda] = multisig.getProposalPda({ multisigPda: MULTISIG, transactionIndex: index });
const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, txPda);
const keys = vt.message.accountKeys.map(k => k.toBase58());
const ixs = vt.message.instructions.map(ix => ({ program: keys[ix.programIdIndex], accounts: [...ix.accountIndexes].map(i => keys[i]), data: Buffer.from(ix.data).toString('hex') }));
const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
const ok = ixs.length === 1 && ixs[0].program === EXPECT.loader && ixs[0].data === '03000000' && JSON.stringify(ixs[0].accounts) === JSON.stringify(EXPECT.accounts) && vt.vaultIndex === 0;
console.log(JSON.stringify({ transactionIndex: index.toString(), vaultIndex: vt.vaultIndex, threshold: ms.threshold, members: ms.members.map(m => m.key.toBase58()), timeLock: ms.timeLock,
  instructions: ixs, proposalStatus: proposal.status.__kind, approved: proposal.approved.map(k => k.toBase58()), rejected: proposal.rejected.length, exactlyTheVault2Upgrade: ok }, null, 2));
process.exit(ok ? 0 : 1);
