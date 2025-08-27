import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
export const DMD_MINT   = new PublicKey("3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
export const FOUNDER    = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT");
export const TREASURY   = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV");

export const VAULT_SEED = Buffer.from("vault");
export const BUYER_SEED = (vault: PublicKey, buyer: PublicKey) =>
  [Buffer.from("buyer"), vault.toBuffer(), buyer.toBuffer()];

export async function findVaultPda() {
  const [pda] = await PublicKey.findProgramAddress([VAULT_SEED], PROGRAM_ID);
  return pda;
}

export async function findBuyerPda(vault: PublicKey, buyer: PublicKey) {
  const [pda] = await PublicKey.findProgramAddress(BUYER_SEED(vault, buyer), PROGRAM_ID);
  return pda;
}

export async function getAta(owner: PublicKey) {
  return await getAssociatedTokenAddress(DMD_MINT, owner, true);
}
