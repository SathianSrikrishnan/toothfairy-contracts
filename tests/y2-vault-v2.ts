import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  createSyncNativeInstruction,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { ToothfairyEscrow } from "../target/types/toothfairy_escrow";

// Vault 2.0 on the asset rails: Dollars at 0%, Solana as wrapped SOL, "Grow it" (release early and
// re-lock under the same name), rent recovery for settled deposits, and the close-profile safety fix.
describe("vault 2.0 (dollars at 0%, solana, grow it, rent recovery)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ToothfairyEscrow as Program<ToothfairyEscrow>;
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const authority = provider.wallet.publicKey;
  const guardian = Keypair.generate();
  const treasury = Keypair.generate(); // TFN's depositing treasury
  const outsider = Keypair.generate();
  const child = Keypair.generate(); // payout wallet: the parent's own wallet today (D7)

  const derive = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const le4 = (n: number) => new anchor.BN(n).toArrayLike(Buffer, "le", 4);
  const configPda = derive(Buffer.from("config"));
  const profilePda = derive(Buffer.from("child_profile"), child.publicKey.toBuffer());
  const milestonePda = derive(Buffer.from("milestone"), profilePda.toBuffer(), Buffer.from([0]));
  const assetConfigPda = (mint: PublicKey) => derive(Buffer.from("asset_config"), mint.toBuffer());
  const assetMilestonePda = (mint: PublicKey) => derive(Buffer.from("asset_milestone"), milestonePda.toBuffer(), mint.toBuffer());
  const assetDepositPda = (mint: PublicKey, i: number) =>
    derive(Buffer.from("asset_deposit"), milestonePda.toBuffer(), mint.toBuffer(), le4(i));

  let usdc: PublicKey; // a 6-decimal dollar mint standing in for USDC
  const fund = async (to: PublicKey, lamports = 2 * LAMPORTS_PER_SOL) =>
    provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: authority, toPubkey: to, lamports })));
  const ata = async (mint: PublicKey, owner: PublicKey, offCurve = false) =>
    (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, owner, offCurve)).address;
  const balance = async (account: PublicKey) => Number((await getAccount(provider.connection, account)).amount);

  async function expectError(promise: Promise<unknown>, code: string) {
    try {
      await promise;
    } catch (error) {
      expect(String(error)).to.include(code);
      return;
    }
    expect.fail(`Expected ${code}`);
  }

  const allowlist = (mint: PublicKey, min: number) =>
    program.methods
      .initializeAssetConfig(new anchor.BN(min), 0)
      .accounts({ authority, config: configPda, assetConfig: assetConfigPda(mint), tokenMint: mint, systemProgram: SystemProgram.programId })
      .rpc();

  async function depositAsset(who: Keypair, mint: PublicKey, index: number, amount: number, lock: object, name: string) {
    const deposit = assetDepositPda(mint, index);
    const accounts = {
      depositor: who.publicKey,
      milestone: milestonePda,
      config: configPda,
      assetConfig: assetConfigPda(mint),
      tokenMint: mint,
      depositorTokenAccount: await ata(mint, who.publicKey),
      assetMilestone: assetMilestonePda(mint),
      assetDeposit: deposit,
      depositVault: await ata(mint, deposit, true),
      assetTreasuryVault: await ata(mint, assetConfigPda(mint), true),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
    await program.methods.depositAsset(new anchor.BN(amount), lock as never, name).accounts(accounts).signers([who]).rpc();
    return accounts;
  }

  const earlyRelease = async (mint: PublicKey, index: number) =>
    program.methods
      .earlyWithdrawAssetDeposit()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: profilePda,
        milestone: milestonePda,
        config: configPda,
        tokenMint: mint,
        assetMilestone: assetMilestonePda(mint),
        assetDeposit: assetDepositPda(mint, index),
        depositVault: await ata(mint, assetDepositPda(mint, index), true),
        childTokenAccount: await ata(mint, child.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([guardian])
      .rpc();

  const closeDeposit = async (who: Keypair, mint: PublicKey, index: number) =>
    program.methods
      .closeSettledAssetDeposit()
      .accounts({
        depositor: who.publicKey,
        config: configPda,
        tokenMint: mint,
        assetDeposit: assetDepositPda(mint, index),
        depositVault: await ata(mint, assetDepositPda(mint, index), true),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  before(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(provider.connection.rpcEndpoint).hostname)) throw Error("Local validator only");
    const existing = await program.account.config.fetchNullable(configPda);
    if (!existing) {
      await program.methods.initializeConfig().accounts({ authority, config: configPda, systemProgram: SystemProgram.programId }).rpc();
    }
    await Promise.all([guardian, treasury, outsider, child].map(k => fund(k.publicKey)));

    usdc = await createMint(provider.connection, payer, authority, null, 6);
    await mintTo(provider.connection, payer, usdc, await ata(usdc, treasury.publicKey), payer, 100_000_000);

    await program.methods
      .initializeChild("Lila")
      .accounts({ guardian: guardian.publicKey, childWallet: child.publicKey, childProfile: profilePda, systemProgram: SystemProgram.programId })
      .signers([guardian])
      .rpc();
    await program.methods
      .createMilestone({ upperLeftCentralIncisor: {} }, "urn:tfn:reserve:vault-v2-test")
      .accounts({ guardian: guardian.publicKey, childProfile: profilePda, milestone: milestonePda, systemProgram: SystemProgram.programId })
      .signers([guardian])
      .rpc();
  });

  it("Dollars on the rails at 0%: the whole US$10 is locked for the child", async () => {
    await allowlist(usdc, 10_000);
    const d = await depositAsset(treasury, usdc, 0, 10_000_000, { fiveYears: {} }, "Mum");
    expect(await balance(d.depositVault)).to.equal(10_000_000);
    expect(await balance(d.assetTreasuryVault)).to.equal(0);
    expect((await program.account.tokenDeposit.fetch(d.assetDeposit)).amountUnits.toNumber()).to.equal(10_000_000);
  });

  it("Solana as wrapped SOL: 0.08 SOL locked, released early only by the guardian, to the payout wallet", async () => {
    await allowlist(NATIVE_MINT, 1_000_000);
    const wsol = await ata(NATIVE_MINT, treasury.publicKey);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: wsol, lamports: 100_000_000 }),
        createSyncNativeInstruction(wsol),
      ),
      [treasury],
    );
    const d = await depositAsset(treasury, NATIVE_MINT, 0, 80_000_000, { fiveYears: {} }, "Grandma Rosa");
    expect(await balance(d.depositVault)).to.equal(80_000_000);

    await earlyRelease(NATIVE_MINT, 0);
    expect(await balance(await ata(NATIVE_MINT, child.publicKey))).to.equal(80_000_000);
    const aggregate = await program.account.assetMilestone.fetch(assetMilestonePda(NATIVE_MINT));
    expect(aggregate.totalSettled.toNumber()).to.equal(80_000_000);
  });

  it("Grow it: release early, re-lock under the same name to a new date; the old record stays until closed", async () => {
    await earlyRelease(usdc, 0);
    const newDate = Math.floor(Date.now() / 1000) + 5 * 31_557_600 + 86_400;
    const grown = await depositAsset(child, usdc, 1, 10_000_000, { untilTimestamp: { lockUntil: new anchor.BN(newDate) } }, "Mum · grown");
    const record = await program.account.tokenDeposit.fetch(grown.assetDeposit);
    expect(record.depositorName).to.equal("Mum · grown");
    expect(record.lockUntil.toNumber()).to.equal(newDate);
    expect(record.depositor.equals(child.publicKey)).to.equal(true);
    expect((await program.account.tokenDeposit.fetch(assetDepositPda(usdc, 0))).state).to.equal(3);
  });

  it("rent recovery refuses an active deposit and anyone but the original depositor", async () => {
    await expectError(closeDeposit(child, usdc, 1), "DepositStillActive");
    await expectError(closeDeposit(outsider, usdc, 0), "NotOriginalDepositor");
  });

  it("rent recovery returns both rents of a settled deposit to the depositor and removes both accounts", async () => {
    const deposit = assetDepositPda(usdc, 0);
    const vault = await ata(usdc, deposit, true);
    const rent = (await provider.connection.getBalance(deposit)) + (await provider.connection.getBalance(vault));
    const before = await provider.connection.getBalance(treasury.publicKey);
    await closeDeposit(treasury, usdc, 0);
    const after = await provider.connection.getBalance(treasury.publicKey);
    expect(after - before).to.be.greaterThan(rent - 10_000); // less the transaction fee
    expect(await provider.connection.getAccountInfo(deposit)).to.equal(null);
    expect(await provider.connection.getAccountInfo(vault)).to.equal(null);
    // The aggregate keeps counting up, so a closed address is never reused.
    expect((await program.account.assetMilestone.fetch(assetMilestonePda(usdc))).depositCount).to.equal(2);
    await expectError(closeDeposit(treasury, usdc, 0), "AccountNotInitialized");
  });

  it("rent recovery refuses a settled deposit whose vault holds stray tokens", async () => {
    const vault = await ata(NATIVE_MINT, assetDepositPda(NATIVE_MINT, 0), true);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: outsider.publicKey, toPubkey: vault, lamports: 5_000 }),
        createSyncNativeInstruction(vault),
      ),
      [outsider],
    );
    await expectError(closeDeposit(treasury, NATIVE_MINT, 0), "AssetVaultNotEmpty");
  });

  it("a milestone can no longer be closed, so no child's release path can be removed", async () => {
    await expectError(
      program.methods
        .closeMilestone()
        .accounts({ guardian: guardian.publicKey, childProfile: profilePda, milestone: milestonePda })
        .signers([guardian])
        .rpc(),
      "MilestoneHasActiveDeposits",
    );
  });

  it("a profile with a milestone cannot be closed and re-created by anyone else as its guardian", async () => {
    // Before this fix the SOL-only totals (0 = 0) let a dollars-only profile close.
    await expectError(
      program.methods.closeProfile().accounts({ guardian: guardian.publicKey, childProfile: profilePda }).signers([guardian]).rpc(),
      "ProfileHasActiveDeposits",
    );
    await expectError(
      program.methods
        .initializeChild("Takeover")
        .accounts({ guardian: outsider.publicKey, childWallet: child.publicKey, childProfile: profilePda, systemProgram: SystemProgram.programId })
        .signers([outsider])
        .rpc(),
      "already in use",
    );
  });

  it("an empty profile (no milestones) can still close and return its rent", async () => {
    const lonelyWallet = Keypair.generate().publicKey;
    const lonely = derive(Buffer.from("child_profile"), lonelyWallet.toBuffer());
    await program.methods
      .initializeChild("Empty")
      .accounts({ guardian: guardian.publicKey, childWallet: lonelyWallet, childProfile: lonely, systemProgram: SystemProgram.programId })
      .signers([guardian])
      .rpc();
    await program.methods.closeProfile().accounts({ guardian: guardian.publicKey, childProfile: lonely }).signers([guardian]).rpc();
    expect(await provider.connection.getAccountInfo(lonely)).to.equal(null);
  });
});
