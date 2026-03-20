// src/price.ts
// Hardened market/pricing helper for Investor_App_DMD
// Leak-proof Helius RPC via VITE_RPC_URL + lib.rs aligned

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PROGRAM_ID, TREASURY, DMD_MINT, findVaultPda, findVaultConfigV2Pda, ataFor as ataOf } from "./solana";

// Leak-proof: RPC kommt aus .env (nie im Code!)
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.mainnet-beta.solana.com";

// ---------------------------------------------
// SOL/USD Fetch
// ---------------------------------------------
export async function fetchSolUsd(): Promise<number> {
  try {
    const res = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=${Date.now()}`);
    const json = await res.json();
    return json.USD || 89;
  } catch {
    return 89;
  }
}

// ---------------------------------------------
// VaultConfigV2 Decoder (1:1 lib.rs)
// ---------------------------------------------
function decodeVaultConfigV2(data: Buffer) {
  let offset = 8;
  const treasury = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const manualPriceLamportsPer10k = data.readBigUInt64LE(offset);
  offset += 8;
  const dynamicPricingEnabled = data[offset] !== 0;
  offset += 1;
  const sellLive = data[offset] !== 0;
  return { manualPriceLamportsPer10k: Number(manualPriceLamportsPer10k), dynamicPricingEnabled, sellLive };
}

// ---------------------------------------------
// Main Pricing – 100% lib.rs aligned
// ---------------------------------------------
export async function computeDmdPricing() {
  const notes = [];
  const solUsd = await fetchSolUsd();

  let usdPerDmd = 0.01;

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const vaultPda = findVaultPda();
    const [vaultConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config_v2"), vaultPda.toBuffer()],
      PROGRAM_ID
    );

    const [configInfo, treasuryLamports, vaultTokenBal] = await Promise.all([
      connection.getAccountInfo(vaultConfigPda),
      connection.getBalance(TREASURY),
      connection.getTokenAccountBalance(ataFor(vaultPda, DMD_MINT)).catch(() => ({ value: { uiAmount: 0 } })),
    ]);

    if (configInfo?.data) {
      const config = decodeVaultConfigV2(configInfo.data);
      let base = config.manualPriceLamportsPer10k || 1_000_000_000;

      const treasurySol = treasuryLamports / LAMPORTS_PER_SOL;
      const vaultDmd = vaultTokenBal.value.uiAmount || 0;

      let surcharge = 0;
      if (treasurySol < 10) surcharge += 1000;
      else if (treasurySol < 25) surcharge += 500;
      if (vaultDmd < 1_000_000) surcharge += 1000;
      else if (vaultDmd < 5_000_000) surcharge += 500;

      const effective = Math.floor(base * (10000 + surcharge) / 10000);
      const lamportsPerDmd = effective / 10_000;
      usdPerDmd = (lamportsPerDmd / LAMPORTS_PER_SOL) * solUsd;

      notes.push(`Surcharge: ${surcharge} bps | Effective: ${effective} lamports/10k`);
    }
  } catch (e) {
    notes.push(`On-chain fetch failed: ${String(e)} – fallback to 0.01 USD`);
  }

  const usdPerDmdFinal = Math.max(0.0001, Math.min(0.1, usdPerDmd || 0.01));

  console.log("[price-aligned]", { usdPerDmdFinal, solUsd, notes });

  return { usdPerDmdFinal };
}

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}