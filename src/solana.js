// src/solana.js
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// === feste Konstanten ===
export const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
export const DMD_MINT   = new PublicKey("3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
export const TREASURY   = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV");

// ➜ WICHTIG: ERSETZEN mit echtem Founder-SystemAccount (kein Signer nötig)
export const FOUNDER    = TREASURY; // <-- HIER deinen Founder Pubkey einsetzen!

// SPL Token Programm
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Associated Token Program
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// === PDAs ===
export function findVaultPda() {
  // Wenn dein Programm einen deterministischen Seed nutzt, hier spiegeln:
  // z.B. ["vault", PROGRAM_ID]
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID
  );
  return pda;
}

export function findBuyerStatePda(vault, buyer) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// === ATAs ===
export function ataFor(owner, mint) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export function vaultAta(vault) {
  return ataFor(vault, DMD_MINT);
}

export function buyerAta(buyer) {
  return ataFor(buyer, DMD_MINT);
}

// === IDL Instruction Coder ===
export function buildIxCoder(idl) {
  return new anchor.BorshInstructionCoder(idl);
}

export function ix_fromCoder(ixCoder, name, keys, args = {}) {
  const data = ixCoder.encode(name, args);
  return new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}

export { SystemProgram };
