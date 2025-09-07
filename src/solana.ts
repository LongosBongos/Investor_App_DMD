// src/solana.ts
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

/** ================== Konstanten ================== **/
export const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
export const DMD_MINT   = new PublicKey("3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
export const FOUNDER    = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT");
export const TREASURY   = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsS5wdRvZehV");

/** ================== Seeds / PDAs ================== **/
export const VAULT_SEED = Buffer.from("vault");
export const BUYER_SEED = (vault: PublicKey, buyer: PublicKey) =>
  [Buffer.from("buyer"), vault.toBuffer(), buyer.toBuffer()];

export async function findVaultPda(): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress([VAULT_SEED], PROGRAM_ID);
  return pda;
}
export function findVaultPdaSync(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
  return pda;
}

export async function findBuyerPda(vault: PublicKey, buyer: PublicKey): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress(BUYER_SEED(vault, buyer), PROGRAM_ID);
  return pda;
}
export function findBuyerPdaSync(vault: PublicKey, buyer: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(BUYER_SEED(vault, buyer), PROGRAM_ID);
  return pda;
}

/** ================== ATAs ================== **/
export async function getAta(owner: PublicKey): Promise<PublicKey> {
  // allowOwnerOffCurve = true (PDA)
  return await getAssociatedTokenAddress(DMD_MINT, owner, true);
}
export async function getVaultAta(): Promise<PublicKey> {
  return await getAta(findVaultPdaSync());
}
export async function getBuyerAta(buyer: PublicKey): Promise<PublicKey> {
  return await getAta(buyer);
}

/** ================== Utils ================== **/
export const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
export const toLamports  = (sol: number) => Math.floor(Number(sol) * LAMPORTS_PER_SOL);
export const toSol       = (lamports: number | string | bigint) => Number(lamports) / LAMPORTS_PER_SOL;
export const dmdForSol   = (sol: number) => Math.round(Number(sol) * 10_000); // 1 SOL = 10k DMD
export type IAccountMeta = { pubkey: PublicKey; isSigner: boolean; isWritable: boolean };

/** ================== Coder & Ix-Factory ================== **/
export const buildIxCoder  = (idl: any) => new anchor.BorshInstructionCoder(idl);
export const buildAccCoder = (idl: any) => new anchor.BorshAccountsCoder(idl);

export function ix_fromCoder(
  ixCoder: anchor.BorshInstructionCoder,
  name: string,
  keys: IAccountMeta[],
  args: Record<string, any> = {}
): TransactionInstruction {
  const data = ixCoder.encode(name, args);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

/** ================== Ix-Builder passend zur IDL ================== **/

// initialize(initial_price_sol: u64)  – Founder-only
export function ixInitialize(
  ixCoder: anchor.BorshInstructionCoder,
  founderPubkey: PublicKey,
  initialPriceLamports: anchor.BN
): TransactionInstruction {
  const vault = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, founderPubkey);
  const founderAta = PublicKey.findProgramAddressSync(
    [founderPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];

  const keys: IAccountMeta[] = [
    { pubkey: vault,        isSigner: false, isWritable: true  },
    { pubkey: buyerState,   isSigner: false, isWritable: true  },
    { pubkey: founderPubkey,isSigner: true,  isWritable: true  },
    { pubkey: DMD_MINT,     isSigner: false, isWritable: true  },
    { pubkey: founderAta,   isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "initialize", keys, { initial_price_sol: initialPriceLamports });
}

// toggle_public_sale(active: bool) – Founder-only
export function ixTogglePublicSale(
  ixCoder: anchor.BorshInstructionCoder,
  active: boolean,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPdaSync();
  const keys: IAccountMeta[] = [
    { pubkey: vault,         isSigner: false, isWritable: true },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true },
  ];
  return ix_fromCoder(ixCoder, "toggle_public_sale", keys, { active });
}

// whitelist_add(status: bool) – Founder-only
export function ixWhitelistAdd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  status: boolean,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, buyerPubkey);
  const keys: IAccountMeta[] = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,   isSigner: false, isWritable: false },
    { pubkey: buyerState,    isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "whitelist_add", keys, { status });
}

// buy_dmd(sol_contribution: u64)
export function ixBuyDmd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  solContributionLamports: anchor.BN,
  founderSystem: PublicKey = FOUNDER,
  treasury: PublicKey = TREASURY
) {
  const vault      = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, buyerPubkey);
  const vAta = PublicKey.findProgramAddressSync(
    [vault.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];
  const bAta = PublicKey.findProgramAddressSync(
    [buyerPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];

  const keys: IAccountMeta[] = [
    { pubkey: vault,            isSigner: false, isWritable: true  },
    { pubkey: buyerState,       isSigner: false, isWritable: true  },
    { pubkey: founderSystem,    isSigner: false, isWritable: true  },
    { pubkey: treasury,         isSigner: false, isWritable: true  },
    { pubkey: vAta,             isSigner: false, isWritable: true  },
    { pubkey: bAta,             isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,      isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "buy_dmd", keys, { sol_contribution: solContributionLamports });
}

// claim_reward (v1 – nur State)
export function ixClaimReward(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
) {
  const vault      = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, buyerPubkey);
  const keys: IAccountMeta[] = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: buyerState,  isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward", keys, {});
}

// set_manual_price(lamports_per_10k: u64) – Founder-only
export function ixSetManualPrice(
  ixCoder: anchor.BorshInstructionCoder,
  lamportsPer10k: anchor.BN,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPdaSync();
  const keys: IAccountMeta[] = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "set_manual_price", keys, { lamports_per_10k: lamportsPer10k });
}

// claim_reward_v2 (echter SPL-Transfer)
export function ixClaimRewardV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
) {
  const vault      = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, buyerPubkey);
  const vAta = PublicKey.findProgramAddressSync(
    [vault.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];
  const bAta = PublicKey.findProgramAddressSync(
    [buyerPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];

  const keys: IAccountMeta[] = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: buyerState,  isSigner: false, isWritable: true  },
    { pubkey: vAta,        isSigner: false, isWritable: true  },
    { pubkey: bAta,        isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward_v2", keys, {});
}

// sell_dmd_v2(amount_tokens: u64) – Treasury muss signieren!
export function ixSellDmdV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  amountTokens: anchor.BN,
  treasurySigner: PublicKey,
  founderSystem: PublicKey = FOUNDER
) {
  const vault      = findVaultPdaSync();
  const buyerState = findBuyerPdaSync(vault, buyerPubkey);
  const vAta = PublicKey.findProgramAddressSync(
    [vault.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];
  const bAta = PublicKey.findProgramAddressSync(
    [buyerPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  )[0];

  const keys: IAccountMeta[] = [
    { pubkey: vault,              isSigner: false, isWritable: true  },
    { pubkey: buyerState,         isSigner: false, isWritable: true  },
    { pubkey: vAta,               isSigner: false, isWritable: true  },
    { pubkey: bAta,               isSigner: false, isWritable: true  },
    { pubkey: treasurySigner,     isSigner: true,  isWritable: true  }, // zahlt SOL
    { pubkey: founderSystem,      isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,        isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "sell_dmd_v2", keys, { amount_tokens: amountTokens });
}

export { SystemProgram, TOKEN_PROGRAM_ID };
