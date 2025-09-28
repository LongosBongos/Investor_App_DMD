// src/price.ts
// Robust: SOL/USD fetch + DMD Pricing V2
// Features: Manual + (Weighted) Backing + Holder-Factor + MaxSupply/Preset Pool

type Num = number;
const TMO = 5000; // 5s Timeout pro Quelle
const LAMPORTS_PER_SOL = 1_000_000_000;

const okRange = (x: any): x is Num =>
  typeof x === "number" && isFinite(x) && x > 0.5 && x < 10000;

async function fetchJson(url: string, init?: RequestInit, timeoutMs: number = TMO) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store", mode: "cors" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}

function logOK(source: string, v: Num) { console.log(`[price] ${source} OK -> $${v.toFixed(6)}`); }
function logMISS(source: string, msg?: any) { console.warn(`[price] ${source} miss`, msg ?? ""); }

export async function fetchSolUsd(): Promise<number> {
  // 1) Jupiter v6
  try {
    const u = "https://price.jup.ag/v6/price?ids=SOL&_=" + Date.now();
    const j: any = await fetchJson(u, { headers: { pragma: "no-cache", "cache-control": "no-cache" } });
    const v = j?.data?.SOL?.price ?? j?.data?.SOL;
    if (okRange(v)) { logOK("Jupiter v6", v); return v; }
    logMISS("Jupiter v6 shape", j);
  } catch (e) { logMISS("Jupiter v6 error", e); }

  // 2) Jupiter v4
  try {
    const u = "https://price.jup.ag/v4/price?ids=SOL&_=" + Date.now();
    const j: any = await fetchJson(u, { headers: { pragma: "no-cache", "cache-control": "no-cache" } });
    const v = j?.data?.SOL?.price ?? j?.data?.SOL;
    if (okRange(v)) { logOK("Jupiter v4", v); return v; }
    logMISS("Jupiter v4 shape", j);
  } catch (e) { logMISS("Jupiter v4 error", e); }

  // 3) Pyth Hermes
  try {
    const u = "https://hermes.pyth.network/v2/price/latest?ids=Crypto.SOL%2FUSD&_=" + Date.now();
    const j: any = await fetchJson(u);
    const arr = j?.parsed ?? j?.data ?? null;
    if (Array.isArray(arr) && arr.length) {
      const pObj = arr[0];
      if (pObj?.price && typeof pObj.price.price === "number") {
        const expo = pObj.price.expo || 0;
        const v = pObj.price.price * Math.pow(10, expo);
        if (okRange(v)) { logOK("Pyth Hermes (expo)", v); return v; }
      }
      const v2 = pObj?.prices?.usd;
      if (okRange(v2)) { logOK("Pyth Hermes (usd)", v2); return v2; }
    }
    logMISS("Pyth shape", j);
  } catch (e) { logMISS("Pyth error", e); }

  // 4) CoinGecko
  try {
    const u = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&_=" + Date.now();
    const j: any = await fetchJson(u);
    const v = j?.solana?.usd;
    if (okRange(v)) { logOK("CoinGecko", v); return v; }
    logMISS("CoinGecko shape", j);
  } catch (e) { logMISS("CoinGecko error", e); }

  // 5) CryptoCompare
  try {
    const u = "https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=" + Date.now();
    const j: any = await fetchJson(u);
    const v = j?.USD;
    if (okRange(v)) { logOK("CryptoCompare", v); return v; }
    logMISS("CryptoCompare shape", j);
  } catch (e) { logMISS("CryptoCompare error", e); }

  // 6) DEV-FALLBACK (.env)
  try {
    const env: any = (import.meta as any).env || {};
    if (env.VITE_DEV_SOL_PRICE === "1") {
      const v = Number(env.VITE_SOL_USD || "0");
      if (okRange(v)) { logOK("DEV_FALLBACK", v); return v; }
      logMISS("DEV_FALLBACK bad value", v);
    }
  } catch (e) { logMISS("DEV_FALLBACK error", e); }

  logMISS("ALL SOURCES");
  return 0;
}

/** ===== DMD Pricing V2 =====
 * Inputs (alle optional, aber sinnvoll für Autopricing):
 * - lamportsPer10k: u64 aus Vault (Manual-Preis pro 10k DMD)
 * - treasuryLamports: SOL im Treasury (Lamports)
 * - circulating: zirkulierende DMD (falls bekannt) – sonst wird (maxSupply - presalePool) verwendet
 * - maxSupply: Default 150_000_000
 * - manualFloorUsd: Mindestpreis pro DMD (z. B. 0.01)
 * - holders: Anzahl eindeutiger Token-Owner (Founder inkl., Vault/Treasury egal)
 * - presalePool: DMD, die im Presale-Pool liegen (nicht im Umlauf)
 * - treasuryWeight: Gewichtung des Backings (0..1; Default 1.0)
 */
export type DmdPricingInput = {
  lamportsPer10k?: number;      // z. B. aus Vault.initial_price_sol (Lamports pro 10k)
  treasuryLamports?: number;    // getBalance(TREASURY) in Lamports
  circulating?: number;         // (optional) zirkulierende DMD
  maxSupply?: number;           // Default 150 Mio
  manualFloorUsd?: number;      // Default $0.01
  holders?: number;             // ✅ neu
  presalePool?: number;         // ✅ neu (DMD im Presale/Vault-Pool)
  treasuryWeight?: number;      // ✅ neu (0..1)
};

export type DmdPricing = {
  solUsd: number;
  usdPerDmdManual: number | null;
  usdPerDmdBacking: number | null;          // ungewichtet
  usdPerDmdBackingWeighted: number | null;  // mit treasuryWeight wT
  usdPerDmdFinal: number | null;            // max(Floor, Manual, wT*Backing) * HolderFactor
  holderFactor: number;                     // 0.98 .. 1.08
  notes: string[];
};

export async function computeDmdPricing(input: DmdPricingInput = {}): Promise<DmdPricing> {
  const notes: string[] = [];
  const solUsd = await fetchSolUsd();

  const maxSupply = input.maxSupply ?? 150_000_000;
  const floor = input.manualFloorUsd ?? 0.01;
  const wT = Math.max(0, Math.min(1, input.treasuryWeight ?? 1.0));
  const holders = Math.max(0, Math.floor(input.holders ?? 0));
  const presale = Math.max(0, Math.floor(input.presalePool ?? 0));

  // Holder-Faktor: sanfter Bias 0.98 .. 1.08
  const holderFactor = (() => {
    const raw = 0.98 + 0.02 * Math.log10(holders + 1);
    return Math.max(0.98, Math.min(1.08, raw));
  })();
  if (holders) notes.push(`Holders=${holders} → fH=${holderFactor.toFixed(4)}`);

  // Manual: (lamports/10k) -> SOL/10k -> USD/10k -> /10000
  let usdPerDmdManual: number | null = null;
  if (typeof input.lamportsPer10k === "number" && solUsd > 0) {
    const solPer10k = input.lamportsPer10k / LAMPORTS_PER_SOL;
    usdPerDmdManual = (solPer10k * solUsd) / 10_000;
    notes.push(`Manual via lamports_per_10k -> ${usdPerDmdManual.toFixed(8)} USD/DMD`);
  } else {
    notes.push("Manual Preis nicht berechnet (fehlende lamportsPer10k oder solUsd==0).");
  }

  // Circulating: bevorzugt 'input.circulating', sonst (maxSupply - presalePool)
  let circulating = 0;
  if (typeof input.circulating === "number" && isFinite(input.circulating) && input.circulating > 0) {
    circulating = Math.floor(input.circulating);
    notes.push(`Circulating (override) = ${circulating.toLocaleString()}`);
  } else {
    circulating = Math.max(1, Math.floor(maxSupply - presale)); // mind. 1, um Div/0 zu vermeiden
    notes.push(`Circulating (calc) = maxSupply(${maxSupply.toLocaleString()}) - presalePool(${presale.toLocaleString()}) = ${circulating.toLocaleString()}`);
  }

  // Backing: Treasury_USD / circulating
  let usdPerDmdBacking: number | null = null;
  let usdPerDmdBackingWeighted: number | null = null;
  if (typeof input.treasuryLamports === "number" && solUsd > 0 && circulating > 0) {
    const trezSol = input.treasuryLamports / LAMPORTS_PER_SOL;
    const trezUsd = trezSol * solUsd;
    usdPerDmdBacking = trezUsd / circulating;
    usdPerDmdBackingWeighted = usdPerDmdBacking * wT;
    notes.push(`Backing = TreasuryUSD(${trezUsd.toFixed(2)}) / circulating(${circulating.toLocaleString()}) -> ${usdPerDmdBacking.toFixed(8)} USD/DMD; wT=${wT.toFixed(2)} → ${usdPerDmdBackingWeighted.toFixed(8)}`);
  } else {
    notes.push("Backing nicht berechnet (treasuryLamports/solUsd fehlen).");
  }

  // Final vor Holder-Bias: max(Floor, Manual, WeightedBacking)
  const candBase = [
    floor,
    usdPerDmdManual ?? 0,
    usdPerDmdBackingWeighted ?? 0,
  ].filter((x) => typeof x === "number" && x > 0);

  let usdPerDmdFinal: number | null = null;
  if (candBase.length) {
    const base = Math.max(...candBase);
    usdPerDmdFinal = base * holderFactor;
    notes.push(`Base = max(Floor=${floor.toFixed(4)}, Manual, wT*Backing) -> ${base.toFixed(8)} ; Final = Base * fH(${holderFactor.toFixed(4)}) -> ${usdPerDmdFinal.toFixed(8)} USD/DMD`);
  } else {
    notes.push("Kein finaler Preis – alle Quellen leer.");
  }

  return {
    solUsd,
    usdPerDmdManual,
    usdPerDmdBacking,
    usdPerDmdBackingWeighted,
    usdPerDmdFinal,
    holderFactor,
    notes,
  };
}
