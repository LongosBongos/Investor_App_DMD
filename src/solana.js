// src/solana.js
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

/** ================== Konstanten ================== **/
export const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
export const DMD_MINT   = new PublicKey("3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
export const TREASURY   = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV");

// Gründer-SystemAccount (kein Signer in den Ixs außer Founder-only Ops)
export const FOUNDER    = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT");

// SPL Token / ATA Programme
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** ================== PDA Helpers ================== **/
export function findVaultPda() {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
  return pda;
}
export function findBuyerStatePda(vault, buyer) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/** ================== ATA Helpers ================== **/
export function ataFor(owner, mint) {
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

// Preis/Einheiten
export const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
export const solToLamports = (sol) => Math.floor(Number(sol) * LAMPORTS_PER_SOL);
export const lamportsToSol = (lamports) => Number(lamports) / LAMPORTS_PER_SOL;

// 1 SOL = 10_000 DMD
export const dmdForSol = (sol) => Math.round(Number(sol) * 10_000);

/** ================== Ix Builder (Anchor Name & Key-Reihenfolge) ================== **/
// Generic IX factory
export function ix_fromCoder(ixCoder, name, keys, args = {}) {
  const data = ixCoder.encode(name, args);
  return new anchor.web3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

/** ---- initialize(initial_price_sol: u64) [Founder-only] ---- **/
export function ixInitialize(ixCoder, founderPubkey, initialPriceLamports) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, founderPubkey);
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

/** ---- toggle_public_sale(active: bool) [Founder-only] ---- **/
export function ixTogglePublicSale(ixCoder, active, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true  },
  ];
  return ix_fromCoder(ixCoder, "toggle_public_sale", keys, { active });
}

/** ---- whitelist_add(status: bool) [Founder-only] ---- **/
export function ixWhitelistAdd(ixCoder, buyerPubkey, status, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,   isSigner: false, isWritable: false },
    { pubkey: bs,            isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "whitelist_add", keys, { status });
}

/** ---- buy_dmd(sol_contribution: u64) ----
 * founder = SystemAccount (kein Signer), Treasury = SystemAccount, Token-Transfer: vault_ata → buyer_ata (PDA signiert on-chain)
 */
export function ixBuyDmd(ixCoder, buyerPubkey, solContributionLamports, founderSystem = FOUNDER, treasury = TREASURY) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, buyerPubkey);
  const vAta  = vaultAta(vault);
  const bAta  = buyerAta(buyerPubkey);

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
  return ix_fromCoder(ixCoder, "buy_dmd", keys, { sol_contribution: bn(solContributionLamports) });
}

/** ---- claim_reward (v1, nur State-Update) ---- **/
export function ixClaimReward(ixCoder, buyerPubkey) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward", keys, {});
}

/** ---- set_manual_price(lamports_per_10k: u64) [Founder-only] ---- **/
export function ixSetManualPrice(ixCoder, lamportsPer10k, founderPubkey = FOUNDER) {
  const vault = findVaultPda();
  const keys = [
    { pubkey: vault,         isSigner: false, isWritable: true  },
    { pubkey: founderPubkey, isSigner: true,  isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "set_manual_price", keys, { lamports_per_10k: bn(lamportsPer10k) });
}

/** ---- claim_reward_v2 (echter SPL-Transfer vault_ata → buyer_ata) ---- **/
export function ixClaimRewardV2(ixCoder, buyerPubkey) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, buyerPubkey);
  const vAta  = vaultAta(vault);
  const bAta  = buyerAta(buyerPubkey);
  const keys = [
    { pubkey: vault,       isSigner: false, isWritable: true  },
    { pubkey: bs,          isSigner: false, isWritable: true  },
    { pubkey: vAta,        isSigner: false, isWritable: true  },
    { pubkey: bAta,        isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey, isSigner: true,  isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "claim_reward_v2", keys, {});
}

/** ---- sell_dmd_v2(amount_tokens: u64)
 *  Buyer signiert (Token Transfer buyer_ata → vault_ata),
 *  Treasury muss signieren (SOL-Auszahlung),
 *  Founder SystemAccount in Keys (kein Signer).
 *  Hinweis: Im reinen Investor-Frontend üblicherweise deaktivieren,
 *  da der Treasury-Signatur-Flow nicht clientseitig möglich ist.
 */
export function ixSellDmdV2(ixCoder, buyerPubkey, amountTokens, treasurySigner, founderSystem = FOUNDER) {
  const vault = findVaultPda();
  const bs    = findBuyerStatePda(vault, buyerPubkey);
  const vAta  = vaultAta(vault);
  const bAta  = buyerAta(buyerPubkey);

  const keys = [
    { pubkey: vault,              isSigner: false, isWritable: true  },
    { pubkey: bs,                 isSigner: false, isWritable: true  },
    { pubkey: vAta,               isSigner: false, isWritable: true  },
    { pubkey: bAta,               isSigner: false, isWritable: true  },
    { pubkey: treasurySigner,     isSigner: true,  isWritable: true  }, // zahlt SOL
    { pubkey: founderSystem,      isSigner: false, isWritable: true  },
    { pubkey: buyerPubkey,        isSigner: true,  isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return ix_fromCoder(ixCoder, "sell_dmd_v2", keys, { amount_tokens: bn(amountTokens) });
}

export { SystemProgram };
