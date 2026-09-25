// Read-only release package: no key access, signing, buffer upload or transaction.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {parseUpgradeableProgram,parseProgramData} from './mainnet-usdc-preflight.mjs';
const c=new Connection('https://api.mainnet-beta.solana.com','finalized');
if(await c.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong network');
const hash=x=>createHash('sha256').update(x).digest('hex');
const binary=readFileSync('target/deploy/toothfairy_escrow.so');
if(hash(binary)!=='a21e633835be8c8f1fc686068ccfa9ebc92e8e07e82cc850efa18937236765c0')throw Error('Candidate changed');
const program='FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC';
const account=await c.getAccountInfo(new PublicKey(program));
const {programDataAddress}=parseUpgradeableProgram(account.data);
const data=await c.getAccountInfo(new PublicKey(programDataAddress));
const state=parseProgramData(data.data);
if(state.upgradeAuthority!=='Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko')throw Error('Authority changed');
const baseline=data.data.subarray(45);
const [bufferRent,targetRent,treasuryBalance]=await Promise.all([
 c.getMinimumBalanceForRentExemption(binary.length+37),c.getMinimumBalanceForRentExemption(Math.max(binary.length+45,data.data.length)),
 c.getBalance(new PublicKey('qJk7JvLVgMdYZG2ju4mhyNFFgMc8AUXmuiXWY1bqSv3'))]);
const dir='docs/audits/2026-09-17-continuity-upgrade';mkdirSync(dir,{recursive:true});
for(const [name,bytes] of [['candidate.so',binary],['mainnet-baseline.so',baseline]]){
 const p=dir+'/'+name;if(existsSync(p)){if(hash(readFileSync(p))!==hash(bytes))throw Error('Existing artifact differs');}else writeFileSync(p,bytes,{flag:'wx'});
}
const r={checkedAt:new Date().toISOString(),readOnly:true,program,programDataAddress,upgradeAuthority:state.upgradeAuthority,
 deployedSlot:state.slot.toString(),candidateBytes:binary.length,candidateSha256:hash(binary),baselineBytes:baseline.length,baselineSha256:hash(baseline),
 sourceSha256:hash(readFileSync('programs/toothfairy-escrow/src/lib.rs')),bufferRentLamports:bufferRent,
 permanentTopUpLamports:Math.max(0,targetRent-data.lamports),treasuryBalanceLamports:treasuryBalance,
 temporaryLiquidityShortfallBeforeFeesLamports:Math.max(0,bufferRent+Math.max(0,targetRent-data.lamports)-treasuryBalance),
 bufferUploaded:false,proposalCreated:false,mainnetChanged:false};
writeFileSync(dir+'/preflight.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
