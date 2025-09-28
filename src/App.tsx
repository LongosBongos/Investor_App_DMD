// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
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
import { fetchSolUsd, computeDmdPricing, type DmdPricing } from "./price";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"; // ✅ Holder-Scan (Token 2020)

// ---- zentrale Solana-Helper
import {
  buildIxCoder, buildAccCoder,
  ixAutoWhitelistSelf, ixBuyDmd, ixClaimRewardV2,
  ixSwapExactSolForDmd, ixSwapExactDmdForSol,
  ixSetManualPrice,
  findVaultPda, findBuyerStatePda, ataFor as ataOf,
  createAtaIx,
  FOUNDER, TREASURY, DMD_MINT,
} from "./solana";

// Buffer-Polyfill
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) (window as any).Buffer = Buffer;

// ===== Helper: Holder-Anzahl zählen (Token-2020) =====
async function fetchHolderCount2020(connection: Connection, mint: PublicKey): Promise<number> {
  try {
    const accs = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: mint.toBase58() } },
        { dataSize: 165 },
      ],
    });
    const owners = new Set<string>();
    for (const a of accs) {
      const info: any = (a.account as any).data?.parsed?.info;
      if (!info) continue;
      const ownerStr: string | undefined = info.owner;
      const amt = info.tokenAmount?.uiAmount as number | undefined;
      if (!ownerStr || typeof amt !== "number" || !isFinite(amt) || amt <= 0) continue;
      owners.add(ownerStr);
    }
    return owners.size;
  } catch {
    return 0;
  }
}

// ===== ENV / RPC =====
const RPC_URL = import.meta.env.VITE_RPC_URL
  ?? "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";

// Optional: Treasury-Gewichtung für Backing (0..1)
const TREASURY_WEIGHT = 1.0;

// ======= UI =======
function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed" as Commitment));
  const SEND_OPTS: any = { skipPreflight: true };
  const connected = !!wallet.publicKey;

  // Coders
  const ixCoder = useMemo(() => buildIxCoder(idl as any), []);
  const accCoder = useMemo(() => buildAccCoder(idl as any), []);

  // State
  const [status, setStatus] = useState<string>("");
  const [treasurySol, setTreasurySol] = useState<number | null>(null);
  const [solUsd, setSolUsd] = useState<number>(0);
  const [solUpdatedAt, setSolUpdatedAt] = useState<number | null>(null);
  const [priceLamports10k, setPriceLamports10k] = useState<number | null>(null);
  const [vaultDmd, setVaultDmd] = useState<number | null>(null);
  const [buyerState, setBuyerState] = useState<any>(null);
  const [whitelisted, setWhitelisted] = useState<boolean>(false);
  const [pricing, setPricing] = useState<DmdPricing | null>(null); // ✅ neu

  // Inputs
  const [amountSol, setAmountSol] = useState("1.0");     // Buy & SOL->DMD
  const [amountDmd, setAmountDmd] = useState("10000");   // DMD->SOL
  const [slippagePct, setSlippagePct] = useState("1.0"); // 1% Standard

  // Auto-Price Controls (Founder)
  const [autoSync, setAutoSync] = useState(false);
  const [deviationPct, setDeviationPct] = useState("1.0"); // 1% Schwelle

  // $0.01/DMD -> Lamports/10k (10.000 DMD * $0.01 = $100)
  function lamportsPer10kFromSpot(solUsdNow: number): number | null {
    if (!solUsdNow || solUsdNow <= 0) return null;
    const solFor100Usd = 100 / solUsdNow;
    return Math.floor(solFor100Usd * LAMPORTS_PER_SOL);
  }

  // Manual Price setzen (Founder)
  async function handleSetManualPrice(lamportsPer10k: number) {
    if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
    if (!wallet.publicKey.equals(FOUNDER)) return setStatus("❌ Nur Founder dürfen den Manual-Preis setzen.");
    try {
      setStatus("Setze Manual-Preis …");
      const ix = ixSetManualPrice(ixCoder, lamportsPer10k, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
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
        const vAta = ataOf(v, DMD_MINT);
        const [ai, trezLamports, px, dmdBal, holders] = await Promise.all([
          connection.getAccountInfo(v),
          connection.getBalance(TREASURY),
          fetchSolUsd(),
          connection.getTokenAccountBalance(vAta).then(r => r?.value?.uiAmount ?? 0).catch(() => 0),
          fetchHolderCount2020(connection, DMD_MINT).catch(() => 0), // ✅ Holder-Anzahl
        ]);
        if (!alive) return;
        setTreasurySol(trezLamports / LAMPORTS_PER_SOL);
        setSolUsd(px);
        setSolUpdatedAt(Date.now());
        setVaultDmd(dmdBal);

        if (ai?.data) {
          const vault = accCoder.decode("Vault", ai.data);
          const lamportsPer10k = Number((vault as any).initial_price_sol ?? 0);
          setPriceLamports10k(lamportsPer10k);

          // PresalePool = DMD im Vault (Pool)
          const presalePool = Math.max(0, Math.floor(Number(dmdBal || 0)));

          // ✅ Preisformel V2: Holder, MaxSupply, Treasury-Gewichtung, PresalePool, SOL, Manual
          const p = await computeDmdPricing({
            lamportsPer10k,
            treasuryLamports: trezLamports, // Lamports
            // 'circulating' lassen wir weg → computeDmdPricing nimmt (maxSupply - presalePool)
            maxSupply: 150_000_000,
            manualFloorUsd: 0.01,
            holders,
            presalePool,
            treasuryWeight: TREASURY_WEIGHT,
          }).catch(() => null);

          if (p) setPricing(p);
        }
      } catch (e) { console.error(e); }
    })();
    const iv = setInterval(() => {
      connection.getBalance(TREASURY).then(l => setTreasurySol(l / LAMPORTS_PER_SOL)).catch(() => {});
      fetchSolUsd().then((v)=>{ setSolUsd(v); setSolUpdatedAt(Date.now()); }).catch(()=>{});
    }, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [connection, accCoder]);

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
  }, [connected, connection, wallet.publicKey, accCoder]);

  // Auto-Sync Manual-Preis
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

  // Abgeleitete Preise (Anzeige)
  const priceSol10k = priceLamports10k != null ? priceLamports10k / LAMPORTS_PER_SOL : null;
  const priceSol1Dmd = priceSol10k != null ? priceSol10k / 10_000 : null;
  const priceUsd1Dmd = (priceSol1Dmd != null && solUsd > 0) ? priceSol1Dmd * solUsd : null;
  const treasuryUsd = (treasurySol != null && solUsd > 0) ? treasurySol * solUsd : null;
  const presaleUsdManual = (vaultDmd != null && priceUsd1Dmd != null) ? vaultDmd * priceUsd1Dmd : null;

  // Helpers
  const short = (pk: PublicKey) => { const s = pk.toBase58(); return `${s.slice(0,4)}…${s.slice(-4)}`; };
  const fmtUSD = (x: number | null) => x == null ? "…" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(x);
  const fmtTime = (t: number | null) => t == null ? "—" : new Date(t).toLocaleTimeString('de-DE', { hour12: false });
  const slippageFactor = Math.max(0, 1 - (Number(slippagePct || "0") / 100));
  const fmtNum = (x: number | null, min = 0, max = 9) =>
    x == null ? "…" : new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }).format(x);
  const fmtFix = (x: number | null, digits = 6) =>
    x == null ? "…" : (typeof x === "number" ? x : Number(x)).toFixed(digits);

  // ===== Aktionen =====
  async function handleAutoWhitelist() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      setStatus("Whitelist wird geprüft…");
      const ix = ixAutoWhitelistSelf(ixCoder, wallet.publicKey);
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
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
      const vAta = ataOf(vault, DMD_MINT);
      const bAta = ataOf(buyer, DMD_MINT);

      // ATAs sicherstellen
      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);
      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      const lamports = Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL);
      if (!Number.isFinite(lamports) || lamports <= 0) return alert("Ungültiger SOL-Betrag.");

      const ix = ixBuyDmd(ixCoder, buyer, lamports);
      const tx = new Transaction(); ixs.forEach(ix0 => tx.add(ix0)); tx.add(ix);
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
      const HOLD_DURATION = 60 * 60 * 24 * 30;
      const REWARD_INTERVAL = 60 * 60 * 24 * 90;
      if (now - Number((buyerState as any).holding_since ?? 0) < HOLD_DURATION) return setStatus("❌ Hold zu kurz (30 Tage).");
      if (Number((buyerState as any).last_reward_claim ?? 0) && now - Number((buyerState as any).last_reward_claim) < REWARD_INTERVAL)
        return setStatus("❌ Claim zu früh (90 Tage).");

      setStatus("Sende Claim …");
      const ix = ixClaimRewardV2(ixCoder, buyer);
      const tx = new Transaction().add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Claim gesendet: ${sig}`);
    } catch (e: any) {
      setStatus(`❌ Claim fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  // 🔧 SOL → DMD (lib.rs: 1 SOL = 10_000 DMD, ohne Manual-Preis)
  async function handleSwapSolForDmd() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      setStatus("Sende Swap SOL→DMD …");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta  = ataOf(vault, DMD_MINT);
      const bAta  = ataOf(buyer, DMD_MINT);

      // ATAs sicherstellen
      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);
      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      // Beitrag (on-chain Range 0.5–10 SOL)
      const lamportsIn = Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL);
      if (!Number.isFinite(lamportsIn) || lamportsIn <= 0) return setStatus("❌ Ungültiger SOL-Betrag.");

      // Quote on-chain: sol_to_dmd (1 SOL = 10k DMD)
      const dmdOutUi = Math.floor((lamportsIn * 10_000) / LAMPORTS_PER_SOL);
      const minOutUi = Math.max(1, Math.floor(dmdOutUi * slippageFactor));

      const swapIx = ixSwapExactSolForDmd(ixCoder, buyer, lamportsIn, minOutUi);
      const tx = new Transaction(); ixs.forEach(ix => tx.add(ix)); tx.add(swapIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap SOL→DMD gesendet: ${sig}`);
    } catch (e: any) {
      console.error("Swap SOL→DMD error:", e);
      setStatus(`❌ Swap SOL→DMD fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  // 🔧 DMD → SOL (lib.rs: Manual-Preis + Penalty nur wenn Hold < 30 Tage)
  async function handleSwapDmdForSol() {
    try {
      if (!connected || !wallet.publicKey) return alert("Verbinde deine Wallet.");
      setStatus("Sende Swap DMD→SOL …");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const vAta  = ataOf(vault, DMD_MINT);
      const bAta  = ataOf(buyer, DMD_MINT);

      // ATAs sicherstellen
      const ixs: TransactionInstruction[] = [];
      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(bAta),
        connection.getAccountInfo(vAta),
      ]);
      if (!buyerInfo) ixs.push(createAtaIx(buyer, bAta, buyer, DMD_MINT));
      if (!vaultInfo) ixs.push(createAtaIx(buyer, vAta, vault, DMD_MINT));

      // Eingabe in ganzen DMD (on-chain Stückzahl)
      const amountInUi = Math.floor(parseFloat(amountDmd));
      if (!Number.isFinite(amountInUi) || amountInUi <= 0) return setStatus("❌ Ungültiger DMD-Betrag.");
      if (priceLamports10k == null) return setStatus("❌ Manual-Preis unbekannt (Vault).");

      // Brutto Lamports via Manual-Preis
      const grossLamports = Math.floor(amountInUi * (Number(priceLamports10k) / 10_000));

      // Penalty nur bei Hold < 30 Tage
      const now = Math.floor(Date.now() / 1000);
      const holdOk = !!buyerState && (now - Number((buyerState as any).holding_since ?? 0) >= 60 * 60 * 24 * 30);
      const penaltyBps = holdOk ? 0 : 1750; // 17.5% wenn Hold nicht erfüllt
      const afterPenalty = Math.floor(grossLamports * (1 - penaltyBps / 10_000));

      // konservativ: Slippage-Puffer
      const minOutLamports = Math.max(1, Math.floor(afterPenalty * slippageFactor));

      const swapIx = ixSwapExactDmdForSol(ixCoder, buyer, amountInUi, minOutLamports);
      const tx = new Transaction(); ixs.forEach(ix => tx.add(ix)); tx.add(swapIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap DMD→SOL gesendet: ${sig}`);
    } catch (e: any) {
      console.error("Swap DMD→SOL error:", e);
      setStatus(`❌ Swap DMD→SOL fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  const ENABLE_SELL_BUTTON = true; // sichtbar, aber ohne Treasury-Serverflow

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

            {/* ✅ Auto-Pricing Anzeige */}
            <div className="hr" />
            <div className="muted small">Auto-Pricing (Floor/Manual/Backing)</div>
            <div className="kv">
              <span>USD / DMD (final)</span>
              <b>
                {pricing?.usdPerDmdFinal != null
                  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(pricing.usdPerDmdFinal)
                  : "…"}
              </b>
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
                    SYNC AUF $0.01
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => setAutoSync(!autoSync)}
                    style={{ opacity: autoSync ? 1 : 0.7 }}
                  >
                    {autoSync ? "AUTO-SYNC: AN" : "AUTO-SYNC: AUS"}
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
                <button className="action-btn swap-btn" onClick={handleSwapSolForDmd}>SWAP SOL→DMD</button>
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
                <button className="action-btn swap-btn" onClick={handleSwapDmdForSol}>SWAP DMD→SOL</button>
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




