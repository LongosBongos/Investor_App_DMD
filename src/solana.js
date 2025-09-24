// src/solana.js
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// (Optional) Buffer-Polyfill – falls woanders noch gebraucht
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !window.Buffer) window.Buffer = Buffer;

/** ================== Konstanten (ENV-first, mit Fallback) ================== **/
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ?? "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"
);
export const DMD_MINT = new PublicKey(
  import.meta.env.VITE_DMD_MINT ?? "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5"
);
export const TREASURY = new PublicKey(
  import.meta.env.VITE_TREASURY ?? "CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV"
);
export const FOUNDER = new PublicKey(
  import.meta.env.VITE_FOUNDER ?? "AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT"
);

// SPL Token / ATA Programme (konstant)
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"); // korrekt:contentReference[oaicite:1]{index=1}

/** ================== PDA Helpers ================== **/
const u8 = anchor.utils.bytes.utf8;
export function findVaultPda() {
  const [pda] = PublicKey.findProgramAddressSync([u8.encode("vault")], PROGRAM_ID);
  return pda;
}
export function findBuyerStatePda(vault, buyer) {
  const [pda] = PublicKey.findProgramAddressSync(
    [u8.encode("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/** ================== ATA Helpers ================== **/
export function ataFor(owner, mint = DMD_MINT) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}
export const vaultAta = (vault) => ataFor(vault, DMD_MINT);
export const buyerAta = (buyer) => ataFor(buyer, DMD_MINT);

/** ================== Coder & Utils ================== **/
export const buildIxCoder  = (idl) => new anchor.BorshInstructionCoder(idl);
export const buildAccCoder = (idl) => new anchor.BorshAccountsCoder(idl);
export const bn = (x) => new anchor.BN(x);

export const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
export const solToLamports = (sol) => Math.floor(Number(sol) * LAMPORTS_PER_SOL);
export const lamportsToSol = (lamports) => Number(lamports) / LAMPORTS_PER_SOL;

// 1 SOL = 10_000 DMD (laut deiner App-Preislogik)
export const dmdForSol = (sol) => Math.round(Number(sol) * 10_000);

// Generic IX factory (Anchor Borsh)
export function ix_fromCoder(ixCoder, name, keys, args = {}) {
  const data = ixCoder.encode(name, args);
  return new anchor.web3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

// Raw ATA Create Ix (ohne Rent-Sysvar)
export function createAtaIx(payer, ata, owner, mint = DMD_MINT) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true,  isWritable: true  },
      { pubkey: ata,   isSigner: false, isWritable: true  },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint,  isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

/** ================== Gründer/Founder Ops (optional) ================== **/
// initialize(initial_price_sol: u64)
export function ixInitialize(ixCoder, founderPubkey, initialPriceLamports) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, founderPubkey);
  const founderTokenAccount = ataFor(founderPubkey, DMD_MINT);
  const keys = [
    { pubkey: vault,               isSigner: false, isWritable: true  },
    { pubkey: bs,                  isSigner: false, isWritable: true  },
    { pubkey: founderPubkey,       isSigner: true,  isWritable: true  },
    { pubkey: DMD_MINT,            isSigner: false, isWritable: true  },
    { pubkey: founderTokenAccount, isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "initialize", keys, { initial_price_sol: bn(initialPriceLamports) });
}

// toggle_public_sale(active: bool)
export function ixTogglePublicSale(ixCoder, active, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true  },
  ];
  return ix_fromCoder(ixCoder, "toggle_public_sale", keys, { active });
}

// whitelist_add(status: bool) – Founder-only
export function ixWhitelistAdd(ixCoder, buyerPubkey, status, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,   isSigner: false, isWritable: false },
    { pubkey: bs,            isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "whitelist_add", keys, { status });
}

// set_manual_price(lamports_per_10k: u64)
export function ixSetManualPrice(ixCoder, lamportsPer10k, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "set_manual_price", keys, { lamports_per_10k: bn(lamportsPer10k) });
}

/** ================== Investor-relevant (aus IDL) ================== **/
// auto_whitelist_self() – Käufer whitelistet sich selbst (≥ 0,5 SOL)
export function ixAutoWhitelistSelf(ixCoder, buyerPubkey) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "auto_whitelist_self", keys, {}); // vorhanden in IDL:contentReference[oaicite:2]{index=2}
}

// buy_dmd(sol_contribution: u64) – v1
export function ixBuyDmd(ixCoder, buyerPubkey, solContributionLamports, founderSystem = FOUNDER, treasury = TREASURY) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,            isSigner: false, isWritable: true  },
    { pubkey: bs,               isSigner: false, isWritable: true  },
    { pubkey: founderSystem,    isSigner: false, isWritable: true  },
    { pubkey: treasury,         isSigner: false, isWritable: true  },
    { pubkey: vAta,             isSigner: false, isWritable: true  },
    { pubkey: bAta,             isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,      isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "buy_dmd", keys, { sol_contribution: bn(solContributionLamports) }); // IDL:contentReference[oaicite:3]{index=3}
}

// claim_reward_v2() – echter SPL-Transfer vault_ata → buyer_ata
export function ixClaimRewardV2(ixCoder, buyerPubkey) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: vAta,        isSigner: false, isWritable: true  },
    { pubkey: bAta,        isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward_v2", keys, {}); // IDL:contentReference[oaicite:4]{index=4}
}

// swap_exact_sol_for_dmd(amount_in_lamports: u64, min_out_dmd: u64)
export function ixSwapExactSolForDmd(ixCoder, buyerPubkey, amountLamports, minOutDmd) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: vAta,        isSigner: false, isWritable: true  },
    { pubkey: bAta,        isSigner: false, isWritable: true  },
    { pubkey: FOUNDER,     isSigner: false, isWritable: true  },
    { pubkey: TREASURY,    isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "swap_exact_sol_for_dmd", keys, {
    amount_in_lamports: bn(amountLamports),
    min_out_dmd: bn(minOutDmd),
  }); // IDL:contentReference[oaicite:5]{index=5}
}

// swap_exact_dmd_for_sol(amount_in_dmd: u64, min_out_sol: u64)
export function ixSwapExactDmdForSol(ixCoder, buyerPubkey, amountInDmd, minOutLamports) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: vAta,        isSigner: false, isWritable: true  },
    { pubkey: bAta,        isSigner: false, isWritable: true  },
    { pubkey: TREASURY,    isSigner: false, isWritable: true  },
    { pubkey: FOUNDER,     isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "swap_exact_dmd_for_sol", keys, {
    amount_in_dmd: bn(amountInDmd),
    min_out_sol: bn(minOutLamports),
  }); // IDL:contentReference[oaicite:6]{index=6}
}

// sell_dmd_v2(amount_tokens: u64) – Achtung: Treasury muss signieren (Frontend meist disabled)
export function ixSellDmdV2(ixCoder, buyerPubkey, amountTokens, treasurySigner, founderSystem = FOUNDER) {
  const vault = findVaultPda();
  const bs = findBuyerStatePda(vault, buyerPubkey);
  const vAta = vaultAta(vault);
  const bAta = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,          isSigner: false, isWritable: true  },
    { pubkey: bs,             isSigner: false, isWritable: true  },
    { pubkey: vAta,           isSigner: false, isWritable: true  },
    { pubkey: bAta,           isSigner: false, isWritable: true  },
    { pubkey: treasurySigner, isSigner: true,  isWritable: true  }, // zahlt SOL
    { pubkey: founderSystem,  isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,    isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "sell_dmd_v2", keys, { amount_tokens: bn(amountTokens) }); // IDL:contentReference[oaicite:7]{index=7}
}

export { SystemProgram };

