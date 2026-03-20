// src/price.ts
// Hardened + kompatibel zu App.tsx + lib.rs aligned + dynamisch mit SOL-Preis
// RPC LEAK-PROOF via VITE_RPC_URL (Key nie mehr im Code!)

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PROGRAM_ID, TREASURY, DMD_MINT, findVaultPda, findVaultConfigV2Pda, ataFor as ataOf } from "./solana";

// --------------------------------------------------
// Leak-proof RPC (kommt NUR aus .env)
// --------------------------------------------------
function getRpcUrl(): string {
  const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
  const envRpc = import.meta.env.VITE_RPC_URL?.trim();
  const rpc = envRpc && envRpc.length > 0 ? envRpc : DEFAULT_RPC;
  if (rpc.includes("api-key=") || rpc.includes("apiKey=")) {
    throw new Error("SECURITY: VITE_RPC_URL enthält api-key. Entferne es aus dem Code!");
  }
  return rpc;
}

// SOL/USD Fetch
export async function fetchSolUsd(): Promise<number> {
  try {
    const res = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=${Date.now()}`);
    const json = await res.json();
    return json.USD || 89;
  } catch {
    return 89;
  }
}

// VaultConfigV2 Decoder (1:1 lib.rs)
function decodeVaultConfigV2(data: Buffer) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const treasury = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const manualPriceLamportsPer10k = Number(view.getBigUint64(offset, true));
  offset += 8;
  const dynamicPricingEnabled = view.getUint8(offset) !== 0;
  offset += 1;
  const sellLive = view.getUint8(offset) !== 0;

  console.log("[price-debug] VaultConfigV2 gelesen → manualPriceLamportsPer10k =", manualPriceLamportsPer10k);

  return { manualPriceLamportsPer10k, dynamicPricingEnabled, sellLive };
}

// ===============================================
// computeDmdPricing – EXAKT wie App.tsx es erwartet
// ===============================================
export async function computeDmdPricing(params: {
  lamportsPer10k?: number;
  treasuryLamports?: number;
  treasuryWeight?: number;
} = {}) {
  const notes: string[] = [];
  const solUsd = await fetchSolUsd();

  let usdPerDmd = 0.01; // absoluter Fallback

  try {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const vaultPda = findVaultPda();
    const [vaultConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config_v2"), vaultPda.toBuffer()],
      PROGRAM_ID
    );

    const [configInfo, treasuryLamportsOnChain, vaultTokenBal] = await Promise.all([
      connection.getAccountInfo(vaultConfigPda),
      connection.getBalance(TREASURY),
      connection.getTokenAccountBalance(ataOf(vaultPda, DMD_MINT)).catch(() => ({ value: { uiAmount: 0 } })),
    ]);

    // Params aus App.tsx haben Vorrang, dann Chain
    let base = params.lamportsPer10k || 1_000_000_000;
    if (configInfo?.data) {
      const config = decodeVaultConfigV2(configInfo.data);
      if (config.manualPriceLamportsPer10k > 0) {
        base = config.manualPriceLamportsPer10k;
        notes.push(`✅ VaultConfigV2 override: ${base} lamports/10k`);
      }
    }

    const treasurySol = (params.treasuryLamports ?? treasuryLamportsOnChain) / LAMPORTS_PER_SOL;
    const vaultDmd = vaultTokenBal.value.uiAmount || 0;

    let surcharge = 0;
    if (treasurySol < 10) surcharge += 1000;
    else if (treasurySol < 25) surcharge += 500;
    if (vaultDmd < 1_000_000) surcharge += 1000;
    else if (vaultDmd < 5_000_000) surcharge += 500;

    const effective = Math.floor(base * (10000 + surcharge) / 10000);
    const lamportsPerDmd = effective / 10_000;
    usdPerDmd = (lamportsPerDmd / LAMPORTS_PER_SOL) * solUsd;

    notes.push(`Surcharge: ${surcharge} bps | Effective: ${effective} | SOL: ${solUsd}`);
  } catch (e) {
    notes.push(`On-chain fetch failed – fallback to 0.01 USD`);
    console.error("[price-error]", e);
  }

  const usdPerDmdFinal = Math.max(0.0001, Math.min(0.3, usdPerDmd || 0.01)); // max 0.3$ statt 0.1$

  console.log("[price-aligned]", { 
    usdPerDmdFinal: usdPerDmdFinal.toFixed(6), 
    solUsd, 
    notes 
  });

  return { usdPerDmdFinal };
}

// Trading-Vorschau (wird von App.tsx benutzt)
export async function calculateAlignedMinOutDmd(
  solLamports: number,
  slippageBps: number = 100
): Promise<number> {
  const pricing = await computeDmdPricing();
  const usdPerDmd = pricing.usdPerDmdFinal;

  // KORREKTE Formel (ohne /89-Hack!)
  const dmdAmount = (solLamports / LAMPORTS_PER_SOL) / usdPerDmd;
  const minOut = Math.floor(dmdAmount * (1 - slippageBps / 10000));

  return Math.max(1, minOut);
}