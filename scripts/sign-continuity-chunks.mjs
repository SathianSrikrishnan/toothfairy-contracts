// Local WSL signer. Only writes the reviewed binary into its existing buffer.
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
const dir='docs/audits/2026-09-17-continuity-upgrade/';
const bytes=readFileSync(dir+'candidate.so');
if(createHash('sha256').update(bytes).digest('hex')!=='a21e633835be8c8f1fc686068ccfa9ebc92e8e07e82cc850efa18937236765c0')throw Error('Unapproved binary');
const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(),'.config/solana/id.json'),'utf8'))));
if(key.publicKey.toBase58()!=='5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq')throw Error('Wrong signer');
const batch=JSON.parse(readFileSync(dir+'chunk-request.json','utf8'));
if(batch.offsets.length>40)throw Error('Batch too large');
const signed=batch.offsets.map(offset=>{
 if(!Number.isInteger(offset)||offset<0||offset>=bytes.length||offset%900!==0)throw Error('Invalid offset');
 const part=bytes.subarray(offset,Math.min(offset+900,bytes.length)),data=Buffer.alloc(16+part.length);
 data.writeUInt32LE(1,0);data.writeUInt32LE(offset,4);data.writeBigUInt64LE(BigInt(part.length),8);part.copy(data,16);
 const tx=new Transaction({feePayer:key.publicKey,recentBlockhash:batch.blockhash}).add(new TransactionInstruction({programId:new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),keys:[{pubkey:new PublicKey('AFGaUWV1Jy1cSSodegu9f5kGD4MFEs56khUxv7Bn93br'),isSigner:false,isWritable:true},{pubkey:key.publicKey,isSigner:true,isWritable:false}],data}));
 tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:20000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:100000}));
 tx.sign(key);return {offset,transaction:tx.serialize().toString('base64')};
});
writeFileSync(dir+'signed-chunks.json',JSON.stringify(signed));
