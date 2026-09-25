import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Connection,PublicKey,Transaction} from '@solana/web3.js';
if(process.argv[2]!=='--finish-approved-upload')throw Error('Explicit execution required');
const dir='docs/audits/2026-09-17-continuity-upgrade/',r=JSON.parse(readFileSync(dir+'upload.json'));
const bytes=readFileSync(dir+'candidate.so'),hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(bytes)!==r.candidateSha256||r.buffer!=='AFGaUWV1Jy1cSSodegu9f5kGD4MFEs56khUxv7Bn93br')throw Error('Wrong candidate');
const rpc=parseEnv(readFileSync('C:/Users/sathi/Projects/tooth-fairy-network/.env.local','utf8')).NEXT_PUBLIC_SOLANA_RPC;
const c=new Connection(rpc,'confirmed'),buffer=new PublicKey(r.buffer),payer=new PublicKey(r.payer);
if(await c.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong network');
for(let iteration=0;iteration<100;iteration++){
 const a=await c.getAccountInfo(buffer),balance=await c.getBalance(payer);
 if(!a||a.owner.toBase58()!=='BPFLoaderUpgradeab1e11111111111111111111111'||a.data.readUInt32LE(0)!==1||a.data[4]!==1||new PublicKey(a.data.subarray(5,37)).toBase58()!==r.payer)throw Error('Wrong buffer authority');
 const fees=r.balanceBefore-balance-a.lamports;
 if(fees+400000>r.feeCapLamports)throw Error('Fee cap reached');
 const missing=[];for(let offset=0;offset<bytes.length;offset+=900)if(!a.data.subarray(offset+37,Math.min(offset+900,bytes.length)+37).equals(bytes.subarray(offset,Math.min(offset+900,bytes.length))))missing.push(offset);
 if(!missing.length){Object.assign(r,{status:'uploaded_verified',checkedAt:new Date().toISOString(),bufferLamports:a.lamports,balanceAfter:balance,payerDebitLamports:r.balanceBefore-balance,networkFeesLamports:fees});writeFileSync(dir+'upload.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));process.exit(0);}
 const lifetime=await c.getLatestBlockhash(),offsets=missing.slice(0,20);
 writeFileSync(dir+'chunk-request.json',JSON.stringify({...lifetime,offsets}));
 const signed=spawnSync('wsl.exe',['-d','Ubuntu','--','node','scripts/sign-continuity-chunks.mjs'],{encoding:'utf8'});
 if(signed.status!==0)throw Error('Local bounded signer failed');
 const batch=JSON.parse(readFileSync(dir+'signed-chunks.json'));
 const sent=[];
 for(let start=0;start<batch.length;start++){
  await Promise.all(batch.slice(start,start+1).map(async item=>{
   const tx=Transaction.from(Buffer.from(item.transaction,'base64')),ix=tx.instructions[2];
   if(tx.instructions.slice(0,2).some(i=>i.programId.toBase58()!=='ComputeBudget111111111111111111111111111111')||tx.instructions[0].data.readUInt32LE(1)!==20000||tx.instructions[1].data.readBigUInt64LE(1)!==100000n)throw Error('Fee budget changed');
   if(!offsets.includes(item.offset)||!tx.verifySignatures()||tx.instructions.length!==3||!tx.feePayer.equals(payer)||tx.recentBlockhash!==lifetime.blockhash||ix.programId.toBase58()!=='BPFLoaderUpgradeab1e11111111111111111111111'||!ix.keys[0].pubkey.equals(buffer)||!ix.keys[1].pubkey.equals(payer)||ix.data.readUInt32LE(0)!==1||ix.data.readUInt32LE(4)!==item.offset||!ix.data.subarray(16).equals(bytes.subarray(item.offset,Math.min(item.offset+900,bytes.length))))throw Error('Signed chunk mismatch');
   sent.push(await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:20}));
  }));
  await new Promise(resolve=>setTimeout(resolve,600));
 }
 for(let poll=0;poll<15;poll++){
  const states=(await c.getSignatureStatuses(sent,{searchTransactionHistory:true})).value;
  if(states.some(s=>s?.err))throw Error('Chunk rejected');
  if(states.every(s=>s&&['confirmed','finalized'].includes(s.confirmationStatus)))break;
  await new Promise(resolve=>setTimeout(resolve,700));
 }
 console.log(JSON.stringify({submittedBatch:offsets.length,remainingChunksBeforeBatch:missing.length,iteration}));
}
throw Error('Bounded upload incomplete; reconcile');
