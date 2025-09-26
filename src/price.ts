// src/price.ts
// Robuster SOL/USD-Preisfetcher mit Logs & Timeouts.
// Reihenfolge: Jupiter v6 -> Jupiter v4 -> Pyth Hermes -> CoinGecko -> CryptoCompare -> Dev-Fallback

type Num = number;

const TMO = 5000; // 5s Timeout pro Quelle
const okRange = (x: any): x is Num => typeof x === "number" && isFinite(x) && x > 0.5 && x < 10000;

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

function logOK(source: string, v: Num) { console.log(`[price] ${source} OK -> $${v.toFixed(4)}`); }
function logMISS(source: string, msg?: any) { console.warn(`[price] ${source} miss`, msg ?? ""); }

export async function fetchSolUsd(): Promise<number> {
  // 1) Jupiter v6
  try {
    const u = "https://price.jup.ag/v6/price?ids=SOL&_=" + Date.now();
    const j: any = await fetchJson(u, { headers: { "pragma": "no-cache", "cache-control": "no-cache" } });
    const v = j?.data?.SOL?.price ?? j?.data?.SOL;
    if (okRange(v)) { logOK("Jupiter v6", v); return v; }
    logMISS("Jupiter v6 shape", j);
  } catch (e) { logMISS("Jupiter v6 error", e); }

  // 2) Jupiter v4 (älterer Pfad, teils anderer Shape)
  try {
    const u = "https://price.jup.ag/v4/price?ids=SOL&_=" + Date.now();
    const j: any = await fetchJson(u, { headers: { "pragma": "no-cache", "cache-control": "no-cache" } });
    const v = j?.data?.SOL?.price ?? j?.data?.SOL;
    if (okRange(v)) { logOK("Jupiter v4", v); return v; }
    logMISS("Jupiter v4 shape", j);
  } catch (e) { logMISS("Jupiter v4 error", e); }

  // 3) Pyth Hermes (ohne Key)
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

  // 4) CoinGecko (public, rate-limits möglich)
  try {
    const u = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&_=" + Date.now();
    const j: any = await fetchJson(u);
    const v = j?.solana?.usd;
    if (okRange(v)) { logOK("CoinGecko", v); return v; }
    logMISS("CoinGecko shape", j);
  } catch (e) { logMISS("CoinGecko error", e); }

  // 5) CryptoCompare (public)
  try {
    const u = "https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD&_=" + Date.now();
    const j: any = await fetchJson(u);
    const v = j?.USD;
    if (okRange(v)) { logOK("CryptoCompare", v); return v; }
    logMISS("CryptoCompare shape", j);
  } catch (e) { logMISS("CryptoCompare error", e); }

  // 6) Dev-Fallback (nur explizit)
  try {
    // In .env setzen:
    // VITE_DEV_SOL_PRICE=1
    // VITE_SOL_USD=195
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
