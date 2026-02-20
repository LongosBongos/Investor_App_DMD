// src/App.tsx — V3.5 Premium Edition (clean + App/Fair Value) — RPC Leak-Safe (minimal)
// ====================================================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  LedgerWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import "@solana/wallet-adapter-react-ui/styles.css";

import {
  Connection,
  Commitment,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import idl from "./idl/dmd_anchor.json";
import { fetchSolUsd, computeDmdPricing } from "./price";

import {
  buildIxCoder,
  buildAccCoder,
  ixAutoWhitelistSelf,
  ixBuyDmd,
  ixClaimRewardV2,
  ixSwapExactSolForDmd,
  ixSwapExactDmdForSol,
  findVaultPda,
  findBuyerStatePda,
  ataFor as ataOf,
  createAtaIx,
  FOUNDER,
  TREASURY,
  DMD_MINT,
} from "./solana";

// UI Modules
import Leaderboard from "./Leaderboard";
import ForumView from "./ForumView";
import ForumEditor from "./ForumEditor";
import AirdropPreview from "./AirdropPreview";
import TokenDistribution from "./TokenDistribution";
import WelcomeOverlay from "./WelcomeOverlay";
import PriceChart from "./PriceChart";
import TxFeed from "./TxFeed";

import "./index.css";

// -------------------------
// Vite Env Typing (no casts)
// -------------------------
interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;

  // ✅ optional backend controls (GH Pages safe)
  readonly VITE_BACKEND_ENABLED?: string; // "1" to enable
  readonly VITE_BACKEND_URL?: string;     // e.g. https://your-backend.tld
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// -------------------------
// RPC (Leak-Safe, single source of truth)
// -------------------------
function getRpcUrl(): string {
  // ✅ public safe default (no api-key)
  const DEFAULT_RPC = "https://isabelle-2w7wuk-fast-mainnet.helius-rpc.com";

  const envRpc = import.meta.env.VITE_RPC_URL?.trim();
  const rpc = envRpc && envRpc.length > 0 ? envRpc : DEFAULT_RPC;

  // Hard safety: never allow api keys in frontend
  if (rpc.includes("api-key=") || rpc.includes("apiKey=")) {
    throw new Error(
      "SECURITY: VITE_RPC_URL contains api-key. Remove it and use a keyless endpoint or server proxy."
    );
  }

  return rpc;
}

// -------------------------
// Backend (GH Pages safe)
// -------------------------
function backendEnabled(): boolean {
  return (import.meta.env.VITE_BACKEND_ENABLED || "").trim() === "1";
}
function backendBase(): string {
  return (import.meta.env.VITE_BACKEND_URL || "").trim();
}
async function fetchBackendJson(path: string): Promise<unknown> {
  const base = backendBase();
  const url = base ? `${base}${path}` : path;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Non-JSON response (${ct})`);
  }

  return r.json();
}

// -------------------------
// Dexscreener (DMD Market)
// -------------------------
const DEX_PAIR = "6xBMvGzomHgPdWtD3V4JQ8rqji5EWtFDDoAyQhYsVVd2";

type DexPairResponse = {
  pairs?: Array<{
    priceUsd?: string;
    priceNative?: string; // in SOL
  }>;
};

async function fetchDmdUsdFromDex(pairAddress: string): Promise<number> {
  const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}?_=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Dexscreener HTTP ${r.status}`);
  const j: DexPairResponse = await r.json();
  const p = j.pairs?.[0];
  const v = Number(p?.priceUsd ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// -------------------------
// Safe helpers (no casts)
// -------------------------
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function readNumberField(obj: unknown, key: string): number | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];

  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);

  if (isRecord(v) && typeof (v as any).toNumber === "function") {
    const n = (v as any).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  if (isRecord(v) && typeof (v as any).toString === "function") {
    const n = Number((v as any).toString());
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function readBoolField(obj: unknown, key: string): boolean | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];

  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "bigint") return v !== 0n;

  if (isRecord(v) && typeof (v as any).toNumber === "function") {
    const n = (v as any).toNumber();
    return Number.isFinite(n) ? n !== 0 : null;
  }

  return null;
}

type FeedRow = Record<string, unknown>;

function toFeedRows(x: unknown): FeedRow[] {
  if (!Array.isArray(x)) return [];
  const out: FeedRow[] = [];
  for (const it of x) {
    if (isRecord(it)) out.push(it);
  }
  return out;
}

// -------------------------
// Types
// -------------------------
type Tab = "Dashboard" | "Trading" | "Forum" | "Leaderboard" | "Airdrop";

type ChartPoint = {
  time: string;
  dmdUsd: number; // Market (Dex)
  dmdAppUsd: number; // App/Fair Value (Treasury/Manual/Floor)
  solUsd: number; // optional context
};

// =============================================================
// Router (Tabs)
// =============================================================
function NavBar(props: { active: Tab; setActive: (t: Tab) => void }) {
  const items: Tab[] = ["Dashboard", "Trading", "Forum", "Leaderboard", "Airdrop"];

  return (
    <nav
      style={{
        display: "flex",
        gap: 20,
        justifyContent: "center",
        marginTop: 30,
        marginBottom: 30,
      }}
    >
      {items.map((t) => (
        <button
          key={t}
          onClick={() => props.setActive(t)}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background:
              props.active === t ? "rgba(245,197,66,0.12)" : "transparent",
            color: props.active === t ? "var(--gold)" : "white",
            fontWeight: 600,
          }}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}

// =============================================================
// UI ROOT WRAPPER
// =============================================================
function UIWrapper() {
  const [page, setPage] = useState<Tab>("Dashboard");

  return (
    <>
      <WelcomeOverlay />

      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <WalletMultiButton />
      </div>

      <NavBar active={page} setActive={setPage} />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {page === "Dashboard" && <DashboardPage />}
        {page === "Trading" && <TradingPage />}
        {page === "Forum" && <ForumPage />}
        {page === "Leaderboard" && <LeaderboardPage />}
        {page === "Airdrop" && <AirdropPage />}
      </div>
    </>
  );
}

// =============================================================
// DASHBOARD PAGE
// =============================================================
function DashboardPage() {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);

  const [connection] = useState(() => {
    const rpc = getRpcUrl();
    return new Connection(rpc, "confirmed" as Commitment);
  });

  const [treasurySol, setTreasurySol] = useState<number>(0);
  const [vaultDmd, setVaultDmd] = useState<number>(0);
  const [founderDmd, setFounderDmd] = useState<number>(0);

  const [dmdUsd, setDmdUsd] = useState<number>(0);
  const [dmdAppUsd, setDmdAppUsd] = useState<number>(0);
  const [solUsd, setSolUsd] = useState<number>(0);

  const [chart, setChart] = useState<ChartPoint[]>([]);

  const [pubFeed, setPubFeed] = useState<FeedRow[]>([]);
  const [treFeed, setTreFeed] = useState<FeedRow[]>([]);
  const [foundFeed, setFoundFeed] = useState<FeedRow[]>([]);

  const ixCoder = useMemo(() => buildIxCoder(idl), []);
  const accCoder = useMemo(() => buildAccCoder(idl), []);

  const isFounder =
    connected && wallet.publicKey?.toBase58() === FOUNDER.toBase58();

  useEffect(() => {
    let alive = true;

    async function pull() {
      try {
        const [sol, dmdMarket] = await Promise.all([
          fetchSolUsd().catch(() => 0),
          fetchDmdUsdFromDex(DEX_PAIR).catch(() => 0),
        ]);

        if (!alive) return;

        if (sol > 0) setSolUsd(sol);
        if (dmdMarket > 0) setDmdUsd(dmdMarket);

        // ✅ GH Pages safe feeds: only if backend is enabled + JSON
        let pubRaw: unknown = [];
        let treRaw: unknown = [];
        let fouRaw: unknown = [];

        if (backendEnabled()) {
          [pubRaw, treRaw, fouRaw] = await Promise.all([
            fetchBackendJson("/api/events?limit=40").catch(() => []),
            fetchBackendJson("/api/treasury-events?limit=40").catch(() => []),
            isFounder
              ? fetchBackendJson("/api/founder-events?limit=40").catch(() => [])
              : Promise.resolve([]),
          ]);
        }

        if (!alive) return;
        setPubFeed(toFeedRows(pubRaw));
        setTreFeed(toFeedRows(treRaw));
        setFoundFeed(toFeedRows(fouRaw));

        const vault = findVaultPda();
        const vAta = ataOf(vault, DMD_MINT);
        const fAta = ataOf(FOUNDER, DMD_MINT);

        const [vaultAcc, treLamports, vaultBal, founderBal] = await Promise.all([
          connection.getAccountInfo(vault).catch(() => null),
          connection.getBalance(TREASURY).catch(() => 0),
          connection
            .getTokenAccountBalance(vAta)
            .then((r) => Number(r.value.uiAmount ?? 0))
            .catch(() => 0),
          connection
            .getTokenAccountBalance(fAta)
            .then((r) => Number(r.value.uiAmount ?? 0))
            .catch(() => 0),
        ]);

        if (!alive) return;

        let lamportsPer10k = 0;
        if (vaultAcc?.data) {
          const decoded = accCoder.decode("Vault", vaultAcc.data);
          const n = readNumberField(decoded, "initial_price_sol");
          if (typeof n === "number" && Number.isFinite(n) && n > 0) {
            lamportsPer10k = n;
          }
        }

        const pricing = await computeDmdPricing({
          lamportsPer10k: lamportsPer10k > 0 ? lamportsPer10k : undefined,
          treasuryLamports: treLamports > 0 ? treLamports : undefined,
          manualFloorUsd: 0.01,
          treasuryWeight: 1.0,
        });

        if (!alive) return;

        const app = pricing.usdPerDmdFinal ?? 0;
        if (app > 0) setDmdAppUsd(app);

        setVaultDmd(vaultBal);
        setFounderDmd(founderBal);
        setTreasurySol(treLamports / LAMPORTS_PER_SOL);

        setChart((prev) => [
          ...prev.slice(-200),
          {
            time: new Date().toLocaleTimeString(),
            dmdUsd: dmdMarket || 0,
            dmdAppUsd: app || 0,
            solUsd: sol || 0,
          },
        ]);
      } catch (e) {
        console.error("Dashboard error:", e);
      }
    }

    pull();
    const iv = window.setInterval(pull, 5000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection, isFounder, accCoder, ixCoder]);

  return (
    <div style={{ marginTop: 20 }}>
      <div className="grid-3">
        <div className="card p-xl">
          <div className="card-title">Vault (DMD)</div>
          <div className="card-value">{vaultDmd.toLocaleString()}</div>
        </div>

        <div className="card p-xl">
          <div className="card-title">Treasury (SOL)</div>
          <div className="card-value">{treasurySol.toFixed(2)} SOL</div>
        </div>

        <div className="card p-xl">
          <div className="card-title">Founder (DMD)</div>
          <div className="card-value">{founderDmd.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }} className="grid-3">
        <div className="card p-md">
          <div className="card-title">DMD Price (USD)</div>
          <div className="card-value">{dmdUsd ? dmdUsd.toFixed(6) : "—"}</div>
        </div>

        <div className="card p-md">
          <div className="card-title">DMD App Value (USD)</div>
          <div className="card-value">{dmdAppUsd ? dmdAppUsd.toFixed(6) : "—"}</div>
        </div>

        <div className="card p-md">
          <div className="card-title">SOL Price (USD)</div>
          <div className="card-value">{solUsd ? solUsd.toFixed(2) : "—"}</div>
        </div>
      </div>

      <div style={{ marginTop: 40 }}>
        <TokenDistribution vault={vaultDmd} treasury={treasurySol} founder={founderDmd} />
      </div>

      <div style={{ marginTop: 40 }}>
        <PriceChart data={chart} />
      </div>

      <div className="grid-3" style={{ marginTop: 40 }}>
        <TxFeed title="Public Feed" rows={pubFeed} />
        <TxFeed title="Treasury Feed" rows={treFeed} />
        {isFounder && <TxFeed title="Founder Feed" rows={foundFeed} />}
      </div>
    </div>
  );
}

// =============================================================
// TRADING PAGE
// =============================================================
function TradingPage() {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);

  const [connection] = useState(() => {
    const rpc = getRpcUrl();
    return new Connection(rpc, "confirmed" as Commitment);
  });

  const ixCoder = useMemo(() => buildIxCoder(idl), []);
  const accCoder = useMemo(() => buildAccCoder(idl), []);

  const [status, setStatus] = useState<string>("");
  const [amountSol, setAmountSol] = useState<string>("1.0");
  const [amountDmd, setAmountDmd] = useState<string>("10000");
  const [slippagePct, setSlippagePct] = useState<string>("1.0");

  const [buyerState, setBuyerState] = useState<unknown>(null);
  const [whitelisted, setWhitelisted] = useState<boolean>(false);

  const HOLD_DURATION_SEC = 60 * 60 * 24 * 30;
  const CLAIM_INTERVAL_SEC = 60 * 60 * 24 * 90;

  const [treasurySol, setTreasurySol] = useState<number>(0);
  const [priceLamports10k, setPriceLamports10k] = useState<number | null>(null);
  const [vaultDmd, setVaultDmd] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function pull() {
      if (!connected || !wallet.publicKey) return;

      try {
        const vault = findVaultPda();
        const bs = findBuyerStatePda(vault, wallet.publicKey);

        const ai = await connection.getAccountInfo(bs).catch(() => null);
        if (!alive) return;

        if (ai?.data) {
          const decoded = accCoder.decode("BuyerState", ai.data);
          const wl = readBoolField(decoded, "whitelisted");
          setBuyerState(decoded);
          setWhitelisted(wl === true);
        } else {
          setBuyerState(null);
          setWhitelisted(false);
        }

        const vaultAcc = await connection.getAccountInfo(vault).catch(() => null);
        if (!alive) return;

        if (vaultAcc?.data) {
          const decoded = accCoder.decode("Vault", vaultAcc.data);
          const n = readNumberField(decoded, "initial_price_sol");
          setPriceLamports10k(typeof n === "number" ? n : 0);
        }

        const vAta = ataOf(vault, DMD_MINT);
        const balance = await connection
          .getTokenAccountBalance(vAta)
          .then((r) => Number(r.value.uiAmount ?? 0))
          .catch(() => 0);
        const treLam = await connection.getBalance(TREASURY).catch(() => 0);

        if (!alive) return;
        setVaultDmd(balance);
        setTreasurySol(treLam / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error("Trading pull error:", e);
      }
    }

    pull();
    const iv = window.setInterval(pull, 8000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection, connected, wallet.publicKey, accCoder]);

  function slippageToBps(s: string): number {
    const n = Number(String(s || "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 1; // minimum 1 bps
    const clamped = Math.max(0, Math.min(50, n)); // 0..50%
    return Math.max(1, Math.floor(clamped * 100)); // 1% => 100 bps
  }

  async function handleAutoWhitelist() {
    try {
      if (!connected || !wallet.publicKey) return alert("Wallet verbinden.");
      setStatus("Auto-Whitelist…");

      const ix = ixAutoWhitelistSelf(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Whitelist gesendet: ${sig}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Whitelist Fehler: " + msg);
    }
  }

  async function handleBuy() {
    try {
      if (!connected || !wallet.publicKey) return alert("Wallet verbinden.");
      setStatus("Buy…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta = ataOf(vault, DMD_MINT);
      const bAta = ataOf(buyer, DMD_MINT);

      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);

      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      const lamports = Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL);
      const buyIx = ixBuyDmd(ixCoder, buyer, lamports);

      const tx = new Transaction();
      ixs.forEach((ix) => tx.add(ix));
      tx.add(buyIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Buy gesendet: ${sig}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Buy Fehler: " + msg);
    }
  }

  async function handleSwapSolToDmd() {
    try {
      if (!connected || !wallet.publicKey) return alert("Wallet verbinden.");
      setStatus("Swap SOL➜DMD…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta = ataOf(vault, DMD_MINT);
      const bAta = ataOf(buyer, DMD_MINT);

      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);

      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      const lamports = Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL);
      const bps = slippageToBps(slippagePct);
      const swapIx = ixSwapExactSolForDmd(ixCoder, buyer, lamports, bps);

      const tx = new Transaction();
      ixs.forEach((ix) => tx.add(ix));
      tx.add(swapIx);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = buyer;

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Swap SOL→DMD: ${sig}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Swap Fehler: " + msg);
    }
  }

  async function handleSwapDmdToSol() {
    try {
      if (!connected || !wallet.publicKey) return alert("Wallet verbinden.");
      setStatus("Swap DMD➜SOL…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta = ataOf(vault, DMD_MINT);
      const bAta = ataOf(buyer, DMD_MINT);

      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);

      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      const amo = Math.floor(parseFloat(amountDmd));
      const bps = slippageToBps(slippagePct);
      const swapIx = ixSwapExactDmdForSol(ixCoder, buyer, amo, bps);

      const tx = new Transaction();
      ixs.forEach((ix) => tx.add(ix));
      tx.add(swapIx);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = buyer;

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Swap DMD→SOL: ${sig}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Swap Fehler: " + msg);
    }
  }

  async function handleClaim() {
    try {
      if (!connected || !wallet.publicKey) return alert("Wallet verbinden.");
      if (!buyerState) return setStatus("Kein BuyerState.");

      const now = Math.floor(Date.now() / 1000);
      const holdSince = readNumberField(buyerState, "holding_since") ?? 0;
      const lastClaim = readNumberField(buyerState, "last_reward_claim") ?? 0;

      if (now - holdSince < HOLD_DURATION_SEC) return setStatus("Hold 30 Tage nicht erfüllt.");
      if (lastClaim && now - lastClaim < CLAIM_INTERVAL_SEC) return setStatus("Claim erst nach 90 Tagen.");

      setStatus("Claim…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta = ataOf(vault, DMD_MINT);
      const bAta = ataOf(buyer, DMD_MINT);

      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);

      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      const ix = ixClaimRewardV2(ixCoder, buyer);

      const tx = new Transaction();
      ixs.forEach((x) => tx.add(x));
      tx.add(ix);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = buyer;

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Claim gesendet: ${sig}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Claim Fehler: " + msg);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      {!connected && (
        <div className="panel" style={{ textAlign: "center", padding: 20 }}>
          <div className="panel-title">Wallet verbinden</div>
          <p className="small muted">Verbinde deine Wallet, um DMD handeln zu können.</p>
          <WalletMultiButton />
        </div>
      )}

      {connected && (
        <>
          {!whitelisted && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">Whitelist</div>
              <p className="small muted">Du bist noch nicht freigeschaltet.</p>
              <button className="btn" onClick={handleAutoWhitelist}>
                Auto-Whitelist (≥ 0,5 SOL)
              </button>
            </div>
          )}

          {whitelisted && (
            <div className="grid-2">
              <div className="panel">
                <div className="panel-title">SOL → DMD</div>
                <label className="small muted">SOL</label>
                <input className="input" value={amountSol} onChange={(e) => setAmountSol(e.target.value)} />

                <label className="small muted" style={{ marginTop: 10 }}>
                  Slippage (%)
                </label>
                <input className="input input--sm" value={slippagePct} onChange={(e) => setSlippagePct(e.target.value)} />

                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button className="action-btn" onClick={handleBuy}>BUY DMD</button>
                  <button className="action-btn swap-btn" onClick={handleSwapSolToDmd}>SWAP SOL→DMD</button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">DMD → SOL</div>
                <label className="small muted">DMD</label>
                <input className="input" value={amountDmd} onChange={(e) => setAmountDmd(e.target.value)} />

                <label className="small muted" style={{ marginTop: 10 }}>
                  Slippage (%)
                </label>
                <input className="input input--sm" value={slippagePct} onChange={(e) => setSlippagePct(e.target.value)} />

                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button className="action-btn swap-btn" onClick={handleSwapDmdToSol}>SWAP DMD→SOL</button>
                  <button className="action-btn" onClick={handleClaim}>CLAIM</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {status && (
        <p className="small muted" style={{ marginTop: 20, whiteSpace: "pre-wrap" }}>
          {status}
        </p>
      )}
    </div>
  );
}

// =============================================================
// FORUM PAGE
// =============================================================
function ForumPage() {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);

  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        Community Forum
      </div>

      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">Bitte Wallet verbinden.</p>
          <WalletMultiButton />
        </div>
      )}

      {connected && (
        <>
          <ForumView walletPk={wallet.publicKey?.toBase58()} />
          <div style={{ marginTop: 30 }}>
            <ForumEditor walletPk={wallet.publicKey?.toBase58()} />
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================
// LEADERBOARD PAGE
// =============================================================
function LeaderboardPage() {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        Top DMD Holder
      </div>
      <Leaderboard />
    </div>
  );
}

// =============================================================
// AIRDROP PAGE (Founder only)
// =============================================================
function AirdropPage() {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);

  const isFounder =
    connected && wallet.publicKey?.toBase58() === FOUNDER.toBase58();

  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        Founder – Smart Airdrop Preview
      </div>

      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">Bitte Wallet verbinden.</p>
          <WalletMultiButton />
        </div>
      )}

      {connected && !isFounder && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">Nur Founder können diesen Bereich sehen.</p>
        </div>
      )}

      {connected && isFounder && (
        <div>
          <AirdropPreview />
        </div>
      )}
    </div>
  );
}

// =============================================================
// ROOT APP WRAPPER
// =============================================================
export default function App() {
  const wallets = useMemo<WalletAdapter[]>(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  // ✅ single source of truth
  const endpoint = getRpcUrl();

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <UIWrapper />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
