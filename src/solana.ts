// src/solana.ts
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// Buffer-Polyfill (Vite-safe)
// IMPORTANT: Vite still needs buffer in optimizeDeps/alias (see vite.config.ts).
import { Buffer as BufferPolyfill } from "buffer";

// Attach Buffer to window/globalThis once (browser)
if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) {
  (globalThis as any).Buffer = BufferPolyfill;
}
const Buffer = (globalThis as any).Buffer as typeof BufferPolyfill;

/** ================== Konstanten (ENV-first, mit Fallback) ================== **/
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ??
    "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"
);

export const DMD_MINT = new PublicKey(
  import.meta.env.VITE_DMD_MINT ??
    "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5"
);

export const TREASURY = new PublicKey(
  import.meta.env.VITE_TREASURY ??
    "CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV"
);

export const FOUNDER = new PublicKey(
  import.meta.env.VITE_FOUNDER ??
    "AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT"
);

// SPL Token / ATA Programme
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/** ================== PDA Helpers ================== **/
const u8 = anchor.utils.bytes.utf8;

export function findVaultPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([u8.encode("vault")], PROGRAM_ID);
  return pda;
}

export function findBuyerStatePda(vault: PublicKey, buyer: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [u8.encode("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/** ================== ATA Helpers ================== **/
export function ataFor(owner: PublicKey, mint: PublicKey = DMD_MINT): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export const vaultAta = (vault: PublicKey) => ataFor(vault, DMD_MINT);
export const buyerAta = (buyer: PublicKey) => ataFor(buyer, DMD_MINT);

/** ================== Coder & Utils ================== **/
export const buildIxCoder = (idl: anchor.Idl) =>
  new anchor.BorshInstructionCoder(idl);

export const buildAccCoder = (idl: anchor.Idl) =>
  new anchor.BorshAccountsCoder(idl);

export const bn = (x: number | string | bigint) => new anchor.BN(x);

export const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;

export const solToLamports = (sol: number) =>
  Math.floor(Number(sol) * LAMPORTS_PER_SOL);

export const lamportsToSol = (lamports: number) =>
  Number(lamports) / LAMPORTS_PER_SOL;

export const dmdForSol = (sol: number) => Math.round(Number(sol) * 10_000);

// Generic IX factory (Anchor Borsh)
export function ix_fromCoder(
  ixCoder: anchor.BorshInstructionCoder,
  name: string,
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  args: Record<string, any> = {}
): TransactionInstruction {
  const data = ixCoder.encode(name, args);
  return new anchor.web3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

// Raw ATA Create Ix
export function createAtaIx(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey = DMD_MINT
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

/** ================== Gründer/Founder Ops ================== **/
export function ixInitialize(
  ixCoder: anchor.BorshInstructionCoder,
  founderPubkey: PublicKey,
  initialPriceLamports: number | bigint
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, founderPubkey);
  const founderTokenAccount = ataFor(founderPubkey, DMD_MINT);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: founderPubkey, isSigner: true, isWritable: true },
    { pubkey: DMD_MINT, isSigner: false, isWritable: true },
    { pubkey: founderTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "initialize", keys, {
    initial_price_sol: bn(initialPriceLamports),
  });
}

export function ixTogglePublicSale(
  ixCoder: anchor.BorshInstructionCoder,
  active: boolean,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: founderPubkey, isSigner: true, isWritable: true },
  ];
  return ix_fromCoder(ixCoder, "toggle_public_sale", keys, { active });
}

export function ixWhitelistAdd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  status: boolean,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: false, isWritable: false },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: founderPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "whitelist_add", keys, { status });
}

export function ixSetManualPrice(
  ixCoder: anchor.BorshInstructionCoder,
  lamportsPer10k: number | bigint,
  founderPubkey: PublicKey = FOUNDER
) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: founderPubkey, isSigner: true, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "set_manual_price", keys, {
    lamports_per_10k: bn(lamportsPer10k),
  });
}

/** ================== Investor Ops ================== **/
export function ixAutoWhitelistSelf(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "auto_whitelist_self", keys, {});
}

export function ixBuyDmd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  solContributionLamports: number | bigint,
  founderSystem: PublicKey = FOUNDER,
  treasury: PublicKey = TREASURY
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: founderSystem, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: vAta, isSigner: false, isWritable: true },
    { pubkey: bAta, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "buy_dmd", keys, {
    sol_contribution: bn(solContributionLamports),
  });
}

export function ixClaimRewardV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: vAta, isSigner: false, isWritable: true },
    { pubkey: bAta, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward_v2", keys, {});
}

export function ixSwapExactSolForDmd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  amountLamports: number | bigint,
  minOutDmd: number | bigint
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: vAta, isSigner: false, isWritable: true },
    { pubkey: bAta, isSigner: false, isWritable: true },
    { pubkey: FOUNDER, isSigner: false, isWritable: true },
    { pubkey: TREASURY, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "swap_exact_sol_for_dmd", keys, {
    amount_in_lamports: bn(amountLamports),
    min_out_dmd: bn(minOutDmd),
  });
}

export function ixSwapExactDmdForSol(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  amountInDmd: number | bigint,
  minOutLamports: number | bigint
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: vAta, isSigner: false, isWritable: true },
    { pubkey: bAta, isSigner: false, isWritable: true },
    { pubkey: TREASURY, isSigner: false, isWritable: true },
    { pubkey: FOUNDER, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "swap_exact_dmd_for_sol", keys, {
    amount_in_dmd: bn(amountInDmd),
    min_out_sol: bn(minOutLamports),
  });
}

export function ixSellDmdV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  amountTokens: number | bigint,
  treasurySigner: PublicKey,
  founderSystem: PublicKey = FOUNDER
) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: bs, isSigner: false, isWritable: true },
    { pubkey: vAta, isSigner: false, isWritable: true },
    { pubkey: bAta, isSigner: false, isWritable: true },
    { pubkey: treasurySigner, isSigner: true, isWritable: true },
    { pubkey: founderSystem, isSigner: false, isWritable: true },
    { pubkey: buyerPubkey, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "sell_dmd_v2", keys, {
    amount_tokens: bn(amountTokens),
  });
}

export { SystemProgram };



