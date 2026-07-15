import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { ToothfairyEscrow } from "../target/types/toothfairy_escrow";

describe("USDC escrow V2 deposit rail", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ToothfairyEscrow as Program<ToothfairyEscrow>;
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const guardian = provider.wallet.publicKey;
  const childWallet = Keypair.generate().publicKey;

  let configPda: PublicKey;
  let tokenConfigPda: PublicKey;
  let childProfilePda: PublicKey;
  let milestonePda: PublicKey;
  let tokenMilestonePda: PublicKey;
  let usdcMint: PublicKey;
  let depositorUsdc: PublicKey;
  let tokenTreasuryVault: PublicKey;

  const tokenDepositPda = (index: number) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_deposit"),
        milestonePda.toBuffer(),
        new anchor.BN(index).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    )[0];

  before(async () => {
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
    [tokenConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_config")],
      program.programId,
    );
    [childProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("child_profile"), childWallet.toBuffer()],
      program.programId,
    );
    [milestonePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), childProfilePda.toBuffer(), Buffer.from([0])],
      program.programId,
    );
    [tokenMilestonePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_milestone"), milestonePda.toBuffer()],
      program.programId,
    );

    await program.methods
      .initializeConfig()
      .accounts({
        authority: guardian,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    usdcMint = await createMint(
      provider.connection,
      payer,
      guardian,
      null,
      6,
    );

    await program.methods
      .initializeTokenConfig()
      .accounts({
        authority: guardian,
        config: configPda,
        tokenConfig: tokenConfigPda,
        tokenMint: usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeChild("USDC Test")
      .accounts({
        guardian,
        childWallet,
        childProfile: childProfilePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createMilestone(
        { upperRightCentralIncisor: {} },
        "https://example.com/usdc-test.json",
      )
      .accounts({
        guardian,
        childProfile: childProfilePda,
        milestone: milestonePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    depositorUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        usdcMint,
        guardian,
      )
    ).address;
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      depositorUsdc,
      payer,
      2_000_000,
    );

    tokenTreasuryVault = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        usdcMint,
        tokenConfigPda,
        true,
      )
    ).address;
  });

  async function prepareDepositVault(index: number, mint = usdcMint) {
    const deposit = tokenDepositPda(index);
    const vault = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        deposit,
        true,
      )
    ).address;
    return { deposit, vault };
  }

  async function depositAccounts(index: number) {
    const { deposit, vault } = await prepareDepositVault(index);
    return {
      depositor: guardian,
      milestone: milestonePda,
      config: configPda,
      tokenConfig: tokenConfigPda,
      tokenMint: usdcMint,
      depositorTokenAccount: depositorUsdc,
      tokenMilestone: tokenMilestonePda,
      tokenDeposit: deposit,
      depositVault: vault,
      tokenTreasuryVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  it("moves the exact two-percent fee and locks the net USDC", async () => {
    const accounts = await depositAccounts(0);
    const sourceBefore = await getAccount(provider.connection, depositorUsdc);

    await program.methods
      .depositToken(
        new anchor.BN(1_250_000),
        { threeYears: {} },
        "Dad",
      )
      .accounts(accounts)
      .rpc();

    const sourceAfter = await getAccount(provider.connection, depositorUsdc);
    const depositVault = await getAccount(provider.connection, accounts.depositVault);
    const treasuryVault = await getAccount(provider.connection, tokenTreasuryVault);
    const deposit = await program.account.tokenDeposit.fetch(accounts.tokenDeposit);
    const aggregate = await program.account.tokenMilestone.fetch(tokenMilestonePda);

    expect(Number(sourceBefore.amount - sourceAfter.amount)).to.equal(1_250_000);
    expect(Number(depositVault.amount)).to.equal(1_225_000);
    expect(Number(treasuryVault.amount)).to.equal(25_000);
    expect(deposit.amountUnits.toNumber()).to.equal(1_225_000);
    expect(deposit.depositorName).to.equal("Dad");
    expect(deposit.vault.toBase58()).to.equal(accounts.depositVault.toBase58());
    expect(deposit.lockUntil.toNumber()).to.be.greaterThan(0);
    expect(aggregate.depositCount).to.equal(1);
    expect(aggregate.totalDeposited.toNumber()).to.equal(1_225_000);
  });

  it("rejects a deposit below one cent without creating a receipt", async () => {
    const accounts = await depositAccounts(1);
    try {
      await program.methods
        .depositToken(new anchor.BN(9_999), { immediate: {} }, "Dad")
        .accounts(accounts)
        .rpc();
      expect.fail("Expected TokenDepositTooSmall");
    } catch (error) {
      expect(String(error)).to.include("TokenDepositTooSmall");
    }

    expect(await provider.connection.getAccountInfo(accounts.tokenDeposit)).to.equal(null);
  });

  it("rejects deposits while the global emergency pause is active", async () => {
    const accounts = await depositAccounts(1);
    await program.methods
      .pause()
      .accounts({ authority: guardian, config: configPda })
      .rpc();

    try {
      await program.methods
        .depositToken(new anchor.BN(1_000_000), { immediate: {} }, "Dad")
        .accounts(accounts)
        .rpc();
      expect.fail("Expected ContractPaused");
    } catch (error) {
      expect(String(error)).to.include("ContractPaused");
    } finally {
      await program.methods
        .unpause()
        .accounts({ authority: guardian, config: configPda })
        .rpc();
    }
  });

  it("rejects a different six-decimal mint", async () => {
    const wrongMint = await createMint(
      provider.connection,
      payer,
      guardian,
      null,
      6,
    );
    const wrongSource = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        wrongMint,
        guardian,
      )
    ).address;
    const { deposit, vault } = await prepareDepositVault(1, wrongMint);
    const wrongTreasury = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        wrongMint,
        tokenConfigPda,
        true,
      )
    ).address;

    try {
      await program.methods
        .depositToken(new anchor.BN(1_000_000), { immediate: {} }, "Dad")
        .accounts({
          depositor: guardian,
          milestone: milestonePda,
          config: configPda,
          tokenConfig: tokenConfigPda,
          tokenMint: wrongMint,
          depositorTokenAccount: wrongSource,
          tokenMilestone: tokenMilestonePda,
          tokenDeposit: deposit,
          depositVault: vault,
          tokenTreasuryVault: wrongTreasury,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected WrongTokenMint");
    } catch (error) {
      expect(String(error)).to.include("WrongTokenMint");
    }
  });
});
