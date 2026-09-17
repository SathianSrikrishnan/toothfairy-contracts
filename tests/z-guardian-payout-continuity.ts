import * as anchor from '@coral-xyz/anchor';
import {Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {expect} from 'chai';

describe('guardian transfer and payout continuity',()=>{
 const provider=anchor.AnchorProvider.env();anchor.setProvider(provider);
 const program=anchor.workspace.ToothfairyEscrow;
 const oldGuardian=provider.wallet.publicKey,newGuardian=Keypair.generate(),child=Keypair.generate().publicKey;
 const derive=(...seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,program.programId)[0];
 const profile=derive(Buffer.from('child_profile'),child.toBuffer()),config=derive(Buffer.from('config'));
 before(async()=>{
  if(!/localhost|127\.0\.0\.1/.test(new URL(provider.connection.rpcEndpoint).hostname))throw Error('Local validator only');
  if(!await program.account.config.fetchNullable(config))await program.methods.initializeConfig().accounts({authority:oldGuardian,config,systemProgram:SystemProgram.programId}).rpc();
  await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({fromPubkey:oldGuardian,toPubkey:newGuardian.publicKey,lamports:100000000})));
  await program.methods.initializeChild('Continuity fixture').accounts({guardian:oldGuardian,childWallet:child,childProfile:profile,systemProgram:SystemProgram.programId}).rpc();
  await program.methods.transferGuardianship().accounts({guardian:oldGuardian,childProfile:profile,newGuardian:newGuardian.publicKey,config}).rpc();
  await program.methods.updateChildWallet().accounts({guardian:newGuardian.publicKey,childProfile:profile,newChildWallet:newGuardian.publicKey}).signers([newGuardian]).rpc();
 });
 const create=(guardian:PublicKey,index:number)=>program.methods.createMilestone({upperRightCentralIncisor:{}},'https://example.test/continuity').accounts({guardian,childProfile:profile,milestone:derive(Buffer.from('milestone'),profile.toBuffer(),Buffer.from([index])),systemProgram:SystemProgram.programId});
 it('allows the new guardian to add a tooth after changing payout',async()=>{
  await create(newGuardian.publicKey,0).signers([newGuardian]).rpc();
  const p=await program.account.childProfile.fetch(profile);
  expect(p.milestoneCount).equal(1);expect(p.childWallet.equals(newGuardian.publicKey)).equal(true);
 });
 it('rejects the former guardian after transfer',async()=>{
  let rejected=false;try{await create(oldGuardian,1).rpc();}catch{rejected=true;}
  expect(rejected).equal(true);
  expect((await program.account.childProfile.fetch(profile)).milestoneCount).equal(1);
 });
});
