import anchor from '@coral-xyz/anchor';
import {
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROGRAM_ID = 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC';
export const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const DEVNET_RPC = 'https://api.devnet.solana.com';

export function assertDevnetRpc(rpcUrl) {
  const { hostname } = new URL(rpcUrl);
  if (!hostname.toLowerCase().includes('devnet')) {
    throw new Error(`USDC proof transactions require a devnet RPC, received ${hostname}`);
  }
}

export function calculateDepositSplit(grossUnits) {
  const feeUnits = grossUnits / 50n;
  return {
    grossUnits,
    feeUnits,
    netUnits: grossUnits - feeUnits,
  };
}

export function deriveProgramAddresses() {
  const programId = new PublicKey(PROGRAM_ID);
  const derive = (seed) =>
    PublicKey.findProgramAddressSync([Buffer.from(seed)], programId)[0].toBase58();

  return {
    config: derive('config'),
    tokenConfig: derive('token_config'),
    treasury: derive('treasury'),
  };
}

export function deriveProofAddresses(childWalletAddress) {
  const programId = new PublicKey(PROGRAM_ID);
  const childWallet = new PublicKey(childWalletAddress);
  const childProfile = PublicKey.findProgramAddressSync(
    [Buffer.from('child_profile'), childWallet.toBuffer()],
    programId,
  )[0];
  const milestone = PublicKey.findProgramAddressSync(
    [Buffer.from('milestone'), childProfile.toBuffer(), Buffer.from([0])],
    programId,
  )[0];
  const tokenMilestone = PublicKey.findProgramAddressSync(
    [Buffer.from('token_milestone'), milestone.toBuffer()],
    programId,
  )[0];
  const depositIndex = Buffer.alloc(4);
  depositIndex.writeUInt32LE(0);
  const tokenDeposit = PublicKey.findProgramAddressSync(
    [Buffer.from('token_deposit'), milestone.toBuffer(), depositIndex],
    programId,
  )[0];

  return {
    childProfile: childProfile.toBase58(),
    milestone: milestone.toBase58(),
    tokenMilestone: tokenMilestone.toBase58(),
    tokenDeposit: tokenDeposit.toBase58(),
  };
}

export function explorerUrl(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function deriveSolDepositAddress(milestoneAddress) {
  const depositIndex = Buffer.alloc(4);
  depositIndex.writeUInt32LE(0);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('deposit'),
      new PublicKey(milestoneAddress).toBuffer(),
      depositIndex,
    ],
    new PublicKey(PROGRAM_ID),
  )[0].toBase58();
}

export function isCompletedTokenClaim(vaultAmount, depositState) {
  return vaultAmount === 0n && depositState === 1;
}

function json(value) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  );
}

async function loadPayer() {
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const bytes = JSON.parse(await readFile(keypairPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function createContext() {
  const rpcUrl = process.env.TFN_DEVNET_RPC_URL || DEVNET_RPC;
  assertDevnetRpc(rpcUrl);

  const payer = await loadPayer();
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' },
  );
  const idlPath = path.resolve('target', 'idl', 'toothfairy_escrow.json');
  const idl = JSON.parse(await readFile(idlPath, 'utf8'));
  if (idl.address !== PROGRAM_ID) {
    throw new Error(`IDL address ${idl.address} does not match ${PROGRAM_ID}`);
  }

  return {
    connection,
    payer,
    provider,
    program: new anchor.Program(idl, provider),
    authority: payer.publicKey,
    mint: new PublicKey(USDC_MINT),
  };
}

async function fetchSetup(context) {
  const { program } = context;
  const addresses = deriveProgramAddresses();
  const config = new PublicKey(addresses.config);
  const tokenConfig = new PublicKey(addresses.tokenConfig);
  const treasury = new PublicKey(addresses.treasury);

  return {
    addresses,
    keys: { config, tokenConfig, treasury },
    configAccount: await program.account.config.fetchNullable(config),
    tokenConfigAccount: await program.account.tokenConfig.fetchNullable(tokenConfig),
    treasuryAccount: await program.account.treasury.fetchNullable(treasury),
  };
}

async function getAuthorityUsdc(context, createIfMissing) {
  const { connection, payer, authority, mint } = context;
  if (createIfMissing) {
    return getOrCreateAssociatedTokenAccount(connection, payer, mint, authority);
  }

  const address = await anchor.utils.token.associatedAddress({ mint, owner: authority });
  try {
    return await getAccount(connection, address);
  } catch (error) {
    if (String(error).includes('TokenAccountNotFoundError')) return null;
    throw error;
  }
}

async function status() {
  const context = await createContext();
  const setup = await fetchSetup(context);
  const authorityUsdc = await getAuthorityUsdc(context, false);

  return {
    mode: 'status',
    cluster: 'devnet',
    programId: PROGRAM_ID,
    authority: context.authority.toBase58(),
    authoritySolLamports: await context.connection.getBalance(context.authority),
    canonicalUsdcMint: USDC_MINT,
    config: {
      address: setup.addresses.config,
      exists: Boolean(setup.configAccount),
    },
    treasury: {
      address: setup.addresses.treasury,
      exists: Boolean(setup.treasuryAccount),
    },
    tokenConfig: {
      address: setup.addresses.tokenConfig,
      exists: Boolean(setup.tokenConfigAccount),
      allowedMint: setup.tokenConfigAccount?.allowedMint?.toBase58() ?? null,
      decimals: setup.tokenConfigAccount?.decimals ?? null,
    },
    authorityUsdc: authorityUsdc
      ? { address: authorityUsdc.address.toBase58(), amountUnits: authorityUsdc.amount }
      : null,
  };
}

function assertAuthority(account, expected, label) {
  if (!account.authority.equals(expected)) {
    throw new Error(`${label} is controlled by an unexpected authority`);
  }
}

async function initialize() {
  const context = await createContext();
  const { program, authority, mint } = context;
  const mintAccount = await getMint(context.connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
  if (mintAccount.decimals !== 6) {
    throw new Error(`Canonical devnet USDC must use 6 decimals; found ${mintAccount.decimals}`);
  }

  let setup = await fetchSetup(context);
  const signatures = {};

  if (!setup.configAccount) {
    signatures.initializeConfig = await program.methods
      .initializeConfig()
      .accounts({
        authority,
        config: setup.keys.config,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
  if (!setup.treasuryAccount) {
    signatures.initializeTreasury = await program.methods
      .initializeTreasury()
      .accounts({
        authority,
        treasury: setup.keys.treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  setup = await fetchSetup(context);
  assertAuthority(setup.configAccount, authority, 'Config');
  assertAuthority(setup.treasuryAccount, authority, 'Treasury');

  if (!setup.tokenConfigAccount) {
    signatures.initializeTokenConfig = await program.methods
      .initializeTokenConfig()
      .accounts({
        authority,
        config: setup.keys.config,
        tokenConfig: setup.keys.tokenConfig,
        tokenMint: mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  setup = await fetchSetup(context);
  assertAuthority(setup.tokenConfigAccount, authority, 'Token config');
  if (!setup.tokenConfigAccount.allowedMint.equals(mint)) {
    throw new Error('Token config does not allow canonical Circle devnet USDC');
  }
  if (setup.tokenConfigAccount.decimals !== 6) {
    throw new Error('Token config decimals do not match canonical Circle devnet USDC');
  }

  const authorityUsdc = await getAuthorityUsdc(context, true);
  return {
    mode: 'initialize',
    cluster: 'devnet',
    programId: PROGRAM_ID,
    authority: authority.toBase58(),
    canonicalUsdcMint: USDC_MINT,
    addresses: setup.addresses,
    authorityUsdc: {
      address: authorityUsdc.address.toBase58(),
      amountUnits: authorityUsdc.amount,
    },
    signatures: Object.fromEntries(
      Object.entries(signatures).map(([name, signature]) => [
        name,
        { signature, explorer: explorerUrl(signature) },
      ]),
    ),
  };
}

async function prove() {
  const context = await createContext();
  const { connection, payer, program, authority, mint } = context;
  const setup = await fetchSetup(context);
  if (!setup.configAccount || !setup.treasuryAccount || !setup.tokenConfigAccount) {
    throw new Error('Run the initialize mode before proving a deposit');
  }
  assertAuthority(setup.configAccount, authority, 'Config');
  assertAuthority(setup.treasuryAccount, authority, 'Treasury');
  assertAuthority(setup.tokenConfigAccount, authority, 'Token config');
  if (!setup.tokenConfigAccount.allowedMint.equals(mint)) {
    throw new Error('Token config does not allow canonical Circle devnet USDC');
  }

  const grossUnits = 1_250_000n;
  const expected = calculateDepositSplit(grossUnits);
  const source = await getAuthorityUsdc(context, false);
  if (!source || source.amount < grossUnits) {
    throw new Error(
      `Authority needs at least ${grossUnits} canonical devnet USDC units; found ${source?.amount ?? 0n}`,
    );
  }

  const childWallet = Keypair.generate().publicKey;
  const proof = deriveProofAddresses(childWallet.toBase58());
  const childProfile = new PublicKey(proof.childProfile);
  const milestone = new PublicKey(proof.milestone);
  const tokenMilestone = new PublicKey(proof.tokenMilestone);
  const tokenDeposit = new PublicKey(proof.tokenDeposit);

  const childTokenAccount = (
    await getOrCreateAssociatedTokenAccount(connection, payer, mint, childWallet)
  ).address;
  const tokenTreasuryVault = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      setup.keys.tokenConfig,
      true,
    )
  ).address;
  const depositVault = (
    await getOrCreateAssociatedTokenAccount(connection, payer, mint, tokenDeposit, true)
  ).address;

  const createChildSignature = await program.methods
    .initializeChild('TFN Devnet USDC Proof')
    .accounts({ guardian: authority, childWallet, childProfile, systemProgram: SystemProgram.programId })
    .rpc();
  const createMilestoneSignature = await program.methods
    .createMilestone(
      { upperRightCentralIncisor: {} },
      'https://toothfairy.network/devnet/usdc-proof.json',
    )
    .accounts({ guardian: authority, childProfile, milestone, systemProgram: SystemProgram.programId })
    .rpc();

  const sourceBefore = await getAccount(connection, source.address);
  const treasuryBefore = await getAccount(connection, tokenTreasuryVault);
  const childBefore = await getAccount(connection, childTokenAccount);

  const depositSignature = await program.methods
    .depositToken(new anchor.BN(grossUnits.toString()), { immediate: {} }, 'TFN Devnet Proof')
    .accounts({
      depositor: authority,
      milestone,
      config: setup.keys.config,
      tokenConfig: setup.keys.tokenConfig,
      tokenMint: mint,
      depositorTokenAccount: source.address,
      tokenMilestone,
      tokenDeposit,
      depositVault,
      tokenTreasuryVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const sourceAfterDeposit = await getAccount(connection, source.address);
  const treasuryAfterDeposit = await getAccount(connection, tokenTreasuryVault);
  const vaultAfterDeposit = await getAccount(connection, depositVault);
  const depositAccount = await program.account.tokenDeposit.fetch(tokenDeposit);

  if (sourceBefore.amount - sourceAfterDeposit.amount !== expected.grossUnits) {
    throw new Error('Source debit did not match the proof deposit');
  }
  if (treasuryAfterDeposit.amount - treasuryBefore.amount !== expected.feeUnits) {
    throw new Error('Treasury credit did not match the two-percent fee');
  }
  if (vaultAfterDeposit.amount !== expected.netUnits) {
    throw new Error('Deposit vault did not receive the expected net amount');
  }
  if (BigInt(depositAccount.amountUnits.toString()) !== expected.netUnits) {
    throw new Error('On-chain deposit receipt amount did not match the vault');
  }

  const claimSignature = await program.methods
    .claimTokenDeposit()
    .accounts({
      guardian: authority,
      childProfile,
      milestone,
      config: setup.keys.config,
      tokenConfig: setup.keys.tokenConfig,
      tokenMint: mint,
      tokenMilestone,
      tokenDeposit,
      depositVault,
      childTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const childAfter = await getAccount(connection, childTokenAccount);
  const vaultAfterClaim = await getAccount(connection, depositVault);
  const settledDeposit = await program.account.tokenDeposit.fetch(tokenDeposit);
  if (childAfter.amount - childBefore.amount !== expected.netUnits) {
    throw new Error('Child did not receive the expected net USDC amount');
  }
  if (!isCompletedTokenClaim(vaultAfterClaim.amount, settledDeposit.state)) {
    throw new Error('Deposit was not completely settled');
  }

  const receipt = (signature) => ({ signature, explorer: explorerUrl(signature) });
  return {
    mode: 'prove',
    cluster: 'devnet',
    programId: PROGRAM_ID,
    canonicalUsdcMint: USDC_MINT,
    authority: authority.toBase58(),
    childWallet: childWallet.toBase58(),
    accounts: {
      ...proof,
      sourceTokenAccount: source.address.toBase58(),
      childTokenAccount: childTokenAccount.toBase58(),
      depositVault: depositVault.toBase58(),
      tokenTreasuryVault: tokenTreasuryVault.toBase58(),
    },
    units: {
      gross: expected.grossUnits,
      fee: expected.feeUnits,
      net: expected.netUnits,
      childBefore: childBefore.amount,
      childAfter: childAfter.amount,
      treasuryBefore: treasuryBefore.amount,
      treasuryAfter: treasuryAfterDeposit.amount,
    },
    transactions: {
      createChild: receipt(createChildSignature),
      createMilestone: receipt(createMilestoneSignature),
      deposit: receipt(depositSignature),
      claim: receipt(claimSignature),
    },
  };
}

async function solSmoke() {
  const context = await createContext();
  const { connection, program, authority } = context;
  const setup = await fetchSetup(context);
  if (!setup.configAccount || !setup.treasuryAccount) {
    throw new Error('Run the initialize mode before the SOL smoke proof');
  }
  assertAuthority(setup.configAccount, authority, 'Config');
  assertAuthority(setup.treasuryAccount, authority, 'Treasury');

  const childWallet = Keypair.generate().publicKey;
  const proof = deriveProofAddresses(childWallet.toBase58());
  const childProfile = new PublicKey(proof.childProfile);
  const milestone = new PublicKey(proof.milestone);
  const depositAccount = new PublicKey(deriveSolDepositAddress(proof.milestone));
  const grossLamports = 10_000_000n;
  const expected = calculateDepositSplit(grossLamports);

  const createChildSignature = await program.methods
    .initializeChild('TFN SOL Compatibility Proof')
    .accounts({ guardian: authority, childWallet, childProfile, systemProgram: SystemProgram.programId })
    .rpc();
  const createMilestoneSignature = await program.methods
    .createMilestone(
      { upperRightCentralIncisor: {} },
      'https://toothfairy.network/devnet/sol-compatibility-proof.json',
    )
    .accounts({ guardian: authority, childProfile, milestone, systemProgram: SystemProgram.programId })
    .rpc();

  const treasuryBefore = await program.account.treasury.fetch(setup.keys.treasury);
  const childBefore = await connection.getBalance(childWallet);
  const depositSignature = await program.methods
    .deposit(new anchor.BN(grossLamports.toString()), { immediate: {} }, 'TFN Devnet Proof')
    .accounts({
      depositor: authority,
      childProfile,
      milestone,
      depositAccount,
      treasury: setup.keys.treasury,
      config: setup.keys.config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const deposit = await program.account.deposit.fetch(depositAccount);
  const treasuryAfterDeposit = await program.account.treasury.fetch(setup.keys.treasury);
  if (BigInt(deposit.amountLamports.toString()) !== expected.netUnits) {
    throw new Error('Legacy SOL receipt did not record the expected net amount');
  }
  if (
    BigInt(treasuryAfterDeposit.totalCollected.toString()) -
      BigInt(treasuryBefore.totalCollected.toString()) !==
    expected.feeUnits
  ) {
    throw new Error('Legacy SOL treasury did not receive the expected two-percent fee');
  }

  const claimSignature = await program.methods
    .claimDeposit()
    .accounts({
      guardian: authority,
      childProfile,
      milestone,
      depositAccount,
      childWallet,
      config: setup.keys.config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const childAfter = await connection.getBalance(childWallet);
  const settledDeposit = await program.account.deposit.fetch(depositAccount);
  if (BigInt(childAfter - childBefore) !== expected.netUnits || !settledDeposit.claimed) {
    throw new Error('Legacy SOL deposit did not settle to the child wallet');
  }

  const receipt = (signature) => ({ signature, explorer: explorerUrl(signature) });
  return {
    mode: 'sol-smoke',
    cluster: 'devnet',
    programId: PROGRAM_ID,
    authority: authority.toBase58(),
    childWallet: childWallet.toBase58(),
    accounts: {
      childProfile: proof.childProfile,
      milestone: proof.milestone,
      deposit: depositAccount.toBase58(),
      treasury: setup.addresses.treasury,
    },
    lamports: {
      gross: expected.grossUnits,
      fee: expected.feeUnits,
      net: expected.netUnits,
      childBefore,
      childAfter,
    },
    transactions: {
      createChild: receipt(createChildSignature),
      createMilestone: receipt(createMilestoneSignature),
      deposit: receipt(depositSignature),
      claim: receipt(claimSignature),
    },
  };
}

async function main() {
  const mode = process.argv[2] || 'status';
  if (!['status', 'initialize', 'prove', 'sol-smoke'].includes(mode)) {
    throw new Error('Usage: node scripts/devnet-usdc-proof.mjs [status|initialize|prove|sol-smoke]');
  }
  const result =
    mode === 'status'
      ? await status()
      : mode === 'initialize'
        ? await initialize()
        : mode === 'prove'
          ? await prove()
          : await solSmoke();
  process.stdout.write(`${json(result)}\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
