// src/price.ts

type Num = number;
const TMO = 5000;
const LAMPORTS_PER_SOL = 1_000_000_000;

// ✅ SOL/USD plausibel
const okSolUsd = (x: any): x is Num =>
  typeof x === "number" && isFinite(x) && x > 0.5 && x < 10000;

// ✅ Token USD kann sehr klein sein
const okTokenUsd = (x: any): x is Num =>
  typeof x === "number" && isFinite(x) && x > 0 && x < 10000;

// ------------------ Mini Cache / Anti-Spam ------------------
let solUsdCache: { v: number; ts: number } | null = null;
let solUsdInFlight: Promise<number> | null = null;

const now = () => Date.now();
const cacheOk = (ttlMs: number) =>
  solUsdCache && now() - solUsdCache.ts < ttlMs && okSolUsd(solUsdCache.v);

// ------------------ fetchJson ------------------
async function fetchJson(url: string, init?: RequestInit, timeoutMs: number = TMO) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      mode: "cors",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}

function logOK(source: string, v: Num) { console.log(`[price] ${source} OK -> ${v}`); }
function logMISS(source: string, msg?: any) { console.warn(`[price] ${source} miss`, msg ?? ""); }

// ===================== Backend-Helper =====================
type BackendPrice = { solUsd: number; dmdUsd: number; dmdPerSol: number };

function getBackendBase(): string | null {
  const env: any = (import.meta as any).env || {};
  // ✅ Schalter: nur wenn Backend wirklich existiert
  const enabled = String(env.VITE_BACKEND_PRICE || "").trim() === "1";
  const base = String(env.VITE_BACKEND_URL || "").trim(); // z.B. https://dein-worker.xyz
  if (!enabled && !base) return null;
  return base || ""; // "" => same-origin (/api/price via proxy), base => absolute
}

async function fetchBackendPrice(): Promise<BackendPrice | null> {
  const base = getBackendBase();
  if (base === null) return null; // ✅ verhindert HTML <!doctype> Fehler

  try {
    const url = `${base}/api/price`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    // ✅ falls doch HTML kommt: abfangen
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const txt = await r.text();
      throw new Error(`Non-JSON response (${ct}): ${txt.slice(0, 40)}...`);
    }

    const j: any = await r.json();
    const solUsd = Number(j.solUsd ?? 0);
    const dmdUsd = Number(j.dmdUsd ?? 0);
    const dmdPerSol = Number(j.dmdPerSol ?? 0);

    if (okSolUsd(solUsd)) {
      logOK("Backend /api/price solUsd", solUsd);
      return { solUsd, dmdUsd, dmdPerSol };
    }
    logMISS("Backend /api/price shape", j);
  } catch (e) {
    logMISS("Backend /api/price error", e);
  }
  return null;
}

// ===================== Dexscreener Pair Price =====================
export type DexPairPrice = {
  dmdUsd: number | null;
  dmdPerSol: number | null;
  source: "dexscreener";
};

export async function fetchDexPair(pair: string): Promise<DexPairPrice | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${pair}?_=${Date.now()}`;
    const j: any = await fetchJson(url, { headers: { pragma: "no-cache", "cache-control": "no-cache" } });

    const p = j?.pairs?.[0];
    const priceUsd = Number(p?.priceUsd ?? 0);
    const priceNative = Number(p?.priceNative ?? 0);

    const dmdUsd = okTokenUsd(priceUsd) ? priceUsd : null;
    const dmdPerSol = okTokenUsd(priceNative) ? priceNative : null;

    if (dmdUsd != null) logOK("Dexscreener priceUsd", dmdUsd);
    else logMISS("Dexscreener priceUsd missing", j);

    return { dmdUsd, dmdPerSol, source: "dexscreener" };
  } catch (e) {
    logMISS("Dexscreener fetch error", e);
    return null;
  }
}

// ===================== fetchSolUsd =====================
export async function fetchSolUsd(): Promise<number> {
  // ✅ cache: 20s reicht in dev völlig, reduziert Spam massiv
  if (cacheOk(20_000)) return solUsdCache!.v;
  if (solUsdInFlight) return solUsdInFlight;

  solUsdInFlight = (async () => {
    // 0) Backend /api/price (nur wenn enabled)
    const backend = await fetchBackendPrice();
    if (backend && okSolUsd(backend.solUsd)) {
      solUsdCache = { v: backend.solUsd, ts: now() };
      solUsdInFlight = null;
      return backend.solUsd;
    }

    // 1) CryptoCompare FIRST (bei dir funktioniert es zuverlässig)
    try {
      const u = "https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=" + Date.now();
      const j: any = await fetchJson(u);
      const v = j?.USD;
      if (okSolUsd(v)) {
        logOK("CryptoCompare", v);
        solUsdCache = { v, ts: now() };
        solUsdInFlight = null;
        return v;
      }
      logMISS("CryptoCompare shape", j);
    } catch (e) { logMISS("CryptoCompare error", e); }

    // 2) Jupiter v6 (optional)
    try {
      const u = "https://price.jup.ag/v6/price?ids=SOL&_=" + Date.now();
      const j: any = await fetchJson(u, { headers: { pragma: "no-cache", "cache-control": "no-cache" } });
      const v = j?.data?.SOL?.price ?? j?.data?.SOL;
      if (okSolUsd(v)) {
        logOK("Jupiter v6", v);
        solUsdCache = { v, ts: now() };
        solUsdInFlight = null;
        return v;
      }
      logMISS("Jupiter v6 shape", j);
    } catch (e) { logMISS("Jupiter v6 error", e); }

    // 3) Jupiter v4 (optional)
    try {
      const u = "https://price.jup.ag/v4/price?ids=SOL&_=" + Date.now();
      const j: any = await fetchJson(u, { headers: { pragma: "no-cache", "cache-control": "no-cache" } });
      const v = j?.data?.SOL?.price ?? j?.data?.SOL;
      if (okSolUsd(v)) {
        logOK("Jupiter v4", v);
        solUsdCache = { v, ts: now() };
        solUsdInFlight = null;
        return v;
      }
      logMISS("Jupiter v4 shape", j);
    } catch (e) { logMISS("Jupiter v4 error", e); }

    // 4) Pyth Hermes (nur wenn ID gesetzt)
    try {
      const env: any = (import.meta as any).env || {};
      const pythId = String(env.VITE_PYTH_SOL_USD_ID || "").trim(); // z.B. hex feed id
      if (pythId) {
        const u = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${encodeURIComponent(pythId)}&_=${Date.now()}`;
        const j: any = await fetchJson(u);
        const p = j?.parsed?.[0]?.price;
        if (p && typeof p.price === "number") {
          const expo = p.expo || 0;
          const v = p.price * Math.pow(10, expo);
          if (okSolUsd(v)) {
            logOK("Pyth Hermes", v);
            solUsdCache = { v, ts: now() };
            solUsdInFlight = null;
            return v;
          }
        }
        logMISS("Pyth shape", j);
      }
    } catch (e) { logMISS("Pyth error", e); }

    // 5) CoinGecko (nur wenn ausdrücklich erlaubt)
    try {
      const env: any = (import.meta as any).env || {};
      if (String(env.VITE_ALLOW_COINGECKO || "").trim() === "1") {
        const u = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&_=" + Date.now();
        const j: any = await fetchJson(u);
        const v = j?.solana?.usd;
        if (okSolUsd(v)) {
          logOK("CoinGecko", v);
          solUsdCache = { v, ts: now() };
          solUsdInFlight = null;
          return v;
        }
        logMISS("CoinGecko shape", j);
      }
    } catch (e) { logMISS("CoinGecko error", e); }

    // 6) DEV-FALLBACK
    try {
      const env: any = (import.meta as any).env || {};
      if (env.VITE_DEV_SOL_PRICE === "1") {
        const v = Number(env.VITE_SOL_USD || "0");
        if (okSolUsd(v)) {
          logOK("DEV_FALLBACK", v);
          solUsdCache = { v, ts: now() };
          solUsdInFlight = null;
          return v;
        }
        logMISS("DEV_FALLBACK bad value", v);
      }
    } catch (e) { logMISS("DEV_FALLBACK error", e); }

    logMISS("ALL SOL SOURCES");
    solUsdInFlight = null;
    return 0;
  })();

  return solUsdInFlight;
}

/** ===== DMD Pricing V2 ===== */
export type DmdPricingInput = {
  lamportsPer10k?: number;
  treasuryLamports?: number;
  circulating?: number;
  maxSupply?: number;
  manualFloorUsd?: number;
  holders?: number;
  presalePool?: number;
  treasuryWeight?: number;
  dexPair?: string;
};

export type DmdPricing = {
  solUsd: number;
  usdPerDmdManual: number | null;
  usdPerDmdBacking: number | null;
  usdPerDmdBackingWeighted: number | null;
  usdPerDmdDex: number | null;
  usdPerDmdFinal: number | null;
  holderFactor: number;
  notes: string[];
};

export async function computeDmdPricing(input: DmdPricingInput = {}): Promise<DmdPricing> {
  const notes: string[] = [];

  const backend = await fetchBackendPrice();
  const solUsd = backend?.solUsd ?? (await fetchSolUsd());

  let dexUsd: number | null = null;
  if (input.dexPair) {
    const dex = await fetchDexPair(input.dexPair);
    dexUsd = dex?.dmdUsd ?? null;
    if (dexUsd != null) notes.push(`Dexscreener dmdUsd=${dexUsd.toFixed(8)}`);
  }

  const maxSupply = input.maxSupply ?? 150_000_000;
  const floor = input.manualFloorUsd ?? 0.01;
  const wT = Math.max(0, Math.min(1, input.treasuryWeight ?? 1.0));
  const holders = Math.max(0, Math.floor(input.holders ?? 0));
  const presale = Math.max(0, Math.floor(input.presalePool ?? 0));

  const holderFactor = (() => {
    const raw = 0.98 + 0.02 * Math.log10(holders + 1);
    return Math.max(0.98, Math.min(1.08, raw));
  })();
  if (holders) notes.push(`Holders=${holders} → fH=${holderFactor.toFixed(4)}`);

  let usdPerDmdManual: number | null = null;
  if (typeof input.lamportsPer10k === "number" && solUsd > 0) {
    const solPer10k = input.lamportsPer10k / LAMPORTS_PER_SOL;
    usdPerDmdManual = (solPer10k * solUsd) / 10_000;
    notes.push(`Manual -> ${usdPerDmdManual.toFixed(8)} USD/DMD`);
  } else {
    notes.push("Manual Preis nicht berechnet.");
  }

  let circulating = 0;
  if (typeof input.circulating === "number" && isFinite(input.circulating) && input.circulating > 0) {
    circulating = Math.floor(input.circulating);
    notes.push(`Circulating (override)=${circulating.toLocaleString()}`);
  } else {
    circulating = Math.max(1, Math.floor(maxSupply - presale));
    notes.push(`Circulating (calc)=${circulating.toLocaleString()}`);
  }

  let usdPerDmdBacking: number | null = null;
  let usdPerDmdBackingWeighted: number | null = null;
  if (typeof input.treasuryLamports === "number" && solUsd > 0 && circulating > 0) {
    const trezSol = input.treasuryLamports / LAMPORTS_PER_SOL;
    const trezUsd = trezSol * solUsd;
    usdPerDmdBacking = trezUsd / circulating;
    usdPerDmdBackingWeighted = usdPerDmdBacking * wT;
    notes.push(`Backing=${usdPerDmdBacking.toFixed(10)} wT=${wT.toFixed(2)} -> ${usdPerDmdBackingWeighted.toFixed(10)}`);
  } else {
    notes.push("Backing nicht berechnet.");
  }

  let backendDmdUsd: number | null = null;
  if (backend && okTokenUsd(backend.dmdUsd)) {
    backendDmdUsd = backend.dmdUsd;
    notes.push(`Backend dmdUsd=${backendDmdUsd.toFixed(8)}`);
  }

  const candBase = [
    floor,
    usdPerDmdManual ?? 0,
    usdPerDmdBackingWeighted ?? 0,
    backendDmdUsd ?? 0,
    dexUsd ?? 0,
  ].filter((x) => typeof x === "number" && x > 0);

  let usdPerDmdFinal: number | null = null;
  if (candBase.length) {
    const base = Math.max(...candBase);
    usdPerDmdFinal = base * holderFactor;
    notes.push(`Final: base=${base.toFixed(8)} * fH=${holderFactor.toFixed(4)} => ${usdPerDmdFinal.toFixed(8)}`);
  } else {
    notes.push("Kein finaler Preis – alle Quellen leer.");
  }

  return {
    solUsd,
    usdPerDmdManual,
    usdPerDmdBacking,
    usdPerDmdBackingWeighted,
    usdPerDmdDex: dexUsd,
    usdPerDmdFinal,
    holderFactor,
    notes,
  };
}