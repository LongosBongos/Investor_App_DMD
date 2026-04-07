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
import { translations, type Lang } from "./translations";

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
// Types
// -------------------------
type Tab = "Dashboard" | "Trading" | "Forum" | "Leaderboard" | "Airdrop";
type UiKind = "idle" | "info" | "success" | "error";
type ChartPoint = {
  time: string;
  dmdUsd: number;
  dmdAppUsd: number;
  solUsd: number;
};
type TText = (typeof translations)["de"];

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
// Runtime constants
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
// Backend
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
function tr(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}
function normalizeErrorMessage(err: unknown, t: TText): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes("SELL_DISABLED_FRONTEND")) return t.sellDisabledFrontend;
  if (raw.includes("BuyCooldownActive")) return t.buyCooldownActive;
  if (raw.includes("BuyDailyLimitExceeded")) return t.buyDailyLimitExceeded;
  if (raw.includes("LegacyClaimFlowDisabled")) return t.legacyClaimFlowDisabled;
  if (raw.includes("SellTemporarilyDisabled")) return t.sellTemporarilyDisabled;
  if (raw.includes("InvalidTreasury")) return t.invalidTreasury;
  if (raw.includes("InvalidOwner")) return t.invalidOwner;
  if (raw.includes("RewardTooSmall")) return t.rewardTooSmall;
  if (raw.includes("InsufficientVaultRewardLiquidity")) {
    return t.insufficientVaultRewardLiquidity;
  }
  if (raw.includes("InsufficientTreasuryLiquidity")) {
    return t.insufficientTreasuryLiquidity;
  }
  if (raw.includes("ExtraSellApprovalRequired")) {
    return t.extraSellApprovalRequired;
  }

  return raw;
}

// -------------------------
// Manual decoders
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
  const glow =
    active == null
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
  t,
}: {
  kind: UiKind;
  message: string;
  t: TText;
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
          ? t.errorLabel
          : kind === "success"
          ? t.statusOkLabel
          : t.hintLabel}
      </div>
      <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
        {message}
      </div>
    </div>
  );
}

function LanguageToggle({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 10,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <button
          className="btn"
          onClick={() => setLang("de")}
          style={{
            borderRadius: 0,
            border: "none",
            background: lang === "de" ? "rgba(245,197,66,0.14)" : "transparent",
            color: lang === "de" ? "var(--gold)" : "white",
            boxShadow: "none",
          }}
        >
          DE
        </button>
        <button
          className="btn"
          onClick={() => setLang("en")}
          style={{
            borderRadius: 0,
            border: "none",
            background: lang === "en" ? "rgba(245,197,66,0.14)" : "transparent",
            color: lang === "en" ? "var(--gold)" : "white",
            boxShadow: "none",
          }}
        >
          EN
        </button>
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
  t: TText;
}) {
  const items: Tab[] = props.showAirdrop
    ? ["Dashboard", "Trading", "Forum", "Leaderboard", "Airdrop"]
    : ["Dashboard", "Trading", "Forum", "Leaderboard"];

  const labelMap: Record<Tab, string> = {
    Dashboard: props.t.dashboard,
    Trading: props.t.trading,
    Forum: props.t.forum,
    Leaderboard: props.t.leaderboard,
    Airdrop: props.t.airdrop,
  };

  return (
    <nav
      className="tab-nav"
      style={{
        display: "flex",
        gap: 20,
        justifyContent: "center",
        marginTop: 20,
        marginBottom: 30,
        flexWrap: "wrap",
      }}
    >
      {items.map((tab) => (
        <button
          key={tab}
          onClick={() => props.setActive(tab)}
          className={props.active === tab ? "active" : ""}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background:
              props.active === tab ? "rgba(245,197,66,0.12)" : "transparent",
            color: props.active === tab ? "var(--gold)" : "white",
            fontWeight: 600,
          }}
        >
          {labelMap[tab]}
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
  const [lang, setLang] = useState<Lang>("de");
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);
  const isOwner =
    connected && wallet.publicKey?.toBase58() === PROTOCOL_OWNER.toBase58();

  useEffect(() => {
    const saved = localStorage.getItem("dmd_lang");
    if (saved === "de" || saved === "en") {
      setLang(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dmd_lang", lang);
  }, [lang]);

  useEffect(() => {
    if (page === "Airdrop" && !isOwner) {
      setPage("Dashboard");
    }
  }, [page, isOwner]);

  const t = translations[lang];

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

      <LanguageToggle lang={lang} setLang={setLang} />
      <NavBar active={page} setActive={setPage} showAirdrop={isOwner} t={t} />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {page === "Dashboard" && <DashboardPage t={t} />}
        {page === "Trading" && <TradingPage t={t} />}
        {page === "Forum" && <ForumPage t={t} />}
        {page === "Leaderboard" && <LeaderboardPage t={t} />}
        {page === "Airdrop" && isOwner && <AirdropPage t={t} />}
      </div>
    </>
  );
}

// =============================================================
// DASHBOARD PAGE
// =============================================================
function DashboardPage({ t }: { t: TText }) {
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
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.vaultOwnerMatch}</div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: vaultOwnerMatch ? "#7CFFB2" : "#ff4d4f",
              marginTop: 8,
            }}
          >
            {vaultOwnerMatch == null ? t.unavailable : vaultOwnerMatch ? t.yes : t.no}
          </div>
        </div>

        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.treasuryMatch}</div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: treasuryMatch ? "#7CFFB2" : "#ff4d4f",
              marginTop: 8,
            }}
          >
            {treasuryMatch == null ? t.unavailable : treasuryMatch ? t.yes : t.no}
          </div>
        </div>

        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.sellStatus}</div>
          <div style={{ marginTop: 8 }}>
            <StatusDot
              active={sellLive}
              label={
                sellLive == null ? t.unknown : sellLive ? t.live : t.blocked
              }
            />
          </div>
        </div>

        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.pricingMode}</div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#f5c542",
              marginTop: 8,
            }}
          >
            {dynamicPricingEnabled == null
              ? t.unavailable
              : dynamicPricingEnabled
              ? t.dynamic
              : t.manual}
          </div>
        </div>

        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.program}</div>
          <div className="card-value" style={{ fontSize: 14, marginTop: 8 }}>
            {shortPk(PROGRAM_ID)}
          </div>
        </div>

        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.mint}</div>
          <div className="card-value" style={{ fontSize: 14, marginTop: 8 }}>
            {shortPk(DMD_MINT)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }} className="grid-3">
        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.dmdPriceDex}</div>
          <div className="card-value">{dmdUsd ? dmdUsd.toFixed(6) : t.unavailable}</div>
        </div>
        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.dmdAppValue}</div>
          <div className="card-value">
            {dmdAppUsd ? dmdAppUsd.toFixed(6) : t.unavailable}
          </div>
        </div>
        <div className="card panel" style={{ textAlign: "center", padding: "20px" }}>
          <div className="card-title">{t.solPriceUsd}</div>
          <div className="card-value">{solUsd ? solUsd.toFixed(2) : t.unavailable}</div>
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
        <TxFeed title={t.publicFeed} rows={pubFeed} />
        <TxFeed title={t.treasuryFeed} rows={treFeed} />
        {isOwner ? (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-title">{t.protocolNotice}</div>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              {t.founderOwnerFeedsHidden}
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-title">{t.status}</div>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              {t.onchainSourceNotice}
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
function TradingPage({ t }: { t: TText }) {
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
  const [walletInternalValueUsd, setWalletInternalValueUsd] = useState<number>(0);
  const [nowTs, setNowTs] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  function getBuyCountColor(count: number): string {
    if (count === 0) return "#14f195";
    if (count <= 4) return "#f5c542";
    if (count <= 9) return "#6aa9ff";
    return "#ff4d4f";
  }

  async function refreshBuyerState() {
    if (!connected || !wallet.publicKey) return;
    try {
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const bsExt = findBuyerStateExtV2Pda(vault, buyer);

      const [buyerInfo, buyerExtInfo] = await Promise.all([
        connection.getAccountInfo(bs),
        connection.getAccountInfo(bsExt),
      ]);

      if (buyerInfo?.data) {
        const decoded = decodeBuyerState(buyerInfo.data);
        setBuyerState(decoded);
        setWhitelisted(decoded.whitelisted);
        console.log(
          "[onchain-sync] Buy Count Today aktualisiert:",
          decoded.buyCountToday.toString()
        );
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
    } catch (e) {
      console.error("Refresh BuyerState failed", e);
    }
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
      claimText: t.unavailable,
      dailyCountText: t.unavailable,
      sellCountWindow: 0,
      freeSellsLeft: FREE_SELLS_PER_WINDOW,
      extraSellApprovals: 0,
      sellWindowTimeLeft: 0,
      sellWindowText: t.unavailable,
    };

    if (!buyerState) return result;

    const holdSince = Number(buyerState.holdingSince);
    const lastClaim = Number(buyerState.lastRewardClaim);
    const lastBuyTs = Number(buyerState.lastBuyDay);
    const rawBuyCountToday = Number(buyerState.buyCountToday);

    const todayUtc = currentDayIndex(nowTs);
    const lastBuyUtc = lastBuyTs > 0 ? currentDayIndex(lastBuyTs) : -1;

    result.buyCountToday =
      lastBuyTs > 0 && lastBuyUtc === todayUtc ? rawBuyCountToday : 0;

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
            : t.sellWindowResetPending;
      }
    }

    result.holdReadyAt = holdSince > 0 ? holdSince + HOLD_DURATION_SEC : 0;
    result.intervalReadyAt = lastClaim > 0 ? lastClaim + CLAIM_INTERVAL_SEC : 0;

    const firstClaimDone = Boolean(buyerExt?.firstClaimDone);
    let readyAt = 0;

    if (!firstClaimDone) {
      readyAt = result.holdReadyAt;
    } else {
      readyAt =
        result.intervalReadyAt > 0
          ? result.intervalReadyAt
          : result.holdReadyAt;
    }

    if (readyAt > 0) {
      const left = readyAt - nowTs;
      result.claimReady = left <= 0;
      result.claimText = result.claimReady
        ? t.claimAvailableNow
        : tr(t.claimAvailableIn, { time: fmtCountdown(left) });
    } else {
      result.claimReady = false;
      result.claimText = t.unavailable;
    }

    return result;
  }, [buyerState, buyerExt, nowTs, t]);

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

        setPriceLamports10k(
          nextPriceLamports10k > 0 ? nextPriceLamports10k : null
        );

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
  }, [connection, connected, wallet.publicKey, refreshTrigger]);

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
        alert(t.walletConnectAlert);
        return;
      }

      const rawSol = Number(amountSol.replace(",", "."));
      if (!Number.isFinite(rawSol) || rawSol < BUY_MIN_SOL) {
        setError(
          tr(t.autoWhitelistRequiresMinBuy, {
            min: BUY_MIN_SOL.toFixed(1),
          })
        );
        return;
      }

      setInfo(t.autoWhitelistInProgress);
      const ix = ixAutoWhitelistSelf(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(`${t.whitelistSent} ${sig}`);
      setRefreshTrigger((x) => x + 1);
      void refreshBuyerState();
    } catch (e: unknown) {
      setError(t.whitelistErrorPrefix + normalizeErrorMessage(e, t));
    }
  }

  async function handleInitBuyerExtV2() {
    try {
      if (!connected || !wallet.publicKey) {
        alert(t.walletConnectAlert);
        return;
      }

      setInfo(t.v2InitInProgress);
      const ix = ixInitializeBuyerStateExtV2(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection);
      setSuccess(`${t.v2StatusInitialized} ${sig}. ${t.v2StatusInitializedSuffix}`);
      setRefreshTrigger((x) => x + 1);
      void refreshBuyerState();
    } catch (e: unknown) {
      setError(t.v2InitErrorPrefix + normalizeErrorMessage(e, t));
    }
  }

  async function handleBuy() {
    try {
      if (!connected || !wallet.publicKey) {
        alert(t.walletConnectAlert);
        return;
      }

      if (isLegacyWallet) {
        setError(t.legacyWalletInitFirst);
        return;
      }

      const rawSol = Number(amountSol.replace(",", "."));
      if (
        !Number.isFinite(rawSol) ||
        rawSol < BUY_MIN_SOL ||
        rawSol > BUY_MAX_SOL
      ) {
        setError(
          tr(t.buyRangeError, {
            min: BUY_MIN_SOL,
            max: BUY_MAX_SOL,
          })
        );
        return;
      }

      if (!whitelisted) {
        setError(t.walletNotApproved);
        return;
      }

      if (policyView.buyCooldownLeft > 0) {
        setError(`${t.buyCooldownActive} ${fmtCountdown(policyView.buyCooldownLeft)}`);
        return;
      }

      setInfo(t.buyInProgress);
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
      setSuccess(`${t.buySent} ${sig}`);
      setRefreshTrigger((x) => x + 1);
      void refreshBuyerState();
    } catch (e: unknown) {
      setError(t.buyErrorPrefix + normalizeErrorMessage(e, t));
    }
  }

  async function handleClaim() {
    try {
      if (!connected || !wallet.publicKey) {
        alert(t.walletConnectAlert);
        return;
      }

      if (!buyerState) {
        setError(t.noBuyerState);
        return;
      }

      if (!buyerExt || isLegacyWallet) {
        setInfo(t.legacyWalletClaimInitFirst);
        const initIx = ixInitializeBuyerStateExtV2(ixCoder, wallet.publicKey);
        const initTx = new Transaction().add(initIx);
        initTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        initTx.feePayer = wallet.publicKey;
        const initSig = await wallet.sendTransaction(initTx, connection);
        setSuccess(
          `${t.v2StatusInitialized} ${initSig}. ${t.v2StatusInitializedClaimRetry}`
        );
        setRefreshTrigger((x) => x + 1);
        void refreshBuyerState();
        return;
      }

      if (!policyView.claimReady) {
        setError(t.claimUnavailablePrefix + policyView.claimText);
        return;
      }

      setInfo(t.claimInProgress);
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
      setSuccess(`${t.claimSent} ${sig}`);
      setRefreshTrigger((x) => x + 1);
      void refreshBuyerState();
    } catch (e: unknown) {
      setError(t.claimErrorPrefix + normalizeErrorMessage(e, t));
    }
  }

  async function handleSellClick() {
    try {
      if (!connected || !wallet.publicKey) {
        alert(t.walletConnectAlert);
        return;
      }

      if (isLegacyWallet) {
        setError(t.legacyWalletInitFirst);
        return;
      }

      if (!sellLive) {
        setError(t.sellFoundationPhaseBlocked);
        return;
      }

      const rawDmd = Number(amountDmd.replace(",", "."));
      if (!Number.isFinite(rawDmd) || rawDmd <= 0) {
        setError(t.invalidDmdAmount);
        return;
      }

      void ixSwapExactDmdForSol;
      void slippageToBps(slippagePct);

      setInfo(t.sellPublicClientNotice);
    } catch (e: unknown) {
      setError(t.sellHintPrefix + normalizeErrorMessage(e, t));
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      {!connected && (
        <div className="panel" style={{ textAlign: "center", padding: 20 }}>
          <div className="panel-title">{t.walletConnect}</div>
          <p className="small muted">{t.walletConnectHint}</p>
        </div>
      )}

      {connected && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">{t.walletOverview}</div>

            <div className="kv" style={{ alignItems: "flex-start" }}>
              <span>{t.yourDmd}</span>
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
                    : t.unavailable}
                </span>
              </div>
            </div>

            <div className="kv">
              <span>{t.dmdMarketDex}</span>
              <b>{dmdMarketUsd > 0 ? `$${dmdMarketUsd.toFixed(6)}` : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.yourDmdDexValue}</span>
              <b>
                {dmdMarketUsd > 0 ? fmtUsd(walletDmd * dmdMarketUsd) : t.unavailable}
              </b>
            </div>

            <div className="kv">
              <span>{t.claimCounter}</span>
              <b style={{ color: policyView.claimReady ? "#14f195" : undefined }}>
                {policyView.claimText}
              </b>
            </div>

            <div className="kv">
              <span>{t.buyCountToday}</span>
              <b style={{ color: getBuyCountColor(policyView.buyCountToday) }}>
                {policyView.dailyCountText}
              </b>
            </div>

            <div className="kv">
              <span>{t.buyCooldown}</span>
              <b>
                {policyView.buyCooldownLeft > 0
                  ? fmtCountdown(policyView.buyCooldownLeft)
                  : t.free}
              </b>
            </div>

            <div className="kv">
              <span>{t.sellCountWindow}</span>
              <b>{buyerExt ? buyerExt.sellCountWindow : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.freeSellsInWindow}</span>
              <b>{buyerExt ? policyView.freeSellsLeft : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.extraSellApprovals}</span>
              <b>{buyerExt ? buyerExt.extraSellApprovals : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.sellWindowReset}</span>
              <b>{buyerExt ? policyView.sellWindowText : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.treasurySol}</span>
              <b>{treasurySol.toFixed(2)}</b>
            </div>

            <div className="kv">
              <span>{t.vaultDmd}</span>
              <b>{vaultDmd != null ? vaultDmd.toLocaleString() : t.unavailable}</b>
            </div>

            <div className="kv">
              <span>{t.sellRoute}</span>
              <b>
                <StatusDot
                  active={sellLive}
                  label={sellLive ? t.onchainLive : t.onchainBlocked}
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
                {t.legacyWalletDetected}
              </div>
            )}

            <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              {t.conservativeDisplayNotice}
            </div>

            <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
              <span style={{ color: "#14f195" }}>● {t.buyCountLegendZero}</span> •
              <span style={{ color: "#f5c542" }}>● {t.buyCountLegendLow}</span> •
              <span style={{ color: "#6aa9ff" }}>● {t.buyCountLegendMid}</span> •
              <span style={{ color: "#ff4d4f" }}>● {t.buyCountLegendLimit}</span>
              <br />
              {t.resetUtc}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">{t.tradingNotice}</div>
            <div className="small" style={{ lineHeight: 1.6 }}>
              <b>{sellLive ? t.sellOnchainLive : t.sellOnchainBlocked}</b>
              <br />
              {t.investorClientNotice}
            </div>
          </div>

          {!whitelisted && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">{t.whitelist}</div>
              <p className="small muted">{t.notApprovedYet}</p>
              <button className="btn" onClick={handleAutoWhitelist}>
                {t.autoWhitelist}
              </button>
            </div>
          )}

          {whitelisted && isLegacyWallet && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-title">{t.v2Activation}</div>
              <p className="small muted" style={{ lineHeight: 1.6 }}>
                {t.legacyWalletNotice}
              </p>
              <button className="btn" onClick={handleInitBuyerExtV2}>
                {t.initV2Status}
              </button>
            </div>
          )}

          {whitelisted && !isLegacyWallet && (
            <div className="grid-2">
              <div className="panel">
                <div className="panel-title">{t.solToDmd}</div>

                <label className="small muted">SOL</label>
                <input
                  className="input"
                  value={amountSol}
                  onChange={(e) => setAmountSol(e.target.value)}
                />

                <label className="small muted" style={{ marginTop: 10 }}>
                  {t.slippagePct}
                </label>
                <input
                  className="input input--sm"
                  value={slippagePct}
                  onChange={(e) => setSlippagePct(e.target.value)}
                />

                <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
                  {t.buyRange}: {BUY_MIN_SOL} bis {BUY_MAX_SOL} SOL.
                  <br />
                  {t.dailyLimit}: {BUY_DAILY_LIMIT} {t.buys}. {t.cooldownMayApply}
                </div>

                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button className="action-btn" onClick={handleBuy}>
                    {t.buyDmd}
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">{t.dmdToSol}</div>

                <label className="small muted">DMD</label>
                <input
                  className="input"
                  value={amountDmd}
                  onChange={(e) => setAmountDmd(e.target.value)}
                />

                <label className="small muted" style={{ marginTop: 10 }}>
                  {t.slippagePct}
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
                        ? t.sellOnchainEnabled
                        : t.sellOnchainStillBlocked
                    }
                  />
                  <br />
                  <span style={{ display: "inline-block", marginTop: 8 }}>
                    {t.freeSellsInWindow}: {policyView.freeSellsLeft}
                  </span>
                  <br />
                  <span style={{ display: "inline-block", marginTop: 4 }}>
                    {t.extraSellApprovals}: {policyView.extraSellApprovals}
                  </span>
                  <br />
                  <span style={{ display: "inline-block", marginTop: 8 }}>
                    {t.claimRemainsAvailable}
                  </span>
                </div>

                <div className="btn-grid" style={{ marginTop: 15 }}>
                  <button
                    className="action-btn swap-btn"
                    disabled={!sellLive}
                    title={sellLive ? t.sellAvailableTitle : t.sellDisabledTitle}
                    onClick={handleSellClick}
                  >
                    {sellLive ? t.sellStatusLive : t.sellCurrentlyBlocked}
                  </button>

                  <button
                    className="action-btn"
                    onClick={handleClaim}
                    disabled={!policyView.claimReady}
                    title={
                      !policyView.claimReady
                        ? t.claimNotAvailableTitle
                        : t.claimAvailableTitle
                    }
                  >
                    {t.claim}
                  </button>
                </div>
              </div>
            </div>
          )}

          <StatusPanel kind={uiKind} message={uiMessage} t={t} />
        </>
      )}
    </div>
  );
}

// =============================================================
// FORUM PAGE
// =============================================================
function ForumPage({ t }: { t: TText }) {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);
  const backendOn = backendEnabled();

  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        {t.communityForum}
      </div>

      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">{t.walletConnect}</p>
        </div>
      )}

      {connected && !backendOn && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted" style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {t.forumBackendDisabled}
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
function LeaderboardPage({ t }: { t: TText }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        {t.topDmdHolder}
      </div>
      <Leaderboard />
    </div>
  );
}

// =============================================================
// AIRDROP PAGE
// =============================================================
function AirdropPage({ t }: { t: TText }) {
  const wallet = useWallet();
  const connected = Boolean(wallet.publicKey);
  const isOwner =
    connected && wallet.publicKey?.toBase58() === PROTOCOL_OWNER.toBase58();

  return (
    <div style={{ marginTop: 20 }}>
      <div className="panel-title" style={{ color: "var(--gold)", marginBottom: 20 }}>
        {t.protocolOwnerAirdrop}
      </div>

      {!connected && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">{t.walletConnect}</p>
        </div>
      )}

      {connected && !isOwner && (
        <div className="panel" style={{ padding: 20 }}>
          <p className="small muted">{t.ownerOnlyArea}</p>
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