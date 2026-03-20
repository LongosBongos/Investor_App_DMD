// src/App.tsx
// Investor_App_DMD — hardened active shell
// Preserves the existing page structure and core UX,
// but aligns runtime behavior with the current on-chain truth.

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
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import idl from "./idl/dmd_anchor.json";
import { fetchSolUsd, computeDmdPricing } from "./price";
import {
  buildIxCoder,
  ixAutoWhitelistSelf,
  ixInitializeBuyerStateExtV2,
  ixBuyDmd,
  ixClaimRewardV2,
  ixSwapExactDmdForSol,
  findVaultPda,
  findVaultConfigV2Pda,
  findBuyerStatePda,
  findBuyerStateExtV2Pda,
  ataFor as ataOf,
  createAtaIx,
  PROGRAM_ID,
  PROTOCOL_OWNER,
  TREASURY,
  DMD_MINT,
} from "./solana";

// UI Modules
import Leaderboard from "./Leaderboard";
import ForumView from "./ForumView";
import AirdropPreview from "./AirdropPreview";
import TokenDistribution from "./TokenDistribution";
import WelcomeOverlay from "./WelcomeOverlay";
import PriceChart from "./PriceChart";
import TxFeed from "./TxFeed";
import "./index.css";

// -------------------------
// Types (wichtig für alle Status-Messages + Debug)
// -------------------------
type Tab = "Dashboard" | "Trading" | "Forum" | "Leaderboard" | "Airdrop";
type UiKind = "idle" | "info" | "success" | "error";
type ChartPoint = {
  time: string;
  dmdUsd: number;
  dmdAppUsd: number;
  solUsd: number;
};

// -------------------------
// Vite Env Typing
// -------------------------
interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_BACKEND_ENABLED?: string;
  readonly VITE_BACKEND_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// -------------------------
// Runtime constants (aligned to current contract)
// -------------------------
const HOLD_DURATION_SEC = 60 * 60 * 24 * 30;
const CLAIM_INTERVAL_SEC = 60 * 60 * 24 * 90;
const BUY_MIN_SOL = 0.1;
const BUY_MAX_SOL = 100;
const BUY_DAILY_LIMIT = 10;
const SELL_WINDOW_SEC = 60 * 60 * 24 * 30;
const FREE_SELLS_PER_WINDOW = 2;
const DEX_PAIR = "6xBMvGzomHgPdWtD3V4JQ8rqji5EWtFDDoAyQhYsVVd2";

// -------------------------
// RPC (leak-safe)
// -------------------------
function getRpcUrl(): string {
  const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
  const envRpc = import.meta.env.VITE_RPC_URL?.trim();
  const rpc = envRpc && envRpc.length > 0 ? envRpc : DEFAULT_RPC;
  if (rpc.includes("api-key=") || rpc.includes("apiKey=")) {
    throw new Error(
      "SECURITY: VITE_RPC_URL contains api-key. Remove it and use a keyless endpoint or a backend proxy."
    );
  }
  return rpc;
}

// -------------------------
// Backend (optional / GH Pages safe)
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
// Dexscreener
// -------------------------
type DexPairResponse = {
  pairs?: Array<{
    priceUsd?: string;
    priceNative?: string;
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
// Safe helpers
// -------------------------
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function toFeedRows(x: unknown): Record<string, unknown>[] {
  if (!Array.isArray(x)) return [];
  return x.filter(isRecord);
}
function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0
    ? `${d}d ${pad(h)}:${pad(m)}:${pad(ss)}`
    : `${pad(h)}:${pad(m)}:${pad(ss)}`;
}
function currentDayIndex(nowTs: number): number {
  return Math.floor(nowTs / 86400);
}
function shortPk(pk: PublicKey | null | undefined): string {
  if (!pk) return "—";
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
function readU64LE(view: DataView, offset: number): bigint {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return (BigInt(hi) << 32n) + BigInt(lo);
}
function readBool(view: DataView, offset: number): boolean {
  return view.getUint8(offset) !== 0;
}
function slippageToBps(s: string): number {
  const n = Number(String(s || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.floor(n * 100);
}
function normalizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("SELL_DISABLED_FRONTEND")) {
    return "Sell / DMD→SOL ist aktuell bewusst deaktiviert.";
  }
  if (raw.includes("BuyCooldownActive")) {
    return "Buy-Cooldown aktiv. Bitte warte, bis der Cooldown abgelaufen ist.";
  }
  if (raw.includes("BuyDailyLimitExceeded")) {
    return "Tageslimit erreicht. Weitere Buys sind vorübergehend gesperrt.";
  }
  if (raw.includes("LegacyClaimFlowDisabled")) {
    return "Nur Claim V2 ist aktiv. Bitte App-Stand prüfen.";
  }
  if (raw.includes("SellTemporarilyDisabled")) {
    return "Sell ist on-chain derzeit deaktiviert.";
  }
  if (raw.includes("InvalidTreasury")) {
    return "Treasury-Konfiguration stimmt nicht mit der On-chain-Wahrheit überein.";
  }
  if (raw.includes("InvalidOwner")) {
    return "Owner-Konfiguration stimmt nicht mit der On-chain-Wahrheit überein.";
  }
  if (raw.includes("RewardTooSmall")) {
    return "Reward aktuell zu klein für einen Claim.";
  }
  if (raw.includes("InsufficientVaultRewardLiquidity")) {
    return "Nicht genug Reward-Liquidität im Vault.";
  }
  if (raw.includes("InsufficientTreasuryLiquidity")) {
    return "Die Treasury hat aktuell nicht genug Liquidität für diesen Pfad.";
  }
  if (raw.includes("ExtraSellApprovalRequired")) {
    return "Zusätzliche Sell-Freigabe erforderlich.";
  }
  return raw;
}

// -------------------------
// Manual decoders (do not trust old App IDL for reads)
// -------------------------
type VaultDecoded = {
  owner: PublicKey;
  totalSupply: bigint;
  presaleSold: bigint;
  initialPriceLamportsPer10k: bigint;
  publicSaleActive: boolean;
  mint: PublicKey;
  mintDecimals: number;
};
type VaultConfigV2Decoded = {
  treasury: PublicKey;
  manualPriceLamportsPer10k: bigint;
  dynamicPricingEnabled: boolean;
  sellLive: boolean;
};
type BuyerStateDecoded = {
  totalDmd: bigint;
  lastRewardClaim: bigint;
  lastSell: bigint;
  holdingSince: bigint;
  lastBuyDay: bigint;
  buyCountToday: bigint;
  whitelisted: boolean;
};
type BuyerStateExtV2Decoded = {
  buyCooldownUntil: bigint;
  sellWindowStart: bigint;
  sellCountWindow: number;
  extraSellApprovals: number;
  firstClaimDone: boolean;
};
function decodeVault(data: Buffer | Uint8Array): VaultDecoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const totalSupply = readU64LE(view, offset);
  offset += 8;
  const presaleSold = readU64LE(view, offset);
  offset += 8;
  const initialPriceLamportsPer10k = readU64LE(view, offset);
  offset += 8;
  const publicSaleActive = readBool(view, offset);
  offset += 1;
  const mint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const mintDecimals = view.getUint8(offset);
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
function decodeVaultConfigV2(data: Buffer | Uint8Array): VaultConfigV2Decoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const treasury = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const manualPriceLamportsPer10k = readU64LE(view, offset);
  offset += 8;
  const dynamicPricingEnabled = readBool(view, offset);
  offset += 1;
  const sellLive = readBool(view, offset);
  return {
    treasury,
    manualPriceLamportsPer10k,
    dynamicPricingEnabled,
    sellLive,
  };
}
function decodeBuyerState(data: Buffer | Uint8Array): BuyerStateDecoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const totalDmd = readU64LE(view, offset);
  offset += 8;
  const lastRewardClaim = readU64LE(view, offset);
  offset += 8;
  const lastSell = readU64LE(view, offset);
  offset += 8;
  const holdingSince = readU64LE(view, offset);
  offset += 8;
  const lastBuyDay = readU64LE(view, offset);
  offset += 8;
  const buyCountToday = readU64LE(view, offset);
  offset += 8;
  const whitelisted = readBool(view, offset);
  return {
    totalDmd,
    lastRewardClaim,
    lastSell,
    holdingSince,
    lastBuyDay,
    buyCountToday,
    whitelisted,
  };
}
function decodeBuyerStateExtV2(
  data: Buffer | Uint8Array
): BuyerStateExtV2Decoded {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const buyCooldownUntil = readU64LE(view, offset);
  offset += 8;
  const sellWindowStart = readU64LE(view, offset);
  offset += 8;
  const sellCountWindow = view.getUint8(offset);
  offset += 1;
  const extraSellApprovals = view.getUint8(offset);
  offset += 1;
  const firstClaimDone = readBool(view, offset);
  return {
    buyCooldownUntil,
    sellWindowStart,
    sellCountWindow,
    extraSellApprovals,
    firstClaimDone,
  };
}

// -------------------------
// Shared UI helpers
// -------------------------
function StatusDot({
  active,
  label,
}: {
  active: boolean | null;
  label?: string;
}) {
  const bg =
    active == null
      ? "rgba(255,255,255,0.35)"
      : active
      ? "#14f195"
      : "#ff4d4f";
  const glow = active == null
    ? "0 0 0 1px rgba(255,255,255,0.16)"
    : active
      ? "0 0 10px rgba(20,241,149,0.75), 0 0 18px rgba(20,241,149,0.32)"
      : "0 0 10px rgba(255,77,79,0.75), 0 0 18px rgba(255,77,79,0.32)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: bg,
          boxShadow: glow,
          display: "inline-block",
          flex: "0 0 auto",
        }}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
function StatusPanel({
  kind,
  message,
}: {
  kind: UiKind;
  message: string;
}) {
  if (!message) return null;
  const border =
    kind === "error"
      ? "rgba(255,77,79,0.5)"
      : kind === "success"
      ? "rgba(20,241,149,0.35)"
      : "rgba(245,197,66,0.35)";
  const bg =
    kind === "error"
      ? "rgba(255,77,79,0.5)"
      : kind === "success"
      ? "rgba(20,241,149,0.35)"
      : "rgba(245,197,66,0.35)";
  const color =
    kind === "error"
      ? "#ff9ea0"
      : kind === "success"
      ? "#8dffd3"
      : "#f5c542";
  return (
    <div
      className="panel"
      style={{
        marginTop: 20,
        padding: 16,
        border: `1px solid ${border}`,
        background: bg,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          color,
          marginBottom: 6,
          letterSpacing: 0.3,
        }}
      >
        {kind === "error"
          ? "ERROR"
          : kind === "success"
          ? "STATUS OK"
          : "HINWEIS"}
      </div>
      <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
        {message}
      </div>
    </div>
  );
}

// =============================================================
// Router (Tabs)
// =============================================================
function NavBar(props: {
  active: Tab;
  setActive: (t: Tab) => void;
  showAirdrop: boolean;
}) {
  const items: Tab[] = props.showAirdrop
    ? ["Dashboard", "Trading", "Forum", "Leaderboard", "Airdrop"]
    : ["Dashboard", "Trading", "Forum", "Leaderboard"];
  return (
    <nav
      className="tab-nav"
      style={{
        display: "flex",
        gap: 20,
        justifyContent: "center",
        marginTop: 30,
        marginBottom: 30,
        flexWrap: "wrap",
      }}
    >
      {items.map((t) => (
        <button
          key={t}
          onClick={() => props.setActive(t)}
          className={props.active === t ? "active" : ""}
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
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);
  const isOwner =
    connected && wallet.publicKey?.toBase58() === PROTOCOL_OWNER.toBase58();
  useEffect(() => {
    if (page === "Airdrop" && !isOwner) {
      setPage("Dashboard");
    }
  }, [page, isOwner]);
  return (
    <>
      <WelcomeOverlay />
      <style>{`
        .wallet-connect-bottom .wallet-adapter-dropdown {
          position: static !important;
          top: auto !important;
          right: auto !important;
          left: auto !important;
          bottom: auto !important;
        }
        .wallet-connect-bottom .wallet-adapter-button-trigger,
        .wallet-connect-bottom .wallet-adapter-button {
          position: static !important;
          top: auto !important;
          right: auto !important;
          left: auto !important;
          bottom: auto !important;
        }
      `}</style>
      {!connected && (
        <div
          className="wallet-connect-bottom"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 22,
            transform: "translateX(-50%)",
            zIndex: 2147483647,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          <WalletMultiButton />
        </div>
      )}
      <NavBar active={page} setActive={setPage} showAirdrop={isOwner} />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {page === "Dashboard" && <DashboardPage />}
        {page === "Trading" && <TradingPage />}
        {page === "Forum" && <ForumPage />}
        {page === "Leaderboard" && <LeaderboardPage />}
        {page === "Airdrop" && isOwner && <AirdropPage />}
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
  const isOwner =
    connected && wallet.publicKey?.toBase58() === PROTOCOL_OWNER.toBase58();
  const [connection] = useState(() => {
    const rpc = getRpcUrl();
    return new Connection(rpc, "confirmed" as Commitment);
  });
  const [treasurySol, setTreasurySol] = useState<number>(0);
  const [vaultDmd, setVaultDmd] = useState<number>(0);
  const [ownerDmd, setOwnerDmd] = useState<number>(0);
  const [dmdUsd, setDmdUsd] = useState<number>(0);
  const [dmdAppUsd, setDmdAppUsd] = useState<number>(0);
  const [solUsd, setSolUsd] = useState<number>(0);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [pubFeed, setPubFeed] = useState<Record<string, unknown>[]>([]);
  const [treFeed, setTreFeed] = useState<Record<string, unknown>[]>([]);
  const [vaultOwnerMatch, setVaultOwnerMatch] = useState<boolean | null>(null);
  const [treasuryMatch, setTreasuryMatch] = useState<boolean | null>(null);
  const [sellLive, setSellLive] = useState<boolean | null>(null);
  const [dynamicPricingEnabled, setDynamicPricingEnabled] = useState<
    boolean | null
  >(null);
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
        if (backendEnabled()) {
          const [pubRaw, treRaw] = await Promise.all([
            fetchBackendJson("/api/events?limit=40").catch(() => []),
            fetchBackendJson("/api/treasury-events?limit=40").catch(() => []),
          ]);
          if (!alive) return;
          setPubFeed(toFeedRows(pubRaw));
          setTreFeed(toFeedRows(treRaw));
        } else {
          setPubFeed([]);
          setTreFeed([]);
        }
        const vault = findVaultPda();
        const vaultConfig = findVaultConfigV2Pda(vault);
        const vAta = ataOf(vault, DMD_MINT);
        const ownerAta = ataOf(PROTOCOL_OWNER, DMD_MINT);
        const [vaultInfo, configInfo, treLamports, vaultBal, ownerBal] =
          await Promise.all([
            connection.getAccountInfo(vault).catch(() => null),
            connection.getAccountInfo(vaultConfig).catch(() => null),
            connection.getBalance(TREASURY).catch(() => 0),
            connection
              .getTokenAccountBalance(vAta)
              .then((r) => Number(r.value.uiAmount ?? 0))
              .catch(() => 0),
            connection
              .getTokenAccountBalance(ownerAta)
              .then((r) => Number(r.value.uiAmount ?? 0))
              .catch(() => 0),
          ]);
        if (!alive) return;
        let lamportsPer10k = 0;
        let ownerMatch: boolean | null = null;
        let treMatch: boolean | null = null;
        let nextSellLive: boolean | null = null;
        let nextDynamicPricingEnabled: boolean | null = null;
        if (vaultInfo?.data) {
          const vaultDecoded = decodeVault(vaultInfo.data);
          lamportsPer10k = Number(vaultDecoded.initialPriceLamportsPer10k);
          ownerMatch = vaultDecoded.owner.equals(PROTOCOL_OWNER);
        }
        if (configInfo?.data) {
          const configDecoded = decodeVaultConfigV2(configInfo.data);
          treMatch = configDecoded.treasury.equals(TREASURY);
          nextSellLive = configDecoded.sellLive;
          nextDynamicPricingEnabled = configDecoded.dynamicPricingEnabled;
          if (Number(configDecoded.manualPriceLamportsPer10k) > 0) {
            lamportsPer10k = Number(configDecoded.manualPriceLamportsPer10k);
          }
        }
        const pricing = await computeDmdPricing({
          lamportsPer10k: lamportsPer10k > 0 ? lamportsPer10k : undefined,
          treasuryLamports: treLamports > 0 ? treLamports : undefined,
          treasuryWeight: 1.0,
        });
        if (!alive) return;
        const app = pricing.usdPerDmdFinal ?? 0;
        if (app > 0) setDmdAppUsd(app);
        setVaultDmd(vaultBal);
        setOwnerDmd(ownerBal);
        setTreasurySol(treLamports / LAMPORTS_PER_SOL);
        setVaultOwnerMatch(ownerMatch);
        setTreasuryMatch(treMatch);
        setSellLive(nextSellLive);
        setDynamicPricingEnabled(nextDynamicPricingEnabled);
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
    void pull();
    const iv = window.setInterval(() => {
      void pull();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection]);
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
          <div className="card-title">Protocol Owner (DMD)</div>
          <div className="card-value">{ownerDmd.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }} className="grid-3">
        <div className="card p-md">
          <div className="card-title">DMD Price (DEX)</div>
          <div className="card-value">{dmdUsd ? dmdUsd.toFixed(6) : "—"}</div>
        </div>
        <div className="card p-md">
          <div className="card-title">DMD App Value</div>
          <div className="card-value">{dmdAppUsd ? dmdAppUsd.toFixed(6) : "—"}</div>
        </div>
        <div className="card p-md">
          <div className="card-title">SOL Price (USD)</div>
          <div className="card-value">{solUsd ? solUsd.toFixed(2) : "—"}</div>
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 18 }}>
        <div className="card p-md">
          <div className="card-title">Vault Owner Match</div>
          <div className="card-value">
            {vaultOwnerMatch == null ? "—" : vaultOwnerMatch ? "YES" : "NO"}
          </div>
        </div>
        <div className="card p-md">
          <div className="card-title">Treasury Match</div>
          <div className="card-value">
            {treasuryMatch == null ? "—" : treasuryMatch ? "YES" : "NO"}
          </div>
        </div>
        <div className="card p-md">
          <div className="card-title">Sell Status</div>
          <div className="card-value">
            <StatusDot
              active={sellLive}
              label={
                sellLive == null ? "UNKNOWN" : sellLive ? "LIVE" : "BLOCKED"
              }
            />
          </div>
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 18 }}>
        <div className="card p-md">
          <div className="card-title">Pricing Mode</div>
          <div className="card-value">
            {dynamicPricingEnabled == null
              ? "—"
              : dynamicPricingEnabled
              ? "Dynamic"
              : "Manual"}
          </div>
        </div>
        <div className="card p-md">
          <div className="card-title">Program</div>
          <div className="card-value" style={{ fontSize: 14 }}>
            {shortPk(PROGRAM_ID)}
          </div>
        </div>
        <div className="card p-md">
          <div className="card-title">Mint</div>
          <div className="card-value" style={{ fontSize: 14 }}>
            {shortPk(DMD_MINT)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 40 }}>
        <TokenDistribution
          vault={vaultDmd}
          treasury={treasurySol}
          founder={ownerDmd}
        />
      </div>
      <div style={{ marginTop: 40 }}>
        <PriceChart data={chart} />
      </div>
      <div className="grid-3" style={{ marginTop: 40 }}>
        <TxFeed title="Public Feed" rows={pubFeed} />
        <TxFeed title="Treasury Feed" rows={treFeed} />
        {isOwner ? (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-title">Protocol Notice</div>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              Founder-/Owner-spezifische Feeds sind absichtlich nicht Teil des
              öffentlichen Investor-Flows.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-title">Status</div>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              On-chain state is the source of truth. The app shows a
              conservative public surface.
            </p>
          </div>
        )}
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
  const [uiMessage, setUiMessage] = useState<string>("");
  const [uiKind, setUiKind] = useState<UiKind>("idle");
  const [amountSol, setAmountSol] = useState<string>("1.0");
  const [amountDmd, setAmountDmd] = useState<string>("10000");
  const [slippagePct, setSlippagePct] = useState<string>("1.0");
  const [buyerState, setBuyerState] = useState<BuyerStateDecoded | null>(null);
  const [buyerExt, setBuyerExt] = useState<BuyerStateExtV2Decoded | null>(null);
  const [whitelisted, setWhitelisted] = useState<boolean>(false);
  const [isLegacyWallet, setIsLegacyWallet] = useState<boolean>(false);
  const [treasurySol, setTreasurySol] = useState<number>(0);
  const [priceLamports10k, setPriceLamports10k] = useState<number | null>(null);
  const [vaultDmd, setVaultDmd] = useState<number | null>(null);
  const [sellLive, setSellLive] = useState<boolean>(false);
  const [walletDmd, setWalletDmd] = useState<number>(0);
  const [dmdMarketUsd, setDmdMarketUsd] = useState<number>(0);
  const [walletInternalValueUsd, setWalletInternalValueUsd] =
    useState<number>(0);
  const [nowTs, setNowTs] = useState<number>(() =>
    Math.floor(Date.now() / 1000)
  );
  function setInfo(message: string) {
    setUiKind("info");
    setUiMessage(message);
  }
  function setSuccess(message: string) {
    setUiKind("success");
    setUiMessage(message);
  }
  function setError(message: string) {
    setUiKind("error");
    setUiMessage(message);
  }
  useEffect(() => {
    const iv = window.setInterval(
      () => setNowTs(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => window.clearInterval(iv);
  }, []);
  const policyView = useMemo(() => {
    const result = {
      buyCooldownLeft: 0,
      buyCountToday: 0,
      buyLimitReached: false,
      holdReadyAt: 0,
      intervalReadyAt: 0,
      claimReady: false,
      claimText: "—",
      dailyCountText: "—",
      sellCountWindow: 0,
      freeSellsLeft: FREE_SELLS_PER_WINDOW,
      extraSellApprovals: 0,
      sellWindowTimeLeft: 0,
      sellWindowText: "—",
    };
    if (!buyerState) return result;
    const holdSince = Number(buyerState.holdingSince);
    const lastClaim = Number(buyerState.lastRewardClaim);
    const lastBuyDay = Number(buyerState.lastBuyDay);
    const buyCountToday = Number(buyerState.buyCountToday);
    const today = currentDayIndex(nowTs);
    result.buyCountToday = lastBuyDay === today ? buyCountToday : 0;
    result.buyLimitReached = result.buyCountToday >= BUY_DAILY_LIMIT;
    result.dailyCountText = `${result.buyCountToday}/${BUY_DAILY_LIMIT}`;
    if (buyerExt) {
      const cooldownUntil = Number(buyerExt.buyCooldownUntil);
      result.buyCooldownLeft = Math.max(0, cooldownUntil - nowTs);
      result.sellCountWindow = buyerExt.sellCountWindow;
      result.extraSellApprovals = buyerExt.extraSellApprovals;
      result.freeSellsLeft = Math.max(
        0,
        FREE_SELLS_PER_WINDOW - buyerExt.sellCountWindow
      );
      const sellWindowStart = Number(buyerExt.sellWindowStart);
      if (sellWindowStart > 0) {
        const readyAt = sellWindowStart + SELL_WINDOW_SEC;
        result.sellWindowTimeLeft = Math.max(0, readyAt - nowTs);
        result.sellWindowText =
          result.sellWindowTimeLeft > 0
            ? fmtCountdown(result.sellWindowTimeLeft)
            : "Reset fällig / nächstes Fenster aktiv";
      }
    }
    result.holdReadyAt = holdSince > 0 ? holdSince + HOLD_DURATION_SEC : 0;
    result.intervalReadyAt = lastClaim > 0 ? lastClaim + CLAIM_INTERVAL_SEC : 0;
    const readyAt = Math.max(result.holdReadyAt, result.intervalReadyAt);
    if (readyAt > 0) {
      const left = readyAt - nowTs;
      result.claimReady = left <= 0;
      result.claimText = result.claimReady
        ? "✅ Claim verfügbar"
        : `⏳ Claim in ${fmtCountdown(left)}`;
    }
    return result;
  }, [buyerState, buyerExt, nowTs]);
  useEffect(() => {
    let alive = true;
    async function pull() {
      if (!connected || !wallet.publicKey) {
        if (!alive) return;
        setBuyerState(null);
        setBuyerExt(null);
        setWhitelisted(false);
        setWalletDmd(0);
        setWalletInternalValueUsd(0);
        setIsLegacyWallet(false);
        return;
      }
      try {
        const buyer = wallet.publicKey;
        const vault = findVaultPda();
        const vaultConfig = findVaultConfigV2Pda(vault);
        const bs = findBuyerStatePda(vault, buyer);
        const bsExt = findBuyerStateExtV2Pda(vault, buyer);
        const market = await fetchDmdUsdFromDex(DEX_PAIR).catch(() => 0);
        if (alive && market > 0) setDmdMarketUsd(market);
        const buyerAta = ataOf(buyer, DMD_MINT);
        const bBal = await connection
          .getTokenAccountBalance(buyerAta)
          .then((r) => Number(r.value.uiAmount ?? 0))
          .catch(() => 0);
        if (alive) setWalletDmd(bBal);
        const [buyerInfo, buyerExtInfo, vaultInfo, configInfo] =
          await Promise.all([
            connection.getAccountInfo(bs).catch(() => null),
            connection.getAccountInfo(bsExt).catch(() => null),
            connection.getAccountInfo(vault).catch(() => null),
            connection.getAccountInfo(vaultConfig).catch(() => null),
          ]);
        if (!alive) return;
        if (buyerInfo?.data) {
          const decoded = decodeBuyerState(buyerInfo.data);
          setBuyerState(decoded);
          setWhitelisted(decoded.whitelisted);
        } else {
          setBuyerState(null);
          setWhitelisted(false);
        }
        if (buyerExtInfo?.data) {
          setBuyerExt(decodeBuyerStateExtV2(buyerExtInfo.data));
          setIsLegacyWallet(false);
        } else {
          setBuyerExt(null);
          setIsLegacyWallet(Boolean(buyerInfo?.data));
        }
        let nextPriceLamports10k = 0;
        if (vaultInfo?.data) {
          const vaultDecoded = decodeVault(vaultInfo.data);
          nextPriceLamports10k = Number(vaultDecoded.initialPriceLamportsPer10k);
        }
        if (configInfo?.data) {
          const configDecoded = decodeVaultConfigV2(configInfo.data);
          setSellLive(configDecoded.sellLive);
          if (Number(configDecoded.manualPriceLamportsPer10k) > 0) {
            nextPriceLamports10k = Number(
              configDecoded.manualPriceLamportsPer10k
            );
          }
        } else {
          setSellLive(false);
        }
        setPriceLamports10k(nextPriceLamports10k > 0 ? nextPriceLamports10k : null);
        const vAta = ataOf(vault, DMD_MINT);
        const balance = await connection
          .getTokenAccountBalance(vAta)
          .then((r) => Number(r.value.uiAmount ?? 0))
          .catch(() => 0);
        const treLam = await connection.getBalance(TREASURY).catch(() => 0);
        const pricing = await computeDmdPricing({
          lamportsPer10k:
            nextPriceLamports10k > 0 ? nextPriceLamports10k : undefined,
          treasuryLamports: treLam > 0 ? treLam : undefined,
          treasuryWeight: 1.0,
        });
        const appUsd = pricing.usdPerDmdFinal ?? 0;
        const internalValue = bBal > 0 && appUsd > 0 ? bBal * appUsd : 0;
        if (!alive) return;
        setVaultDmd(balance);
        setTreasurySol(treLam / LAMPORTS_PER_SOL);
        setWalletInternalValueUsd(internalValue);
      } catch (e) {
        console.error("Trading pull error:", e);
      }
    }
    void pull();
    const iv = window.setInterval(() => {
      void pull();
    }, 8000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection, connected, wallet.publicKey]);
  async function ensureAtas(
    buyer: PublicKey,
    vault: PublicKey
  ): Promise<TransactionInstruction[]> {
    const vAta = ataOf(vault, DMD_MINT);
    const bAta = ataOf(buyer, DMD_MINT);
    const ixs: TransactionInstruction[] = [];
    const [buyerInfo, vaultInfo] = await Promise.all([
      connection.getAccountInfo(bAta),
      connection.getAccountInfo(vAta),
    ]);
    if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
    if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));
    return ixs;
  }
  async function handleAutoWhitelist() {
    try {
      if (!connected || !wallet.publicKey) {
        alert("Wallet verbinden.");
        return;
      }
      const rawSol = Number(amountSol.replace(",", "."));
      if (!Number.isFinite(rawSol) || rawSol < BUY_MIN_SOL) {
        setError(
          `Auto-Whitelist erfordert mindestens ${BUY_MIN_SOL.toFixed(
            1
          )} SOL Kaufabsicht.`
        );
        return;
      }
      setInfo("Auto-Whitelist…");
      const ix = ixAutoWhitelistSelf(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(`Whitelist gesendet: ${sig}`);
    } catch (e: unknown) {
      setError("Whitelist Fehler: " + normalizeErrorMessage(e));
    }
  }
  async function handleInitBuyerExtV2() {
    try {
      if (!connected || !wallet.publicKey) {
        alert("Wallet verbinden.");
        return;
      }
      setInfo("Initialisiere BuyerStateExtV2…");
      const ix = ixInitializeBuyerStateExtV2(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(
        `V2-Status initialisiert: ${sig}. Bitte danach Claim / Trading erneut nutzen.`
      );
    } catch (e: unknown) {
      setError("V2 Init Fehler: " + normalizeErrorMessage(e));
    }
  }
  async function handleBuy() {
    try {
      if (!connected || !wallet.publicKey) {
        alert("Wallet verbinden.");
        return;
      }
      if (isLegacyWallet) {
        setError(
          "Legacy-Wallet erkannt. Bitte zuerst BuyerStateExtV2 initialisieren."
        );
        return;
      }
      const rawSol = Number(amountSol.replace(",", "."));
      if (
        !Number.isFinite(rawSol) ||
        rawSol < BUY_MIN_SOL ||
        rawSol > BUY_MAX_SOL
      ) {
        setError(`Buy-Bereich: ${BUY_MIN_SOL} bis ${BUY_MAX_SOL} SOL.`);
        return;
      }
      if (!whitelisted) {
        setError("Wallet ist nicht freigeschaltet.");
        return;
      }
      if (policyView.buyCooldownLeft > 0) {
        setError(
          `Buy-Cooldown aktiv: ${fmtCountdown(policyView.buyCooldownLeft)}`
        );
        return;
      }
      setInfo("Buy…");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const ixs = await ensureAtas(buyer, vault);
      const lamports = Math.floor(rawSol * LAMPORTS_PER_SOL);
      const buyIx = ixBuyDmd(ixCoder, buyer, lamports);
      const tx = new Transaction();
      ixs.forEach((ix) => tx.add(ix));
      tx.add(buyIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(`Buy gesendet: ${sig}`);
    } catch (e: unknown) {
      setError("Buy Fehler: " + normalizeErrorMessage(e));
    }
  }
  async function handleClaim() {
    try {
      if (!connected || !wallet.publicKey) {
        alert("Wallet verbinden.");
        return;
      }
      if (!buyerState) {
        setError("Kein BuyerState vorhanden.");
        return;
      }
      if (!buyerExt || isLegacyWallet) {
        setInfo("Legacy-Wallet erkannt. Initialisiere zuerst BuyerStateExtV2…");
        const initIx = ixInitializeBuyerStateExtV2(ixCoder, wallet.publicKey);
        const initTx = new Transaction().add(initIx);
        initTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        initTx.feePayer = wallet.publicKey;
        const initSig = await wallet.sendTransaction(initTx, connection);
        setSuccess(
          `V2-Status initialisiert: ${initSig}. Bitte Claim jetzt erneut drücken.`
        );
        return;
      }
      if (!policyView.claimReady) {
        setError(policyView.claimText || "Claim noch nicht verfügbar.");
        return;
      }
      setInfo("Claim…");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const ixs = await ensureAtas(buyer, vault);
      const ix = ixClaimRewardV2(ixCoder, buyer);
      const tx = new Transaction();
      ixs.forEach((x) => tx.add(x));
      tx.add(ix);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = buyer;
      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(`Claim gesendet: ${sig}`);
    } catch (e: unknown) {
      setError("Claim Fehler: " + normalizeErrorMessage(e));
    }
  }
  async function handleSellClick() {
    try {
      if (!connected || !wallet.publicKey) {
        alert("Wallet verbinden.");
        return;
      }
      if (isLegacyWallet) {
        setError(
          "Legacy-Wallet erkannt. Bitte zuerst BuyerStateExtV2 initialisieren."
        );
        return;
      }
      if (!sellLive) {
        setError("Sell ist on-chain aktuell noch blockiert.");
        return;
      }
      const rawDmd = Number(amountDmd.replace(",", "."));
      if (!Number.isFinite(rawDmd) || rawDmd <= 0) {
        setError("Bitte eine gültige DMD-Menge eingeben.");
        return;
      }
      void ixSwapExactDmdForSol;
      setInfo(
        "Sell ist on-chain freigegeben. Der Public-Investor-Client führt den DMD→SOL-Pfad aktuell bewusst nicht selbst aus, weil die bestehende On-chain-Sell-Route treasury-seitig signergebunden ist. Die App zeigt dir den echten Sell-Status, aber täuscht keinen öffentlichen Sell-Flow vor."
      );
    } catch (e: unknown) {
      setError("Sell Hinweis: " + normalizeErrorMessage(e));
    }
  }
  return (
    <div style={{ marginTop: 20 }}>
      {!connected && (
        <div className="panel" style={{ textAlign: "center", padding: 20 }}>
          <div className="panel-title">Wallet verbinden</div>
          <p className="small muted">
            Verbinde deine Wallet über den Button unten, um DMD sicher zu
            nutzen.
          </p>
        </div>
      )}
      {connected && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">Wallet Overview</div>
            <div className="kv" style={{ alignItems: "flex-start" }}>
              <span>Dein DMD</span>
              <div style={{ textAlign: "right" }}>
                <b style={{ display: "block" }}>{walletDmd.toLocaleString()}</b>
                <span
                  style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.56)",
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  {walletInternalValueUsd > 0
                    ? fmtUsd(walletInternalValueUsd)
                    : "—"}
                </span>
              </div>
            </div>
            <div className="kv">
              <span>DMD Market (DEX)</span>
              <b>{dmdMarketUsd > 0 ? `$${dmdMarketUsd.toFixed(6)}` : "—"}</b>
            </div>
            <div className="kv">
              <span>Wert deiner DMD (DEX)</span>
              <b>
                {dmdMarketUsd > 0 ? fmtUsd(walletDmd * dmdMarketUsd) : "—"}
              </b>
            </div>
            <div className="kv">
              <span>Claim Counter</span>
              <b style={{ color: policyView.claimReady ? "#14f195" : undefined }}>
                {policyView.claimText}
              </b>
            </div>
            <div className="kv">
              <span>Buy Count Today</span>
              <b>{policyView.dailyCountText}</b>
            </div>
            <div className="kv">
              <span>Buy Cooldown</span>
              <b>
                {policyView.buyCooldownLeft > 0
                  ? fmtCountdown(policyView.buyCooldownLeft)
                  : "frei"}
              </b>
            </div>
            <div className="kv">
              <span>Sell Count Window</span>
              <b>{buyerExt ? buyerExt.sellCountWindow : "—"}</b>
            </div>
            <div className="kv">
              <span>Freie Sells im Fenster</span>
              <b>{buyerExt ? policyView.freeSellsLeft : "—"}</b>
            </div>
            <div className="kv">
              <span>Extra Sell Approvals</span>
              <b>{buyerExt ? buyerExt.extraSellApprovals : "—"}</b>
            </div>
            <div className="kv">
              <span>Sell Window Reset</span>
              <b>{buyerExt ? policyView.sellWindowText : "—"}</b>
            </div>
            <div className="kv">
              <span>Treasury (SOL)</span>
              <b>{treasurySol.toFixed(2)}</b>
            </div>
            <div className="kv">
              <span>Vault (DMD)</span>
              <b>{vaultDmd != null ? vaultDmd.toLocaleString() : "—"}</b>
            </div>
            <div className="kv">
              <span>Sell Route</span>
              <b>
                <StatusDot
                  active={sellLive}
                  label={sellLive ? "ON-CHAIN LIVE" : "ON-CHAIN BLOCKED"}
                />
              </b>
            </div>
            {isLegacyWallet && (
              <div
                className="small"
                style={{
                  marginTop: 12,
                  color: "#f5c542",
                  lineHeight: 1.6,
                  fontWeight: 600,
                }}
              >
                Legacy-Wallet erkannt: BuyerState vorhanden, BuyerStateExtV2 fehlt noch.
              </div>
            )}
            <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              Die Anzeige basiert konservativ auf On-chain BuyerState,
              BuyerStateExtV2 und VaultConfigV2. Maßgeblich bleibt die
              Blockchain.
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">Trading Hinweis</div>
            <div className="small" style={{ lineHeight: 1.6 }}>
              <b>
                {sellLive
                  ? "Sell / DMD→SOL ist on-chain freigegeben."
                  : "Sell / DMD→SOL ist on-chain aktuell blockiert."}
              </b>
              <br />
              Die Investor App richtet sich nach dem echten On-chain-Status aus.
              Buy und Claim bleiben der sichere Standardpfad.
            </div>
          </div>
          {!whitelisted && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">Whitelist</div>
              <p className="small muted">Du bist noch nicht freigeschaltet.</p>
              <button className="btn" onClick={handleAutoWhitelist}>
                Auto-Whitelist
              </button>
            </div>
          )}
          {whitelisted && isLegacyWallet && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">V2 Aktivierung</div>
              <p className="small muted" style={{ lineHeight: 1.6 }}>
                Deine Wallet stammt noch aus dem Legacy-Stand. Für den finalen
                V2-Pfad muss einmal BuyerStateExtV2 angelegt werden. Danach
                läuft die App nur noch über die echte gehärtete On-chain-Logik.
              </p>
              <button className="btn" onClick={handleInitBuyerExtV2}>
                V2 STATUS INITIALISIEREN
              </button>
            </div>
          )}
          {whitelisted && !isLegacyWallet && (
            <div className="grid-2">
              <div className="panel">
                <div className="panel-title">SOL → DMD</div>
                <label className="small muted">SOL</label>
                <input
                  className="input"
                  value={amountSol}
                  onChange={(e) => setAmountSol(e.target.value)}
                />
                <label className="small muted" style={{ marginTop: 10 }}>
                  Slippage (%)
                </label>
                <input
                  className="input input--sm"
                  value={slippagePct}
                  onChange={(e) => setSlippagePct(e.target.value)}
                />
                <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
                  Buy Bereich: {BUY_MIN_SOL} bis {BUY_MAX_SOL} SOL.
                  <br />
                  Tageslimit: {BUY_DAILY_LIMIT} Buys. Danach kann ein Cooldown
                  greifen.
                </div>
                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button className="action-btn" onClick={handleBuy}>
                    BUY DMD
                  </button>
                </div>
              </div>
              <div className="panel">
                <div className="panel-title">DMD → SOL</div>
                <label className="small muted">DMD</label>
                <input
                  className="input"
                  value={amountDmd}
                  onChange={(e) => setAmountDmd(e.target.value)}
                />
                <label className="small muted" style={{ marginTop: 10 }}>
                  Slippage (%)
                </label>
                <input
                  className="input input--sm"
                  value={slippagePct}
                  onChange={(e) => setSlippagePct(e.target.value)}
                />
                <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
                  <StatusDot
                    active={sellLive}
                    label={
                      sellLive
                        ? "Sell ist on-chain freigegeben."
                        : "Sell bleibt on-chain aktuell blockiert."
                    }
                  />
                  <br />
                  <span style={{ display: "inline-block", marginTop: 8 }}>
                    Freie Sells im Fenster: {policyView.freeSellsLeft}
                  </span>
                  <br />
                  <span style={{ display: "inline-block", marginTop: 4 }}>
                    Extra-Freigaben: {policyView.extraSellApprovals}
                  </span>
                  <br />
                  <span style={{ display: "inline-block", marginTop: 8 }}>
                    Claim bleibt verfügbar, sobald die Bedingungen erfüllt sind.
                  </span>
                </div>
                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button
                    className="action-btn swap-btn"
                    disabled={!sellLive}
                    title={
                      sellLive ? "Sell verfügbar" : "Sell on-chain noch deaktiviert"
                    }
                    onClick={handleSellClick}
                  >
                    DMD SELL ZU SOL BLOCKED
                  </button>
                  <button
                    className="action-btn"
                    onClick={handleClaim}
                    disabled={!policyView.claimReady}
                    title={!policyView.claimReady ? "Noch nicht verfügbar" : "Claim verfügbar"}
                  >
                    CLAIM
                  </button>
                </div>
              </div>
            </div>
          )}
          <StatusPanel kind={uiKind} message={uiMessage} />
        </>
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
  const backendOn = backendEnabled();
  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        Community Forum
      </div>
      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">Bitte Wallet verbinden (Button unten).</p>
        </div>
      )}
      {connected && !backendOn && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted" style={{ lineHeight: 1.6 }}>
            Das Forum ist ohne Backend absichtlich im Schreibmodus deaktiviert.
            <br />
            Grund: Kein lokaler LocalStorage-Fallback im produktiven
            Investor-Flow.
          </p>
        </div>
      )}
      {connected && backendOn && (
        <ForumView
          walletPk={wallet.publicKey?.toBase58()}
          apiBase={backendBase()}
        />
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
// AIRDROP PAGE (Protocol Owner only)
// =============================================================
function AirdropPage() {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);
  const isOwner =
    connected && wallet.publicKey?.toBase58() === PROTOCOL_OWNER.toBase58();
  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        Protocol Owner – Smart Airdrop Preview
      </div>
      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">Bitte Wallet verbinden (Button unten).</p>
        </div>
      )}
      {connected && !isOwner && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">
            Nur der aktuelle Protocol Owner kann diesen Bereich sehen.
          </p>
        </div>
      )}
      {connected && isOwner && (
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