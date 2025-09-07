// src/App.tsx
/* Investor Board – read-only: zeigt Treasury + Manual Price
   - kein RPC im UI
   - Jupiter Preis-Feed mit Fallback
   - Buffer-Polyfill fix für Browser
*/

import React, { useEffect, useMemo, useState } from "react";
import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

// ---- Buffer-Polyfill (fix “Module 'buffer' externalized”) ----
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

// ====== Konstanten (gleich wie Programm) ======
const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
const DMD_MINT   = new PublicKey("3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
const TREASURY   = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV");

// Deine RPC (nicht im UI anzeigen!)
const RPC = import.meta.env.VITE_RPC_URL
  ?? "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";

// PDA: vault = [b"vault"]
function getVaultPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID)[0];
}

// ---- Vault-Dekoder (ohne Anchor-IDL) ----
// Layout aus deinem Programm (nach 8-Byte Anchor-Discriminator):
// owner(32) | total_supply u64(8) | presale_sold u64(8) | initial_price_sol u64(8)
// public_sale_active u8(1) | mint(32) | mint_decimals u8(1)
type VaultDecoded = {
  owner: PublicKey;
  totalSupply: bigint;
  presaleSold: bigint;
  initialPriceLamportsPer10k: bigint;
  publicSaleActive: boolean;
  mint: PublicKey;
  mintDecimals: number;
};

function readU64le(d: DataView, off: number): bigint {
  // JS hat BigInt64 nicht cross-browser als LE helper -> manuell
  const lo = d.getUint32(off, true);
  const hi = d.getUint32(off + 4, true);
  return (BigInt(hi) << 32n) + BigInt(lo);
}

function decodeVault(data: Uint8Array): VaultDecoded {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // skip anchor discriminator
  const owner = new PublicKey(data.slice(o, o + 32)); o += 32;
  const totalSupply = readU64le(dv, o); o += 8;
  const presaleSold = readU64le(dv, o); o += 8;
  const initialPriceLamportsPer10k = readU64le(dv, o); o += 8;
  const publicSaleActive = dv.getUint8(o) !== 0; o += 1;
  const mint = new PublicKey(data.slice(o, o + 32)); o += 32;
  const mintDecimals = dv.getUint8(o); o += 1;
  return {
    owner,
    totalSupply,
    presaleSold,
    initialPriceLamportsPer10k,
    publicSaleActive,
    mint,
    mintDecimals,
  };
}

// ---- Preisfeed (Jupiter) ----
async function fetchSolUsd(): Promise<number | null> {
  // richtige URL MIT https:// ; v6 ist aktuell
  const urls = [
    "https://price.jup.ag/v6/price?ids=SOL",
    "https://price.jup.ag/v4/price?ids=SOL", // Fallback
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      // v6: { data: { SOL: { id:"SOL", price: x } } }
      const p = j?.data?.SOL?.price ?? j?.data?.SOL ?? null;
      if (typeof p === "number") return p;
    } catch { /* try next */ }
  }
  return null;
}

function formatUsd(x: number | null, digits = 2) {
  if (x == null || !isFinite(x)) return "…";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(x);
}
function short(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0,4)}…${s.slice(-4)}`;
}

// ---- UI (read-only) ----
function InvestorBoard() {
  const [conn] = useState(() => new Connection(RPC, "confirmed"));
  const [treasurySol, setTreasurySol] = useState<number | null>(null);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [manualPriceSolPer10k, setManualPriceSolPer10k] = useState<number | null>(null);
  const [dmdDecimals, setDmdDecimals] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      // Treasury SOL
      const lam = await conn.getBalance(TREASURY).catch(() => null);
      if (alive) setTreasurySol(lam == null ? null : lam / LAMPORTS_PER_SOL);

      // SOL→USD
      const price = await fetchSolUsd();
      if (alive) setSolUsd(price);

      // Vault lesen
      const vaultPk = getVaultPda();
      const ai = await conn.getAccountInfo(vaultPk).catch(() => null);
      if (ai && alive) {
        const v = decodeVault(ai.data);
        const solPer10k = Number(v.initialPriceLamportsPer10k) / LAMPORTS_PER_SOL;
        setManualPriceSolPer10k(solPer10k);
        setDmdDecimals(Number(v.mintDecimals));
      }
    }

    load();
    const i = setInterval(load, 30_000); // alle 30s refresh
    return () => { alive = false; clearInterval(i); };
  }, [conn]);

  // abgeleitet: SOL/DMD & USD/DMD
  const solPerDmd = manualPriceSolPer10k == null ? null : manualPriceSolPer10k / 10_000;
  const usdPerDmd = (solPerDmd != null && solUsd != null) ? solPerDmd * solUsd : null;

  return (
    <div className="min-h-screen bg-[#0b0f14] text-yellow-300">
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <WalletMultiButton />
      </div>

      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Old English Text MT, serif" }}>
          Die Mark Digital
        </h1>
        <span className="opacity-70">Investor App · Solana</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Pricing Panel */}
          <div className="rounded-xl p-5 bg-black/40 border border-white/10">
            <div className="text-lg font-semibold mb-3">DMD Pricing</div>
            <div className="space-y-2 text-white/90">
              <div>
                <span className="opacity-70">Manual Price:</span>{" "}
                <b>{manualPriceSolPer10k == null ? "…" : manualPriceSolPer10k.toFixed(6)} SOL / 10k</b>
              </div>
              <div>
                <span className="opacity-70">≈</span>{" "}
                <b>{solPerDmd == null ? "…" : solPerDmd.toFixed(9)} SOL / DMD</b>
                {usdPerDmd != null && (
                  <span className="opacity-70"> · {formatUsd(usdPerDmd, 6)} / DMD</span>
                )}
              </div>
              <div className="opacity-60 text-sm">
                Decimals: {dmdDecimals ?? "…"}
              </div>
            </div>
            <div className="opacity-50 text-xs mt-3">
              Programm: {short(PROGRAM_ID)} · Mint: {short(DMD_MINT)}
            </div>
          </div>

          {/* Treasury Panel */}
          <div className="rounded-xl p-5 bg-black/40 border border-white/10">
            <div className="text-lg font-semibold mb-3">Treasury</div>
            <div className="space-y-2 text-white/90">
              <div>
                <span className="opacity-70">SOL:</span>{" "}
                <b>{treasurySol == null ? "…" : treasurySol.toFixed(4)}</b>
              </div>
              <div>
                <span className="opacity-70">USD:</span>{" "}
                <b>
                  {treasurySol == null || solUsd == null
                    ? "…"
                    : formatUsd(treasurySol * solUsd)}
                </b>
                <span className="opacity-60 text-xs"> (Spot via Jupiter)</span>
              </div>
              <div className="opacity-60 text-sm">
                Treasury: {short(TREASURY)}
              </div>
            </div>
          </div>
        </div>

        {/* Dezent: ohne weitere Infos/Schalter für Investoren */}
        <div className="text-white/40 text-xs mt-8">
          Live-Werte dienen nur der Orientierung. On-chain Werte sind maßgeblich.
        </div>
      </main>

      <footer className="text-center text-white/40 text-sm py-6">
        © {new Date().getFullYear()} Die Mark Digital
      </footer>
    </div>
  );
}

export default function App() {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <InvestorBoard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
