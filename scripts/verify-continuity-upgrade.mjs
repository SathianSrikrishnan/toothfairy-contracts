import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {parseProgramData} from './mainnet-usdc-preflight.mjs';
const phase=process.argv[2];if(!['--before','--after'].includes(phase))throw Error('Explicit verification phase required');
const dir='docs/audits/2026-09-17-continuity-upgrade/',c=new Connection('https://api.mainnet-beta.solana.com','finalized'),hash=b=>createHash('sha256').update(b).digest('hex');
if(await c.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong network');
const addresses=['5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM','6HxuPEcDdy7S7d25325qd1GFeKukPWeF1pQ91N6St69A','7KZTwiFAnXbMMh4KqnPXYYW23ur27S9uS9gLMs16Z19e'];
const data=await c.getMultipleAccountsInfo(addresses.map(a=>new PublicKey(a)));if(data.some(a=>!a))throw Error('Account missing');
const state=parseProgramData(data[0].data),candidate=readFileSync(dir+'candidate.so'),program=data[0].data.subarray(45);
if(state.upgradeAuthority!=='Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko')throw Error('Authority changed');
const receipt={checkedAt:new Date().toISOString(),deployedSlot:state.slot.toString(),upgradeAuthority:state.upgradeAuthority,
 candidateMatches:program.subarray(0,candidate.length).equals(candidate)&&program.subarray(candidate.length).every(b=>b===0),
 deployedSha256:hash(program),sampleDepositHashes:addresses.slice(1).map((address,i)=>({address,owner:data[i+1].owner.toBase58(),sha256:hash(data[i+1].data)}))};
if(phase==='--before'){
 if(receipt.deployedSha256!=='04cc06a3f9b6795b472a3de6e8a2c5b15b0f8d71135f1a5f4034f735e743d1e0')throw Error('Baseline changed');
 if(!existsSync(dir+'before-upgrade.json'))writeFileSync(dir+'before-upgrade.json',JSON.stringify(receipt,null,2),{flag:'wx'});
}else{
 const before=JSON.parse(readFileSync(dir+'before-upgrade.json'));
 if(!receipt.candidateMatches||JSON.stringify(before.sampleDepositHashes)!==JSON.stringify(receipt.sampleDepositHashes))throw Error('Post-upgrade code or existing sample mismatch');
 writeFileSync(dir+'after-upgrade.json',JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify(receipt));
