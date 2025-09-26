// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Connection,
  LAMPORTS_PER_SOL,
  Commitment,
} from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  LedgerWalletAdapter,
  TorusWalletAdapter,
  WalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import idl from "./idl/dmd_anchor.json";
import { fetchSolUsd } from "./price"; // << Preisfeed aus ausgelagerter Datei

// Buffer-Polyfill
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) (window as any).Buffer = Buffer;

// ===== Konfig / Konstanten =====
const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID ?? "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro");
const RPC_URL    = import.meta.env.VITE_RPC_URL ?? "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";
const DMD_MINT   = new PublicKey(import.meta.env.VITE_DMD_MINT ?? "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5");
const TREASURY   = new PublicKey(import.meta.env.VITE_TREASURY ?? "CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV");
const FOUNDER    = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Regeln/Timings
const HOLD_DURATION = 60 * 60 * 24 * 30;   // 30 Tage
const REWARD_INTERVAL = 60 * 60 * 24 * 90; // 90 Tage

// ===== PDA/ATA Helpers =====
const u8 = anchor.utils.bytes.utf8;
const findVaultPda = (): PublicKey => PublicKey.findProgramAddressSync([u8.encode("vault")], PROGRAM_ID)[0];
const findBuyerStatePda = (vault: PublicKey, buyer: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([u8.encode("buyer"), vault.toBuffer(), buyer.toBuffer()], PROGRAM_ID)[0];
const ataOf = (owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];

function createAtaIx(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

// ===== Anchor Coder =====
const ixCoder: any = new (anchor as any).BorshInstructionCoder(idl as anchor.Idl);
const accCoder: any = new (anchor as any).BorshAccountsCoder(idl as anchor.Idl);
function ixFromCoder(
  name: string,
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  args: Record<string, any> = {}
) {
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: ixCoder.encode(name, args) });
}

// ======= UI =======
function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed" as Commitment));
  const SEND_OPTS: any = { skipPreflight: true };
  const connected = !!wallet.publicKey;

  // State
  const [status, setStatus] = useState<string>("");
  const [treasurySol, setTreasurySol] = useState<number | null>(null);
  const [solUsd, setSolUsd] = useState<number>(0);
  const [solUpdatedAt, setSolUpdatedAt] = useState<number | null>(null);
  const [priceLamports10k, setPriceLamports10k] = useState<number | null>(null);
  const [vaultDmd, setVaultDmd] = useState<number | null>(null);
  const [buyerState, setBuyerState] = useState<any>(null);
  const [whitelisted, setWhitelisted] = useState<boolean>(false);

  // 🔥 NEU: Decimals vom Vault
  const [mintDecimals, setMintDecimals] = useState<number>(9);

  // Inputs
  const [amountSol, setAmountSol] = useState("1.0");     // Buy & SOL->DMD
  const [amountDmd, setAmountDmd] = useState("10000");   // DMD->SOL
  const [slippagePct, setSlippagePct] = useState("1.0"); // 1% Standard

  // ===== Auto-Price Controls (Founder) =====
  const [autoSync, setAutoSync] = useState(false);
  const [deviationPct, setDeviationPct] = useState("1.0"); // 1% Abweichungs-Schwelle

  // $0.01/DMD -> Lamports/10k (10.000 DMD * $0.01 = $100)
  function lamportsPer10kFromSpot(solUsdNow: number): number | null {
    if (!solUsdNow || solUsdNow <= 0) return null;
    const solFor100Usd = 100 / solUsdNow;
    return Math.floor(solFor100Usd * LAMPORTS_PER_SOL);
  }

  // IX: set_manual_price (Founder only)
  async function handleSetManualPrice(lamportsPer10k: number) {
    if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
    if (!wallet.publicKey.equals(FOUNDER)) return setStatus("❌ Nur Founder dürfen den Manual-Preis setzen.");
    try {
      setStatus("Setze Manual-Preis …");
      const vault = findVaultPda();
      const keys = [
        { pubkey: vault,   isSigner: false, isWritable: true },
        { pubkey: FOUNDER, isSigner: true,  isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const ix = ixFromCoder("set_manual_price", keys, { lamports_per_10k: new anchor.BN(lamportsPer10k) });
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      setStatus(`✅ Manual-Preis gesetzt: ${sig}`);
      setPriceLamports10k(lamportsPer10k);
    } catch (e: any) {
      setStatus(`❌ Set Manual Price fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  // Laden: Vault/Treasury/Preis
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = findVaultPda();
        const vAta = ataOf(v);
        const [ai, trezLamports, px, dmdBal] = await Promise.all([
          connection.getAccountInfo(v),
          connection.getBalance(TREASURY),
          fetchSolUsd(),
          connection.getTokenAccountBalance(vAta).then(r => r?.value?.uiAmount ?? 0).catch(() => 0),
        ]);
        if (!alive) return;
        setTreasurySol(trezLamports / LAMPORTS_PER_SOL);
        setSolUsd(px);
        setSolUpdatedAt(Date.now());
        setVaultDmd(dmdBal);
        if (ai?.data) {
          const vault = accCoder.decode("Vault", ai.data);
          setPriceLamports10k(Number((vault as any).initial_price_sol ?? 0));
          // 🔥 NEU: Decimals aus dem Vault nutzen
          setMintDecimals(Number((vault as any).mint_decimals ?? 9));
        }
      } catch (e) { console.error(e); }
    })();
    const iv = setInterval(() => {
      connection.getBalance(TREASURY).then(l => setTreasurySol(l / LAMPORTS_PER_SOL)).catch(() => {});
      fetchSolUsd().then((v)=>{ setSolUsd(v); setSolUpdatedAt(Date.now()); }).catch(()=>{});
    }, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [connection]);

  // Laden: BuyerState/Whitelist
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!connected || !wallet.publicKey) { setBuyerState(null); setWhitelisted(false); return; }
      try {
        const v = findVaultPda();
        const bs = findBuyerStatePda(v, wallet.publicKey);
        const ai = await connection.getAccountInfo(bs);
        if (!alive) return;
        if (!ai) { setBuyerState(null); setWhitelisted(false); return; }
        const decoded = accCoder.decode("BuyerState", ai.data);
        setBuyerState(decoded);
        setWhitelisted(!!(decoded as any).whitelisted);
      } catch { setBuyerState(null); setWhitelisted(false); }
    })();
    const iv = setInterval(async () => {
      if (!connected || !wallet.publicKey) return;
      const v = findVaultPda();
      const bs = findBuyerStatePda(v, wallet.publicKey);
      const ai = await connection.getAccountInfo(bs).catch(() => null);
      if (ai) {
        const decoded = accCoder.decode("BuyerState", ai.data);
        setBuyerState(decoded);
        setWhitelisted(!!(decoded as any).whitelisted);
      }
    }, 20_000);
    return () => { alive = false; clearInterval(iv); };
  }, [connected, connection, wallet.publicKey]);

  // Auto-Sync-Effekt: checkt alle 60s, ob Abweichung > X% und setzt dann neu (nur Founder)
  useEffect(() => {
    if (!autoSync || !wallet.publicKey || !wallet.publicKey.equals(FOUNDER)) return;
    let alive = true;
    const iv = setInterval(async () => {
      try {
        const spot = await fetchSolUsd();
        const target = lamportsPer10kFromSpot(spot);
        if (!alive || target == null || priceLamports10k == null) return;
        const dev = Math.abs((target - priceLamports10k) / priceLamports10k) * 100;
        if (dev > Number(deviationPct || "1")) {
          await handleSetManualPrice(target);
        }
      } catch {}
    }, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [autoSync, wallet.publicKey, priceLamports10k, deviationPct]);

  // Abgeleitete Preise
  const priceSol10k = priceLamports10k != null ? priceLamports10k / LAMPORTS_PER_SOL : null;
  const priceSol1Dmd = priceSol10k != null ? priceSol10k / 10_000 : null;
  const priceUsd1Dmd = (priceSol1Dmd != null && solUsd > 0) ? priceSol1Dmd * solUsd : null;
  const treasuryUsd = (treasurySol != null && solUsd > 0) ? treasurySol * solUsd : null;
  const presaleUsdManual = (vaultDmd != null && priceUsd1Dmd != null) ? vaultDmd * priceUsd1Dmd : null;

  // Helpers
  async function ensureAtas(payer: PublicKey, buyer: PublicKey, vault: PublicKey) {
    const ixs: TransactionInstruction[] = [];
    const buyerAta = ataOf(buyer);
    const vaultAta = ataOf(vault);
    const [buyerInfo, vaultInfo] = await Promise.all([
      connection.getAccountInfo(buyerAta),
      connection.getAccountInfo(vaultAta),
    ]);
    if (!buyerInfo) ixs.push(createAtaIx(payer, buyerAta, buyer, DMD_MINT));
    if (!vaultInfo) ixs.push(createAtaIx(payer, vaultAta, vault, DMD_MINT));
    return { ixs, buyerAta, vaultAta };
  }
  const short = (pk: PublicKey) => { const s = pk.toBase58(); return `${s.slice(0,4)}…${s.slice(-4)}`; };
  const fmtUSD = (x: number | null) => x == null ? "…" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(x);
  const fmtTime = (t: number | null) => t == null ? "—" : new Date(t).toLocaleTimeString('de-DE', { hour12: false });
  const slippageFactor = Math.max(0, 1 - (Number(slippagePct || "0") / 100));

  // ---- Number formatting helpers for Pricing card
  const fmtNum = (x: number | null, min = 0, max = 9) =>
    x == null ? "…" : new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }).format(x);
  const fmtFix = (x: number | null, digits = 6) =>
    x == null ? "…" : (typeof x === "number" ? x : Number(x)).toFixed(digits);

  // ===== Aktionen (IDL-konform) =====
  async function handleAutoWhitelist() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      setStatus("Whitelist wird geprüft…");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);
      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const wlIx = ixFromCoder("auto_whitelist_self", keys, {});
      const tx = new Transaction().add(wlIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Auto-Whitelist gesendet: ${sig}`);
    } catch (e: any) { setStatus(`❌ Auto-Whitelist fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleBuy() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Kauf vor…");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);
      const { ixs: ataIxs, buyerAta, vaultAta } = await ensureAtas(buyer, buyer, vault);
      const lamports = new anchor.BN(Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL));
      if (lamports.lte(new anchor.BN(0))) return alert("Ungültiger SOL-Betrag.");
      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: FOUNDER, isSigner: false, isWritable: true },
        { pubkey: TREASURY, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: buyerAta, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const buyIx = ixFromCoder("buy_dmd", keys, { sol_contribution: lamports });
      const tx = new Transaction(); ataIxs.forEach(ix => tx.add(ix)); tx.add(buyIx);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Buy gesendet: ${sig}`);
    } catch (e: any) { setStatus(`❌ Buy fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleClaim() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      if (!buyerState) return setStatus("❌ Kein BuyerState – zuerst via Buy erwerben.");
      const now = Math.floor(Date.now() / 1000);
      if (now - Number((buyerState as any).holding_since ?? 0) < HOLD_DURATION) return setStatus("❌ Hold zu kurz (30 Tage).");
      if (Number((buyerState as any).last_reward_claim ?? 0) && now - Number((buyerState as any).last_reward_claim) < REWARD_INTERVAL)
        return setStatus("❌ Claim zu früh (90 Tage).");
      setStatus("Sende Claim …");
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const vAta = ataOf(vault);
      const bAta = ataOf(buyer);
      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: bs, isSigner: false, isWritable: true },
        { pubkey: vAta, isSigner: false, isWritable: true },
        { pubkey: bAta, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
      const ix = ixFromCoder("claim_reward_v2", keys, {});
      const tx = new Transaction().add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Claim gesendet: ${sig}`);
    } catch (e: any) { setStatus(`❌ Claim fehlgeschlagen: ${e?.message ?? e}`); }
  }

  // 🔧 FIXED: SOL → DMD mit korrekter Decimals-Skalierung
  async function handleSwapSolForDmd() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const vAta = ataOf(vault);
      const bAta = ataOf(buyer);
      const { ixs: ataIxs } = await ensureAtas(buyer, buyer, vault);

      const lamportsIn = new anchor.BN(Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL));
      if (lamportsIn.lte(new anchor.BN(0))) return setStatus("❌ Ungültiger SOL-Betrag.");
      if (priceLamports10k == null) return setStatus("❌ Manual-Preis unbekannt.");

      // Erwartete DMD (UI-Einheiten)
      const dmdOutUi = (Number(lamportsIn.toString()) * 10_000) / Number(priceLamports10k);

      // In base units skalieren
      const scale = 10 ** mintDecimals;
      const dmdOutRaw = Math.floor(dmdOutUi * scale);
      const minOutRaw = Math.floor(dmdOutRaw * Math.max(0, 1 - (Number(slippagePct || "0") / 100)));

      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: bs, isSigner: false, isWritable: true },
        { pubkey: vAta, isSigner: false, isWritable: true },
        { pubkey: bAta, isSigner: false, isWritable: true },
        { pubkey: FOUNDER, isSigner: false, isWritable: true },
        { pubkey: TREASURY, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const ix = ixFromCoder("swap_exact_sol_for_dmd", keys, {
        amount_in_lamports: lamportsIn,
        min_out_dmd: new anchor.BN(minOutRaw),
      });

      const tx = new Transaction(); ataIxs.forEach(ix0 => tx.add(ix0)); tx.add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap SOL→DMD gesendet: ${sig}`);
    } catch (e: any) { setStatus(`❌ Swap SOL→DMD fehlgeschlagen: ${e?.message ?? e}`); }
  }

  // 🔧 FIXED: DMD → SOL mit korrekter Decimals-Skalierung
  async function handleSwapDmdForSol() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const vAta = ataOf(vault);
      const bAta = ataOf(buyer);
      const { ixs: ataIxs } = await ensureAtas(buyer, buyer, vault);

      // Eingabe (UI DMD) → base units
      const scale = 10 ** mintDecimals;
      const amountInDmdRaw = Math.floor(parseFloat(amountDmd) * scale);
      const amountIn = new anchor.BN(amountInDmdRaw);
      if (amountIn.lte(new anchor.BN(0))) return setStatus("❌ Ungültiger DMD-Betrag.");
      if (priceLamports10k == null) return setStatus("❌ Manual-Preis unbekannt.");

      // Erwartete SOL-Out (Lamports); Preis ist lamports / 10k DMD
      const lamportsOutFloat = (amountInDmdRaw / scale) * (Number(priceLamports10k) / 10_000);
      const minOutLamports = Math.floor(lamportsOutFloat * Math.max(0, 1 - (Number(slippagePct || "0") / 100)));

      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: bs, isSigner: false, isWritable: true },
        { pubkey: vAta, isSigner: false, isWritable: true },
        { pubkey: bAta, isSigner: false, isWritable: true },
        { pubkey: TREASURY, isSigner: false, isWritable: true },
        { pubkey: FOUNDER, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const ix = ixFromCoder("swap_exact_dmd_for_sol", keys, {
        amount_in_dmd: amountIn,
        min_out_sol: new anchor.BN(minOutLamports),
      });

      const tx = new Transaction(); ataIxs.forEach(ix0 => tx.add(ix0)); tx.add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap DMD→SOL gesendet: ${sig}`);
    } catch (e: any) { setStatus(`❌ Swap DMD→SOL fehlgeschlagen: ${e?.message ?? e}`); }
  }

  const ENABLE_SELL_BUTTON = true; // sichtbar, aber noch ohne Treasury-Flow

  return (
    <>
      {/* Wallet Button oben rechts */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <WalletMultiButton />
      </div>

      <main>
        {/* Panels */}
        <div className="btn-grid" style={{ marginBottom: 24 }}>
          {/* ==== DMD Pricing (inkl. Target $0.01 + Founder Sync) ==== */}
          <div className="panel">
            <div className="panel-title" style={{ color: "var(--gold)" }}>DMD Pricing</div>

            {/* Klar: Target-Preis */}
            <div className="kv">
              <span>Target</span>
              <b>$0.0100 / DMD</b>
            </div>

            {/* Dynamisch aus SOL-Spot abgeleitet */}
            {(() => {
              const solPerDmdTarget = solUsd > 0 ? (0.01 / solUsd) : null;
              return (
                <>
                  <div className="kv">
                    <span>≈ SOL / DMD</span>
                    <b>{solPerDmdTarget == null ? "…" : new Intl.NumberFormat("en-US",{maximumFractionDigits:9}).format(solPerDmdTarget)}</b>
                  </div>
                  <div className="kv small muted">
                    <span>SOL Spot</span>
                    <b>{(solUsd && solUsd > 0) ? ("$" + solUsd.toFixed(2) + " · Jupiter" + (solUpdatedAt ? " · " + fmtTime(solUpdatedAt) : "")) : "…"}</b>
                  </div>
                </>
              );
            })()}

            <div className="hr" />

            {/* On-chain Manual (Referenz aus Vault) */}
            <div className="muted small">On-chain Manual</div>
            <div className="kv">
              <span>SOL / 10k</span>
              <b>{fmtFix(priceSol10k, 6)}</b>
            </div>
            <div className="kv">
              <span>SOL / DMD</span>
              <b>{fmtNum(priceSol1Dmd, 0, 9)}</b>
            </div>
            <div className="kv">
              <span>USD / DMD</span>
              <b>{priceUsd1Dmd == null ? "…" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:6}).format(priceUsd1Dmd)}</b>
            </div>

            {/* Founder Controls */}
            {connected && wallet.publicKey?.equals(FOUNDER) && (
              <>
                <div className="hr" />
                <div className="kv">
                  <span>Abweichungsschwelle</span>
                  <input
                    value={deviationPct}
                    onChange={(e)=>setDeviationPct(e.target.value)}
                    className="input input--sm"
                    style={{ maxWidth: 90 }}
                  />
                  <span className="small muted">%</span>
                </div>
                <div className="btn-grid" style={{ marginTop: 8 }}>
                  <button
                    className="action-btn"
                    onClick={async () => {
                      if (solUsd <= 0) return setStatus("❌ SOL-Spot unbekannt.");
                      const target = lamportsPer10kFromSpot(solUsd);
                      if (!target) return setStatus("❌ Zielberechnung fehlgeschlagen.");
                      await handleSetManualPrice(target);
                    }}
                  >
                    Sync auf $0.01
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => setAutoSync(!autoSync)}
                    style={{ opacity: autoSync ? 1 : 0.7 }}
                  >
                    {autoSync ? "Auto-Sync: AN" : "Auto-Sync: AUS"}
                  </button>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Auto-Sync setzt den Manual-Preis alle 60 s neu, wenn die Abweichung &gt; {deviationPct}% ist.
                </div>
              </>
            )}
          </div>

          {/* Treasury Panel */}
          <div className="panel">
            <div className="panel-title" style={{ color: "var(--gold)" }}>Treasury</div>
            <div className="kv">
              <span>SOL</span>
              <b>{treasurySol == null ? "…" : treasurySol.toFixed(4)}</b>
            </div>
            <div className="kv">
              <span>USD</span>
              <b>{(treasurySol != null && solUsd > 0) ? fmtUSD(treasurySol * solUsd) : "…"}</b>
            </div>
            <div className="kv small muted">
              <span>Treasury</span>
              <span className="mono">{TREASURY ? TREASURY.toBase58().slice(0,4)+"…"+TREASURY.toBase58().slice(-4) : "…"}</span>
            </div>
            <div className="hr"></div>
            <div className="kv">
              <span>Presale Pool (DMD)</span>
              <b>{vaultDmd == null ? "…" : vaultDmd.toLocaleString()}</b>
            </div>
            {presaleUsdManual != null && (
              <div className="small muted">≈ {fmtUSD(presaleUsdManual)} @ Manual</div>
            )}
          </div>
        </div>

        {/* WL Status */}
        {connected && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title" style={{ color: "var(--gold)" }}>Whitelist</div>
            <div className="kv">
              <span>Status</span>
              <span className="chip">{whitelisted ? "Aktiv ✅" : "Nicht aktiv ❌"}</span>
            </div>
            {!whitelisted && (
              <button className="btn" onClick={handleAutoWhitelist}>Auto-Whitelist (≥ 0,5 SOL)</button>
            )}
          </div>
        )}

        {/* Action Grid – nur wenn connected & whitelisted */}
        {connected && whitelisted ? (
          <div className="btn-grid">
            {/* Buy / Swap SOL->DMD */}
            <div className="panel">
              <div className="panel-title" style={{ color: "var(--gold)" }}>SOL → DMD</div>
              <label className="small muted">Betrag (SOL)</label>
              <input
                value={amountSol}
                onChange={(e)=>setAmountSol(e.target.value)}
                className="input"
                placeholder="z. B. 1.5"
              />
              <div className="small muted" style={{ marginTop: 8 }}>Slippage (%)</div>
              <input
                value={slippagePct}
                onChange={(e)=>setSlippagePct(e.target.value)}
                className="input input--sm"
              />
              <div className="btn-grid" style={{ marginTop: 12 }}>
                <button className="action-btn" onClick={handleBuy}>BUY DMD</button>
                <button className="action-btn" onClick={handleSwapSolForDmd}>SWAP SOL→DMD</button>
              </div>
            </div>

            {/* Swap DMD->SOL (+ Sell sichtbar, disabled) */}
            <div className="panel">
              <div className="panel-title" style={{ color: "var(--gold)" }}>DMD → SOL</div>
              <label className="small muted">Betrag (DMD)</label>
              <input
                value={amountDmd}
                onChange={(e)=>setAmountDmd(e.target.value)}
                className="input"
                placeholder="z. B. 10000"
              />
              <div className="small muted" style={{ marginTop: 8 }}>Slippage (%)</div>
              <input
                value={slippagePct}
                onChange={(e)=>setSlippagePct(e.target.value)}
                className="input input--sm"
              />
              <div className="btn-grid" style={{ marginTop: 12 }}>
                {ENABLE_SELL_BUTTON && (
                  <button className="action-btn" title="Verkauf folgt – Treasury Signatur nötig" disabled
                          style={{ opacity:.6, cursor:"not-allowed" }}>
                    SELL DMD
                  </button>
                )}
                <button className="action-btn" onClick={handleSwapDmdForSol}>SWAP DMD→SOL</button>
                <button className="action-btn" onClick={handleClaim}>CLAIM REWARDS</button>
              </div>
            </div>
          </div>
        ) : connected ? (
          <div className="panel" style={{ marginTop: 20, textAlign: "center" }}>
            <div className="panel-title" style={{ color: "var(--gold)" }}>Whitelist benötigt</div>
            <p className="small muted" style={{ marginBottom: 12 }}>
              Deine Wallet ist verbunden, aber noch nicht freigeschaltet.
            </p>
            <button className="btn" onClick={handleAutoWhitelist}>
              Auto-Whitelist (≥ 0,5 SOL)
            </button>
          </div>
        ) : (
          <div className="panel" style={{ marginTop: 20, textAlign: "center" }}>
            <div className="panel-title" style={{ color: "var(--gold)" }}>Wallet verbinden</div>
            <p className="small muted">Verbinde eine Wallet, um Whitelist &amp; Trading zu nutzen.</p>
            <div style={{ marginTop: 12 }}>
              <WalletMultiButton />
            </div>
          </div>
        )}

        {/* Status */}
        <p className="small muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {status}
        </p>
      </main>
    </>
  );
}

export default function App() {
  const wallets = useMemo<WalletAdapter[]>(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new LedgerWalletAdapter(), new TorusWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <UI />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
