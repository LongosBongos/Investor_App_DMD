// src/price.ts
// Hardened + kompatibel zu App.tsx + lib.rs aligned + dynamisch mit SOL-Preis
// RPC LEAK-PROOF via VITE_RPC_URL (Key nie mehr im Code!)
// MIT DEUTLICH MEHR VALIDIERUNG (Längen-Checks, Range-Checks, Treasury-Validierung, Zero-Division-Schutz, Sanity-Checks)
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

// ===============================================
// ERWEITERTER + STARK VALIDIERENDER VaultConfigV2 Decoder
// ===============================================
function decodeVaultConfigV2(data: Buffer): {
  treasury: PublicKey;
  manualPriceLamportsPer10k: number;
  dynamicPricingEnabled: boolean;
  sellLive: boolean;
  bump?: number;
} {
  // 1. Längen-Validierung
  if (!data || data.length < 8 + 32 + 8 + 1 + 1) {
    console.error("[price-error] VaultConfigV2 Daten zu kurz! Erwartet mind. 50 Bytes, erhalten:", data?.length ?? 0);
    throw new Error("Invalid VaultConfigV2 account data length");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8; // discriminator

  const treasury = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const manualPriceLamportsPer10k = Number(view.getBigUint64(offset, true));
  offset += 8;

  const dynamicPricingEnabled = view.getUint8(offset) !== 0;
  offset += 1;

  const sellLive = view.getUint8(offset) !== 0;
  offset += 1;

  const bump = data.length > offset ? view.getUint8(offset) : undefined;

  // 2. Range- & Sanity-Validierung
  if (manualPriceLamportsPer10k <= 0 || manualPriceLamportsPer10k > 100_000_000_000) {
    console.warn("[price-warning] manualPriceLamportsPer10k außerhalb sinnvoller Range:", manualPriceLamportsPer10k);
  }
  if (treasury.equals(PublicKey.default)) {
    console.warn("[price-warning] Treasury ist zero-address – mögliche Fehlkonfiguration!");
  }

  console.log("[price-debug] VaultConfigV2 VALIDATED →", {
    manualPriceLamportsPer10k,
    dynamicPricingEnabled,
    sellLive,
    treasury: treasury.toBase58().slice(0, 8) + "...",
    bump
  });

  return {
    treasury,
    manualPriceLamportsPer10k,
    dynamicPricingEnabled,
    sellLive,
    bump
  };
}

// ===============================================
// computeDmdPricing – MIT NOCH MEHR VALIDIERUNG
// ===============================================
export async function computeDmdPricing(params: {
  lamportsPer10k?: number;
  treasuryLamports?: number;
  treasuryWeight?: number;
} = {}) {
  const notes: string[] = [];
  const solUsd = await fetchSolUsd();
  let usdPerDmd = 0.01;

  try {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const vaultPda = findVaultPda();
    const vaultConfigPda = findVaultConfigV2Pda(vaultPda);

    const [configInfo, treasuryLamportsOnChain, vaultTokenBal] = await Promise.all([
      connection.getAccountInfo(vaultConfigPda),
      connection.getBalance(TREASURY),
      connection.getTokenAccountBalance(ataOf(vaultPda, DMD_MINT)).catch(() => ({ value: { uiAmount: 0 } })),
    ]);

    // Validierung: Config-Account muss existieren
    if (!configInfo?.data) {
      throw new Error("VaultConfigV2 account not found or empty");
    }

    let base = params.lamportsPer10k || 1_000_000_000;
    const config = decodeVaultConfigV2(configInfo.data);

    if (config.manualPriceLamportsPer10k > 0) {
      base = config.manualPriceLamportsPer10k;
      notes.push(`✅ VaultConfigV2 override: ${base} lamports/10k (sellLive=${config.sellLive})`);
    }

    // Treasury & Circulating Validierung
    const circulating = vaultTokenBal.value.uiAmount || 0;
    if (circulating <= 0) {
      console.warn("[price-warning] Circulating Supply = 0 – Fallback verwendet");
    }

    const treasurySol = (params.treasuryLamports ?? treasuryLamportsOnChain) / LAMPORTS_PER_SOL;
    if (treasurySol < 0) throw new Error("Invalid treasury balance");

    let treasuryBackingUsd = 0;
    if (circulating > 0 && treasurySol > 0) {
      treasuryBackingUsd = (treasurySol * solUsd) / circulating;
      notes.push(`Treasury Backing: $${treasuryBackingUsd.toFixed(8)} USD/DMD`);
    }

    // Surcharge Validierung
    const vaultDmd = vaultTokenBal.value.uiAmount || 0;
    let surcharge = 0;
    if (treasurySol < 10) surcharge += 1000;
    else if (treasurySol < 25) surcharge += 500;
    if (vaultDmd < 1_000_000) surcharge += 1000;
    else if (vaultDmd < 5_000_000) surcharge += 500;

    const effective = Math.floor(base * (10000 + surcharge) / 10000);
    const lamportsPerDmd = effective / 10_000;
    const effectivePriceUsd = (lamportsPerDmd / LAMPORTS_PER_SOL) * solUsd;

    const treasuryWeight = Math.max(0, Math.min(1, params.treasuryWeight ?? 0.6));
    const finalUsd = (treasuryBackingUsd * treasuryWeight) + (effectivePriceUsd * (1 - treasuryWeight));

    usdPerDmd = Math.max(effectivePriceUsd, finalUsd);

    notes.push(`Surcharge: ${surcharge} bps | Effective: ${effective} | Weighted Final: ${usdPerDmd.toFixed(8)}`);
  } catch (e) {
    notes.push(`On-chain fetch failed – fallback to 0.01 USD`);
    console.error("[price-error]", e);
  }

  const usdPerDmdFinal = Math.max(0.0001, Math.min(0.3, usdPerDmd || 0.01));

  console.log("[price-aligned FULL WITH VALIDATION]", {
    usdPerDmdFinal: usdPerDmdFinal.toFixed(8),
    solUsd,
    notes
  });

  return { usdPerDmdFinal };
}

// Trading-Vorschau (mit Zero-Division-Schutz)
export async function calculateAlignedMinOutDmd(
  solLamports: number,
  slippageBps: number = 100
): Promise<number> {
  if (solLamports <= 0) throw new Error("solLamports must be > 0");

  const pricing = await computeDmdPricing();
  const usdPerDmd = pricing.usdPerDmdFinal;

  if (usdPerDmd <= 0) {
    console.warn("[price-warning] usdPerDmd <= 0 – Fallback 0.01");
    return Math.max(1, Math.floor((solLamports / LAMPORTS_PER_SOL) * 100));
  }

  const dmdAmount = (solLamports / LAMPORTS_PER_SOL) / usdPerDmd;
  const minOut = Math.floor(dmdAmount * (1 - slippageBps / 10000));

  return Math.max(1, minOut);
}