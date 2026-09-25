import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Keypair,PublicKey,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
const dir='docs/audits/2026-09-17-continuity-upgrade/';
const r=JSON.parse(readFileSync(dir+'upload.json')),request=JSON.parse(readFileSync(dir+'handoff-request.json'));
if(r.status!=='uploaded_verified'||r.buffer!=='AFGaUWV1Jy1cSSodegu9f5kGD4MFEs56khUxv7Bn93br')throw Error('Unverified buffer');
const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(),'.config/solana/id.json'),'utf8'))));
if(key.publicKey.toBase58()!==r.payer)throw Error('Wrong signer');
const data=Buffer.alloc(4);data.writeUInt32LE(4);
const tx=new Transaction({feePayer:key.publicKey,recentBlockhash:request.blockhash}).add(
 ComputeBudgetProgram.setComputeUnitLimit({units:20000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:100000}),
 new TransactionInstruction({programId:new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),keys:[{pubkey:new PublicKey(r.buffer),isSigner:false,isWritable:true},{pubkey:key.publicKey,isSigner:true,isWritable:false},{pubkey:new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko'),isSigner:false,isWritable:false}],data}));
tx.sign(key);writeFileSync(dir+'signed-handoff.json',JSON.stringify({transaction:tx.serialize().toString('base64')}));
