// src/solana.ts
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Buffer as BufferPolyfill } from "buffer";

// --------------------------------------------------
// Buffer polyfill (Vite/browser safe)
// --------------------------------------------------
if (
  typeof globalThis !== "undefined" &&
  !(globalThis as { Buffer?: typeof BufferPolyfill }).Buffer
) {
  (globalThis as { Buffer?: typeof BufferPolyfill }).Buffer = BufferPolyfill;
}
const Buffer = (globalThis as { Buffer: typeof BufferPolyfill }).Buffer;

// --------------------------------------------------
// Hard production truth
// No ENV overrides for protocol-critical addresses.
// --------------------------------------------------
export const PROGRAM_ID = new PublicKey(
  "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"
);

export const DMD_MINT = new PublicKey(
  "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5"
);

export const PROTOCOL_OWNER = new PublicKey(
  "GsnjzePaFi2fq4wBYDuRYSfXiMQ1NsFmAYVdhvKUWoXm"
);

export const TREASURY = new PublicKey(
  "9fAjEDdFjmGwwxh5fyUhDsbyg8RwE7TR12Y25iD4FCoS"
);

export const ADMIN_WALLET = new PublicKey(
  "EGPTLNcdpG4vpfo3thjWJ5FEiPk3n88ppR1dtHTKejbP"
);

// Compatibility export for the current App.tsx import surface.
// This is intentionally mapped to the current protocol owner truth.
export const FOUNDER = PROTOCOL_OWNER;

// SPL / ATA programs
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// --------------------------------------------------
// Seeds / PDA helpers
// --------------------------------------------------
const utf8 = anchor.utils.bytes.utf8;

const VAULT_SEED = utf8.encode("vault");
const BUYER_SEED = utf8.encode("buyer");
const VAULT_CONFIG_V2_SEED = utf8.encode("vault-config-v2");
const BUYER_STATE_EXT_V2_SEED = utf8.encode("buyer-ext-v2");

export function findVaultPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
  return pda;
}

export function findVaultConfigV2Pda(
  vault: PublicKey = findVaultPda()
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_CONFIG_V2_SEED, vault.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function findBuyerStatePda(
  vault: PublicKey,
  buyer: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BUYER_SEED, vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function findBuyerStateExtV2Pda(
  vault: PublicKey,
  buyer: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BUYER_STATE_EXT_V2_SEED, vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// --------------------------------------------------
// ATA helpers
// --------------------------------------------------
export function ataFor(
  owner: PublicKey,
  mint: PublicKey = DMD_MINT
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export const vaultAta = (vault: PublicKey = findVaultPda()) =>
  ataFor(vault, DMD_MINT);
export const buyerAta = (buyer: PublicKey) => ataFor(buyer, DMD_MINT);

// --------------------------------------------------
// IDL coders / generic utils
// --------------------------------------------------
export const buildIxCoder = (idl: anchor.Idl) =>
  new anchor.BorshInstructionCoder(idl);

export const buildAccCoder = (idl: anchor.Idl) =>
  new anchor.BorshAccountsCoder(idl);

export const bn = (value: number | string | bigint) => new anchor.BN(value);

export const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;

export const solToLamports = (sol: number): number =>
  Math.floor(Number(sol) * LAMPORTS_PER_SOL);

export const lamportsToSol = (lamports: number | bigint | string): number =>
  Number(lamports) / LAMPORTS_PER_SOL;

export const dmdForSol = (sol: number): number =>
  Math.round(Number(sol) * 10_000);

export type AccountMetaLike = {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
};

export function ix_fromCoder(
  ixCoder: anchor.BorshInstructionCoder,
  name: string,
  keys: AccountMetaLike[],
  args: Record<string, unknown> = {}
): TransactionInstruction {
  const data = ixCoder.encode(name, args);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}

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

// --------------------------------------------------
// Runtime truth helpers
// --------------------------------------------------
export const DMD_RUNTIME_TRUTH = {
  programId: PROGRAM_ID,
  mint: DMD_MINT,
  protocolOwner: PROTOCOL_OWNER,
  treasury: TREASURY,
  admin: ADMIN_WALLET,
} as const;

export function isProtocolOwner(
  pubkey: PublicKey | null | undefined
): boolean {
  return !!pubkey && pubkey.equals(PROTOCOL_OWNER);
}

export function isTreasury(pubkey: PublicKey | null | undefined): boolean {
  return !!pubkey && pubkey.equals(TREASURY);
}

// --------------------------------------------------
// On-chain account shapes (decode helpers for later App hardening)
// --------------------------------------------------
export type VaultAccountDecoded = {
  owner: PublicKey;
  totalSupply: anchor.BN;
  presaleSold: anchor.BN;
  initialPriceSol: anchor.BN;
  publicSaleActive: boolean;
  mint: PublicKey;
  mintDecimals: number;
};

export type VaultConfigV2Decoded = {
  treasury: PublicKey;
  manualPriceLamportsPer10k: anchor.BN;
  dynamicPricingEnabled: boolean;
  sellLive: boolean;
};

export type BuyerStateDecoded = {
  totalDmd: anchor.BN;
  lastRewardClaim: anchor.BN;
  lastSell: anchor.BN;
  holdingSince: anchor.BN;
  lastBuyDay: anchor.BN;
  buyCountToday: anchor.BN;
  whitelisted: boolean;
};

export type BuyerStateExtV2Decoded = {
  buyCooldownUntil: anchor.BN;
  sellWindowStart: anchor.BN;
  sellCountWindow: number;
  extraSellApprovals: number;
  firstClaimDone: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid decoded account object.");
  }
  return value as Record<string, unknown>;
}

function requirePubkey(value: unknown, field: string): PublicKey {
  if (value instanceof PublicKey) return value;
  throw new Error(`Decoded field '${field}' is not a PublicKey.`);
}

function requireBn(value: unknown, field: string): anchor.BN {
  if (value instanceof anchor.BN) return value;
  if (typeof value === "bigint") return new anchor.BN(value.toString());
  if (typeof value === "number" && Number.isFinite(value)) {
    return new anchor.BN(value);
  }
  throw new Error(`Decoded field '${field}' is not a BN-compatible value.`);
}

function requireBool(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  throw new Error(`Decoded field '${field}' is not a boolean.`);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`Decoded field '${field}' is not a number.`);
}

export function normalizeVaultAccount(decoded: unknown): VaultAccountDecoded {
  const obj = asRecord(decoded);
  return {
    owner: requirePubkey(obj.owner, "owner"),
    totalSupply: requireBn(obj.totalSupply ?? obj.total_supply, "totalSupply"),
    presaleSold: requireBn(obj.presaleSold ?? obj.presale_sold, "presaleSold"),
    initialPriceSol: requireBn(
      obj.initialPriceSol ?? obj.initial_price_sol,
      "initialPriceSol"
    ),
    publicSaleActive: requireBool(
      obj.publicSaleActive ?? obj.public_sale_active,
      "publicSaleActive"
    ),
    mint: requirePubkey(obj.mint, "mint"),
    mintDecimals: requireNumber(
      obj.mintDecimals ?? obj.mint_decimals,
      "mintDecimals"
    ),
  };
}

export function normalizeVaultConfigV2(
  decoded: unknown
): VaultConfigV2Decoded {
  const obj = asRecord(decoded);
  return {
    treasury: requirePubkey(obj.treasury, "treasury"),
    manualPriceLamportsPer10k: requireBn(
      obj.manualPriceLamportsPer10k ?? obj.manual_price_lamports_per_10k,
      "manualPriceLamportsPer10k"
    ),
    dynamicPricingEnabled: requireBool(
      obj.dynamicPricingEnabled ?? obj.dynamic_pricing_enabled,
      "dynamicPricingEnabled"
    ),
    sellLive: requireBool(obj.sellLive ?? obj.sell_live, "sellLive"),
  };
}

export function normalizeBuyerState(decoded: unknown): BuyerStateDecoded {
  const obj = asRecord(decoded);
  return {
    totalDmd: requireBn(obj.totalDmd ?? obj.total_dmd, "totalDmd"),
    lastRewardClaim: requireBn(
      obj.lastRewardClaim ?? obj.last_reward_claim,
      "lastRewardClaim"
    ),
    lastSell: requireBn(obj.lastSell ?? obj.last_sell, "lastSell"),
    holdingSince: requireBn(
      obj.holdingSince ?? obj.holding_since,
      "holdingSince"
    ),
    lastBuyDay: requireBn(obj.lastBuyDay ?? obj.last_buy_day, "lastBuyDay"),
    buyCountToday: requireBn(
      obj.buyCountToday ?? obj.buy_count_today,
      "buyCountToday"
    ),
    whitelisted: requireBool(obj.whitelisted, "whitelisted"),
  };
}

export function normalizeBuyerStateExtV2(
  decoded: unknown
): BuyerStateExtV2Decoded {
  const obj = asRecord(decoded);
  return {
    buyCooldownUntil: requireBn(
      obj.buyCooldownUntil ?? obj.buy_cooldown_until,
      "buyCooldownUntil"
    ),
    sellWindowStart: requireBn(
      obj.sellWindowStart ?? obj.sell_window_start,
      "sellWindowStart"
    ),
    sellCountWindow: requireNumber(
      obj.sellCountWindow ?? obj.sell_count_window,
      "sellCountWindow"
    ),
    extraSellApprovals: requireNumber(
      obj.extraSellApprovals ?? obj.extra_sell_approvals,
      "extraSellApprovals"
    ),
    firstClaimDone: requireBool(
      obj.firstClaimDone ?? obj.first_claim_done,
      "firstClaimDone"
    ),
  };
}

// --------------------------------------------------
// Founder / admin side instructions
// Kept here for completeness, but Investor App should not expose all of them.
// --------------------------------------------------
export function ixInitialize(
  ixCoder: anchor.BorshInstructionCoder,
  founderPubkey: PublicKey,
  initialPriceLamports: number | bigint
): TransactionInstruction {
  const vault = findVaultPda();
  const buyerState = findBuyerStatePda(vault, founderPubkey);
  const founderTokenAccount = ataFor(founderPubkey, DMD_MINT);

  return ix_fromCoder(
    ixCoder,
    "initialize",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: true },
      { pubkey: DMD_MINT, isSigner: false, isWritable: true },
      { pubkey: founderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    { initial_price_sol: bn(initialPriceLamports) }
  );
}

export function ixTogglePublicSale(
  ixCoder: anchor.BorshInstructionCoder,
  active: boolean,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();

  return ix_fromCoder(
    ixCoder,
    "toggle_public_sale",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: true },
    ],
    { active }
  );
}

export function ixWhitelistAdd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  status: boolean,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();
  const buyerState = findBuyerStatePda(vault, buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "whitelist_add",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: false, isWritable: false },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    { status }
  );
}

export function ixSetManualPrice(
  ixCoder: anchor.BorshInstructionCoder,
  lamportsPer10k: number | bigint,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();

  return ix_fromCoder(
    ixCoder,
    "set_manual_price",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: false },
    ],
    { lamports_per_10k: bn(lamportsPer10k) }
  );
}

export function ixTransferVaultOwner(
  ixCoder: anchor.BorshInstructionCoder,
  newOwner: PublicKey,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();

  return ix_fromCoder(
    ixCoder,
    "transfer_vault_owner",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: false },
    ],
    { new_owner: newOwner }
  );
}

export function ixInitializeVaultConfigV2(
  ixCoder: anchor.BorshInstructionCoder,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();
  const vaultConfigV2 = findVaultConfigV2Pda(vault);

  return ix_fromCoder(
    ixCoder,
    "initialize_vault_config_v2",
    [
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: vaultConfigV2, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    {}
  );
}

export function ixUpdateVaultConfigV2(
  ixCoder: anchor.BorshInstructionCoder,
  treasury: PublicKey,
  manualPriceLamportsPer10k: number | bigint,
  dynamicPricingEnabled: boolean,
  sellLive: boolean,
  founderPubkey: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  const vault = findVaultPda();
  const vaultConfigV2 = findVaultConfigV2Pda(vault);

  return ix_fromCoder(
    ixCoder,
    "update_vault_config_v2",
    [
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: vaultConfigV2, isSigner: false, isWritable: true },
      { pubkey: founderPubkey, isSigner: true, isWritable: false },
    ],
    {
      treasury,
      manual_price_lamports_per_10k: bn(manualPriceLamportsPer10k),
      dynamic_pricing_enabled: dynamicPricingEnabled,
      sell_live: sellLive,
    }
  );
}

export function ixInitializeBuyerStateExtV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
): TransactionInstruction {
  const vault = findVaultPda();
  const buyerState = findBuyerStatePda(vault, buyerPubkey);
  const buyerStateExtV2 = findBuyerStateExtV2Pda(vault, buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "initialize_buyer_state_ext_v2",
    [
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: buyerStateExtV2, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    {}
  );
}

// --------------------------------------------------
// Investor-facing instructions (V2 aligned)
// --------------------------------------------------
export function ixAutoWhitelistSelf(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey
): TransactionInstruction {
  const vault = findVaultPda();
  const buyerState = findBuyerStatePda(vault, buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "auto_whitelist_self",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    {}
  );
}

export function ixBuyDmd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  solContributionLamports: number | bigint,
  founderSystem: PublicKey = PROTOCOL_OWNER,
  treasury: PublicKey = TREASURY
): TransactionInstruction {
  const vault = findVaultPda();
  const vaultConfigV2 = findVaultConfigV2Pda(vault);
  const buyerState = findBuyerStatePda(vault, buyerPubkey);
  const buyerStateExtV2 = findBuyerStateExtV2Pda(vault, buyerPubkey);
  const vaultTokenAccount = vaultAta(vault);
  const buyerTokenAccount = buyerAta(buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "buy_dmd",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: vaultConfigV2, isSigner: false, isWritable: false },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: buyerStateExtV2, isSigner: false, isWritable: true },
      { pubkey: founderSystem, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    {
      sol_contribution: bn(solContributionLamports),
    }
  );
}

export function ixClaimRewardV2(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  treasury: PublicKey = TREASURY
): TransactionInstruction {
  const vault = findVaultPda();
  const vaultConfigV2 = findVaultConfigV2Pda(vault);
  const buyerState = findBuyerStatePda(vault, buyerPubkey);
  const buyerStateExtV2 = findBuyerStateExtV2Pda(vault, buyerPubkey);
  const vaultTokenAccount = vaultAta(vault);
  const buyerTokenAccount = buyerAta(buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "claim_reward_v2",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: vaultConfigV2, isSigner: false, isWritable: false },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: buyerStateExtV2, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    {}
  );
}

export function ixSwapExactSolForDmd(
  ixCoder: anchor.BorshInstructionCoder,
  buyerPubkey: PublicKey,
  amountLamports: number | bigint,
  minOutDmd: number | bigint
): TransactionInstruction {
  const vault = findVaultPda();
  const vaultConfigV2 = findVaultConfigV2Pda(vault);
  const buyerState = findBuyerStatePda(vault, buyerPubkey);
  const vaultTokenAccount = vaultAta(vault);
  const userDmdAta = buyerAta(buyerPubkey);

  return ix_fromCoder(
    ixCoder,
    "swap_exact_sol_for_dmd",
    [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: vaultConfigV2, isSigner: false, isWritable: false },
      { pubkey: buyerState, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userDmdAta, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_OWNER, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    {
      amount_in_lamports: bn(amountLamports),
      min_out_dmd: bn(minOutDmd),
    }
  );
}

// --------------------------------------------------
// Sell is intentionally blocked at the frontend layer
// because the current contract truth disables sell paths.
// These functions stay exported only to preserve App import compatibility
// until App.tsx is hardened in the next step.
// --------------------------------------------------
const SELL_DISABLED_FRONTEND_MESSAGE =
  "SELL_DISABLED_FRONTEND: DMD sell/swap-out is intentionally disabled until the on-chain policy is re-enabled.";

function throwSellDisabled(): never {
  throw new Error(SELL_DISABLED_FRONTEND_MESSAGE);
}

export function ixSwapExactDmdForSol(
  _ixCoder: anchor.BorshInstructionCoder,
  _buyerPubkey: PublicKey,
  _amountInDmd: number | bigint,
  _minOutLamports: number | bigint
): TransactionInstruction {
  return throwSellDisabled();
}

export function ixSellDmdV2(
  _ixCoder: anchor.BorshInstructionCoder,
  _buyerPubkey: PublicKey,
  _amountTokens: number | bigint,
  _treasurySigner: PublicKey,
  _founderSystem: PublicKey = PROTOCOL_OWNER
): TransactionInstruction {
  return throwSellDisabled();
}

export { SystemProgram };