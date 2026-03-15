// src/price.ts
// Hardened market/pricing helper for Investor_App_DMD
// Public-safe, GH Pages compatible, conservative by default.

const LAMPORTS_PER_SOL = 1_000_000_000;
const HTTP_TIMEOUT_MS = 5000;

// ---------------------------------------------
// Vite env typing
// ---------------------------------------------
interface ImportMetaEnv {
  readonly VITE_BACKEND_ENABLED?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_ALLOW_COINGECKO?: string;
  readonly VITE_PYTH_SOL_USD_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ---------------------------------------------
// Basic guards
// ---------------------------------------------
function now(): number {
  return Date.now();
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function okSolUsd(x: unknown): x is number {
  return isFinitePositive(x) && x > 0.5 && x < 100_000;
}

function okTokenUsd(x: unknown): x is number {
  return isFinitePositive(x) && x < 100_000;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function toNum(x: unknown): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function logOK(source: string, value: number): void {
  console.log(`[price] ${source} OK -> ${value}`);
}

function logMISS(source: string, detail?: unknown): void {
  console.warn(`[price] ${source} miss`, detail ?? "");
}

// ---------------------------------------------
// Safe fetch helpers
// ---------------------------------------------
async function fetchJson(url: string, init?: RequestInit, timeoutMs = HTTP_TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await response.text().catch(() => "");
      throw new Error(`Non-JSON response (${ct}): ${text.slice(0, 120)}`);
    }

    return response.json();
  } finally {
    window.clearTimeout(id);
  }
}

// ---------------------------------------------
// Backend helper
// Explicit only. No hidden same-origin assumptions.
// ---------------------------------------------
export type BackendPrice = {
  solUsd: number;
  dmdUsd: number;
  dmdPerSol: number;
};

function backendEnabled(): boolean {
  return (import.meta.env.VITE_BACKEND_ENABLED || "").trim() === "1";
}

function getBackendBase(): string | null {
  const base = (import.meta.env.VITE_BACKEND_URL || "").trim();

  if (!backendEnabled()) return null;
  return base || "";
}

export async function fetchBackendPrice(): Promise<BackendPrice | null> {
  const base = getBackendBase();
  if (base === null) return null;

  try {
    const url = `${base}/api/price`;
    const json = await fetchJson(url);
    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    if (!obj) {
      logMISS("Backend /api/price shape", json);
      return null;
    }

    const solUsd = toNum(obj.solUsd);
    const dmdUsd = toNum(obj.dmdUsd);
    const dmdPerSol = toNum(obj.dmdPerSol);

    if (!okSolUsd(solUsd)) {
      logMISS("Backend /api/price solUsd invalid", obj);
      return null;
    }

    logOK("Backend /api/price solUsd", solUsd);
    return {
      solUsd,
      dmdUsd: okTokenUsd(dmdUsd) ? dmdUsd : 0,
      dmdPerSol: isFinitePositive(dmdPerSol) ? dmdPerSol : 0,
    };
  } catch (error) {
    logMISS("Backend /api/price error", error);
    return null;
  }
}

// ---------------------------------------------
// Dexscreener pair
// ---------------------------------------------
export type DexPairPrice = {
  dmdUsd: number | null;
  dmdPerSol: number | null;
  source: "dexscreener";
};

export async function fetchDexPair(pair: string): Promise<DexPairPrice | null> {
  if (!pair || !pair.trim()) return null;

  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${encodeURIComponent(
      pair.trim()
    )}?_=${Date.now()}`;

    const json = await fetchJson(url, {
      headers: {
        pragma: "no-cache",
        "cache-control": "no-cache",
      },
    });

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const pairs = Array.isArray(obj?.pairs) ? obj?.pairs : [];
    const first = pairs.length > 0 && typeof pairs[0] === "object" && pairs[0] !== null
      ? (pairs[0] as Record<string, unknown>)
      : null;

    const priceUsd = toNum(first?.priceUsd);
    const priceNative = toNum(first?.priceNative);

    const dmdUsd = okTokenUsd(priceUsd) ? priceUsd : null;
    const dmdPerSol = isFinitePositive(priceNative) ? priceNative : null;

    if (dmdUsd != null) {
      logOK("Dexscreener priceUsd", dmdUsd);
    } else {
      logMISS("Dexscreener priceUsd missing", json);
    }

    return {
      dmdUsd,
      dmdPerSol,
      source: "dexscreener",
    };
  } catch (error) {
    logMISS("Dexscreener fetch error", error);
    return null;
  }
}

// ---------------------------------------------
// SOL/USD sources with conservative cache
// ---------------------------------------------
let solUsdCache: { value: number; ts: number } | null = null;
let solUsdInFlight: Promise<number> | null = null;

function solCacheValid(ttlMs: number): boolean {
  return !!solUsdCache && now() - solUsdCache.ts < ttlMs && okSolUsd(solUsdCache.value);
}

function setSolCache(value: number): number {
  solUsdCache = { value, ts: now() };
  return value;
}

async function fetchSolUsdFromCryptoCompare(): Promise<number | null> {
  try {
    const json = await fetchJson(
      `https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=${Date.now()}`
    );
    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const value = toNum(obj?.USD);

    if (okSolUsd(value)) {
      logOK("CryptoCompare", value);
      return value;
    }

    logMISS("CryptoCompare shape", json);
    return null;
  } catch (error) {
    logMISS("CryptoCompare error", error);
    return null;
  }
}

async function fetchSolUsdFromJupiterV6(): Promise<number | null> {
  try {
    const json = await fetchJson(
      `https://price.jup.ag/v6/price?ids=SOL&_=${Date.now()}`,
      { headers: { pragma: "no-cache", "cache-control": "no-cache" } }
    );

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const data = typeof obj?.data === "object" && obj?.data !== null ? (obj.data as Record<string, unknown>) : null;
    const sol = typeof data?.SOL === "object" && data?.SOL !== null ? (data.SOL as Record<string, unknown>) : data?.SOL;
    const value =
      typeof sol === "object" && sol !== null
        ? toNum((sol as Record<string, unknown>).price)
        : toNum(sol);

    if (okSolUsd(value)) {
      logOK("Jupiter v6", value);
      return value;
    }

    logMISS("Jupiter v6 shape", json);
    return null;
  } catch (error) {
    logMISS("Jupiter v6 error", error);
    return null;
  }
}

async function fetchSolUsdFromJupiterV4(): Promise<number | null> {
  try {
    const json = await fetchJson(
      `https://price.jup.ag/v4/price?ids=SOL&_=${Date.now()}`,
      { headers: { pragma: "no-cache", "cache-control": "no-cache" } }
    );

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const data = typeof obj?.data === "object" && obj?.data !== null ? (obj.data as Record<string, unknown>) : null;
    const sol = typeof data?.SOL === "object" && data?.SOL !== null ? (data.SOL as Record<string, unknown>) : data?.SOL;
    const value =
      typeof sol === "object" && sol !== null
        ? toNum((sol as Record<string, unknown>).price)
        : toNum(sol);

    if (okSolUsd(value)) {
      logOK("Jupiter v4", value);
      return value;
    }

    logMISS("Jupiter v4 shape", json);
    return null;
  } catch (error) {
    logMISS("Jupiter v4 error", error);
    return null;
  }
}

async function fetchSolUsdFromPyth(): Promise<number | null> {
  const pythId = (import.meta.env.VITE_PYTH_SOL_USD_ID || "").trim();
  if (!pythId) return null;

  try {
    const json = await fetchJson(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${encodeURIComponent(
        pythId
      )}&_=${Date.now()}`
    );

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const parsed = Array.isArray(obj?.parsed) ? obj.parsed : [];
    const first = parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null
      ? (parsed[0] as Record<string, unknown>)
      : null;
    const priceObj = typeof first?.price === "object" && first?.price !== null
      ? (first.price as Record<string, unknown>)
      : null;

    const price = toNum(priceObj?.price);
    const expo = toNum(priceObj?.expo);
    const value = price * Math.pow(10, expo);

    if (okSolUsd(value)) {
      logOK("Pyth Hermes", value);
      return value;
    }

    logMISS("Pyth shape", json);
    return null;
  } catch (error) {
    logMISS("Pyth error", error);
    return null;
  }
}

async function fetchSolUsdFromCoinGecko(): Promise<number | null> {
  const allow = (import.meta.env.VITE_ALLOW_COINGECKO || "").trim() === "1";
  if (!allow) return null;

  try {
    const json = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&_=${Date.now()}`
    );

    const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const solana = typeof obj?.solana === "object" && obj?.solana !== null
      ? (obj.solana as Record<string, unknown>)
      : null;
    const value = toNum(solana?.usd);

    if (okSolUsd(value)) {
      logOK("CoinGecko", value);
      return value;
    }

    logMISS("CoinGecko shape", json);
    return null;
  } catch (error) {
    logMISS("CoinGecko error", error);
    return null;
  }
}

export async function fetchSolUsd(): Promise<number> {
  if (solCacheValid(20_000)) return solUsdCache!.value;
  if (solUsdInFlight) return solUsdInFlight;

  solUsdInFlight = (async () => {
    try {
      const backend = await fetchBackendPrice();
      if (backend && okSolUsd(backend.solUsd)) {
        return setSolCache(backend.solUsd);
      }

      const sources = [
        fetchSolUsdFromCryptoCompare,
        fetchSolUsdFromJupiterV6,
        fetchSolUsdFromJupiterV4,
        fetchSolUsdFromPyth,
        fetchSolUsdFromCoinGecko,
      ];

      for (const source of sources) {
        const value = await source();
        if (okSolUsd(value)) {
          return setSolCache(value);
        }
      }

      logMISS("ALL SOL SOURCES");
      return 0;
    } finally {
      solUsdInFlight = null;
    }
  })();

  return solUsdInFlight;
}

// ---------------------------------------------
// DMD pricing model
// ---------------------------------------------
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

  let usdPerDmdDex: number | null = null;
  let dexPerSol: number | null = null;

  if (input.dexPair) {
    const dex = await fetchDexPair(input.dexPair);
    usdPerDmdDex = dex?.dmdUsd ?? null;
    dexPerSol = dex?.dmdPerSol ?? null;

    if (usdPerDmdDex != null) {
      notes.push(`Dexscreener dmdUsd=${usdPerDmdDex.toFixed(8)}`);
    }
    if (dexPerSol != null) {
      notes.push(`Dexscreener dmdPerSol=${dexPerSol.toFixed(8)}`);
    }
  } else if (backend && okTokenUsd(backend.dmdUsd)) {
    usdPerDmdDex = backend.dmdUsd;
    notes.push(`Backend dmdUsd=${usdPerDmdDex.toFixed(8)}`);
  }

  const maxSupply = Math.max(1, Math.floor(input.maxSupply ?? 150_000_000));
  const floor = Math.max(0, input.manualFloorUsd ?? 0.01);
  const treasuryWeight = clamp01(input.treasuryWeight ?? 1.0);
  const holders = Math.max(0, Math.floor(input.holders ?? 0));
  const presalePool = Math.max(0, Math.floor(input.presalePool ?? 0));

  const holderFactor = (() => {
    if (holders <= 0) return 1;
    const raw = 0.98 + 0.02 * Math.log10(holders + 1);
    return Math.max(0.98, Math.min(1.08, raw));
  })();

  if (holders > 0) {
    notes.push(`Holders=${holders} → fH=${holderFactor.toFixed(4)}`);
  }

  let usdPerDmdManual: number | null = null;
  if (typeof input.lamportsPer10k === "number" && Number.isFinite(input.lamportsPer10k) && input.lamportsPer10k > 0 && solUsd > 0) {
    const solPer10k = input.lamportsPer10k / LAMPORTS_PER_SOL;
    usdPerDmdManual = (solPer10k * solUsd) / 10_000;
    notes.push(`Manual -> ${usdPerDmdManual.toFixed(8)} USD/DMD`);
  } else {
    notes.push("Manual Preis nicht berechnet.");
  }

  let circulating = 0;
  if (typeof input.circulating === "number" && Number.isFinite(input.circulating) && input.circulating > 0) {
    circulating = Math.floor(input.circulating);
    notes.push(`Circulating (override)=${circulating.toLocaleString()}`);
  } else {
    circulating = Math.max(1, Math.floor(maxSupply - presalePool));
    notes.push(`Circulating (calc)=${circulating.toLocaleString()}`);
  }

  let usdPerDmdBacking: number | null = null;
  if (
    typeof input.treasuryLamports === "number" &&
    Number.isFinite(input.treasuryLamports) &&
    input.treasuryLamports > 0 &&
    solUsd > 0 &&
    circulating > 0
  ) {
    const treasurySol = input.treasuryLamports / LAMPORTS_PER_SOL;
    const treasuryUsd = treasurySol * solUsd;
    usdPerDmdBacking = treasuryUsd / circulating;
    notes.push(`Backing -> ${usdPerDmdBacking.toFixed(8)} USD/DMD`);
  } else {
    notes.push("Backing nicht berechnet.");
  }

  let usdPerDmdBackingWeighted: number | null = null;
  if (usdPerDmdBacking != null) {
    usdPerDmdBackingWeighted = usdPerDmdBacking * treasuryWeight * holderFactor;
    notes.push(`Weighted backing -> ${usdPerDmdBackingWeighted.toFixed(8)} USD/DMD`);
  }

  const candidates: number[] = [];

  if (usdPerDmdManual != null && usdPerDmdManual > 0) {
    candidates.push(usdPerDmdManual);
  }
  if (usdPerDmdBackingWeighted != null && usdPerDmdBackingWeighted > 0) {
    candidates.push(usdPerDmdBackingWeighted);
  }
  if (usdPerDmdDex != null && usdPerDmdDex > 0) {
    candidates.push(usdPerDmdDex);
  }
  if (floor > 0) {
    candidates.push(floor);
  }

  let usdPerDmdFinal: number | null = null;

  if (candidates.length > 0) {
    usdPerDmdFinal = Math.max(...candidates);
    notes.push(`Final=max(${candidates.map((v) => v.toFixed(8)).join(", ")})`);
  } else {
    notes.push("Final Preis nicht berechnet.");
  }

  return {
    solUsd,
    usdPerDmdManual,
    usdPerDmdBacking,
    usdPerDmdBackingWeighted,
    usdPerDmdDex,
    usdPerDmdFinal,
    holderFactor,
    notes,
  };
}