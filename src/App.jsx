// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey, SystemProgram, Transaction, TransactionInstruction,
  Connection, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  ConnectionProvider, WalletProvider, useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter, SolflareWalletAdapter, LedgerWalletAdapter, TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import idl from "./idl/dmd_anchor.json";

// Buffer-Polyfill
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window).Buffer) (window).Buffer = Buffer;

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
const findVaultPda = () => PublicKey.findProgramAddressSync([u8.encode("vault")], PROGRAM_ID)[0];
const findBuyerStatePda = (vault, buyer) =>
  PublicKey.findProgramAddressSync([u8.encode("buyer"), vault.toBuffer(), buyer.toBuffer()], PROGRAM_ID)[0];
const ataOf = (owner) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];

function createAtaIx(payer, ata, owner, mint) {
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
const ixCoder = new anchor.BorshInstructionCoder(idl);
const accCoder = new anchor.BorshAccountsCoder(idl);
const ixFromCoder = (name, keys, args = {}) =>
  new TransactionInstruction({ programId: PROGRAM_ID, keys, data: ixCoder.encode(name, args) });

// ===== Preisfeed (SOL→USD) mit Fallback =====
async function fetchSolUsd() {
  const urls = ["https://price.jup.ag/v6/price?ids=SOL", "https://price.jup.ag/v4/price?ids=SOL"];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      const p = j?.data?.SOL?.price ?? j?.data?.SOL;
      if (typeof p === "number") return p;
    } catch {}
  }
  const fb = Number(import.meta.env.VITE_SOL_USD || "0");
  return fb > 0 ? fb : 0;
}

// ======= UI =======
function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed"));
  const SEND_OPTS = { skipPreflight: true };
  const connected = !!wallet.publicKey;

  // State
  const [status, setStatus] = useState("");
  const [treasurySol, setTreasurySol] = useState(null);
  const [solUsd, setSolUsd] = useState(0);
  const [priceLamports10k, setPriceLamports10k] = useState(null);
  const [vaultDmd, setVaultDmd] = useState(null);
  const [buyerState, setBuyerState] = useState(null);
  const [whitelisted, setWhitelisted] = useState(false);

  // Inputs
  const [amountSol, setAmountSol] = useState("1.0");     // Buy & SOL->DMD
  const [amountDmd, setAmountDmd] = useState("10000");   // DMD->SOL
  const [slippagePct, setSlippagePct] = useState("1.0"); // 1% Standard

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
        setVaultDmd(dmdBal);
        if (ai?.data) {
          const vault = accCoder.decode("Vault", ai.data); // IDL-Layout
          setPriceLamports10k(Number(vault.initial_price_sol ?? 0));
        }
      } catch (e) { console.error(e); }
    })();
    const iv = setInterval(() => {
      connection.getBalance(TREASURY).then(l => setTreasurySol(l / LAMPORTS_PER_SOL)).catch(() => {});
      fetchSolUsd().then(setSolUsd).catch(() => {});
    }, 30_000);
    return () => { alive = false; clearInterval(iv); };
  }, [connection]);

  // Laden: BuyerState/Whitelist
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!connected) { setBuyerState(null); setWhitelisted(false); return; }
      try {
        const v = findVaultPda();
        const bs = findBuyerStatePda(v, wallet.publicKey);
        const ai = await connection.getAccountInfo(bs);
        if (!alive) return;
        if (!ai) { setBuyerState(null); setWhitelisted(false); return; }
        const decoded = accCoder.decode("BuyerState", ai.data);
        setBuyerState(decoded);
        setWhitelisted(!!decoded.whitelisted);
      } catch { setBuyerState(null); setWhitelisted(false); }
    })();
    const iv = setInterval(async () => {
      if (!connected) return;
      const v = findVaultPda();
      const bs = findBuyerStatePda(v, wallet.publicKey);
      const ai = await connection.getAccountInfo(bs).catch(() => null);
      if (ai) {
        const decoded = accCoder.decode("BuyerState", ai.data);
        setBuyerState(decoded);
        setWhitelisted(!!decoded.whitelisted);
      }
    }, 20_000);
    return () => { alive = false; clearInterval(iv); };
  }, [connected, connection, wallet.publicKey]);

  // Abgeleitete Preise
  const priceSol10k = priceLamports10k != null ? priceLamports10k / LAMPORTS_PER_SOL : null;
  const priceSol1Dmd = priceSol10k != null ? priceSol10k / 10_000 : null;
  const priceUsd1Dmd = (priceSol1Dmd != null && solUsd > 0) ? priceSol1Dmd * solUsd : null;
  const treasuryUsd = (treasurySol != null && solUsd > 0) ? treasurySol * solUsd : null;
  const presaleUsdManual = (vaultDmd != null && priceUsd1Dmd != null) ? vaultDmd * priceUsd1Dmd : null;

  // Helpers
  async function ensureAtas(payer, buyer, vault) {
    const ixs = [];
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
  const short = (pk) => { const s = pk.toBase58(); return `${s.slice(0,4)}…${s.slice(-4)}`; };
  const fmtUSD = (x) => x == null ? "…" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(x);
  const slippageFactor = Math.max(0, 1 - (Number(slippagePct || "0") / 100));

  // ===== Aktionen (IDL-konform) =====
  async function handleAutoWhitelist() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
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
    } catch (e) { setStatus(`❌ Auto-Whitelist fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleBuy() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
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
    } catch (e) { setStatus(`❌ Buy fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleClaim() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      if (!buyerState) return setStatus("❌ Kein BuyerState – zuerst via Buy erwerben.");
      const now = Math.floor(Date.now() / 1000);
      if (now - Number(buyerState.holding_since ?? 0) < HOLD_DURATION) return setStatus("❌ Hold zu kurz (30 Tage).");
      if (Number(buyerState.last_reward_claim ?? 0) && now - Number(buyerState.last_reward_claim) < REWARD_INTERVAL)
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
    } catch (e) { setStatus(`❌ Claim fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleSwapSolForDmd() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const vAta = ataOf(vault);
      const bAta = ataOf(buyer);
      const { ixs: ataIxs } = await ensureAtas(buyer, buyer, vault);

      const lamportsIn = new anchor.BN(Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL));
      if (lamportsIn.lte(new anchor.BN(0))) return setStatus("❌ Ungültiger SOL-Betrag.");
      if (priceLamports10k == null) return setStatus("❌ Manual-Preis unbekannt.");
      const dmdOut = (Number(lamportsIn.toString()) * 10_000) / Number(priceLamports10k);
      const minOut = new anchor.BN(Math.floor(dmdOut * slippageFactor));

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
        min_out_dmd: minOut,
      });

      const tx = new Transaction(); ataIxs.forEach(ix0 => tx.add(ix0)); tx.add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap SOL→DMD gesendet: ${sig}`);
    } catch (e) { setStatus(`❌ Swap SOL→DMD fehlgeschlagen: ${e?.message ?? e}`); }
  }

  async function handleSwapDmdForSol() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const bs = findBuyerStatePda(vault, buyer);
      const vAta = ataOf(vault);
      const bAta = ataOf(buyer);
      const { ixs: ataIxs } = await ensureAtas(buyer, buyer, vault);

      const amountInDmd = new anchor.BN(Math.floor(parseFloat(amountDmd)));
      if (amountInDmd.lte(new anchor.BN(0))) return setStatus("❌ Ungültiger DMD-Betrag.");
      if (priceLamports10k == null) return setStatus("❌ Manual-Preis unbekannt.");
      const lamportsOut = Number(amountInDmd.toString()) * (Number(priceLamports10k) / 10_000);
      const minOut = new anchor.BN(Math.floor(lamportsOut * slippageFactor));

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
        amount_in_dmd: amountInDmd,
        min_out_sol: minOut,
      });

      const tx = new Transaction(); ataIxs.forEach(ix0 => tx.add(ix0)); tx.add(ix);
      tx.feePayer = buyer; tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Swap DMD→SOL gesendet: ${sig}`);
    } catch (e) { setStatus(`❌ Swap DMD→SOL fehlgeschlagen: ${e?.message ?? e}`); }
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
          <div className="panel">
            <div className="panel-title" style={{ color: "var(--gold)" }}>DMD Pricing</div>
            <div className="muted small">Manual Price</div>
            <div className="kv">
              <span>SOL / 10k</span>
              <b>{priceSol10k == null ? "…" : priceSol10k.toFixed(6)}</b>
            </div>
            <div className="kv">
              <span>SOL / DMD</span>
              <b>{priceSol1Dmd == null ? "…" : priceSol1Dmd.toFixed(9)}</b>
            </div>
            <div className="kv">
              <span>USD / DMD</span>
              <b>{priceUsd1Dmd == null ? "…" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:6}).format(priceUsd1Dmd)}</b>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title" style={{ color: "var(--gold)" }}>Treasury</div>
            <div className="kv">
              <span>SOL</span>
              <b>{treasurySol == null ? "…" : treasurySol.toFixed(4)}</b>
            </div>
            <div className="kv">
              <span>USD</span>
              <b>{treasuryUsd == null ? "…" : fmtUSD(treasuryUsd)}</b>
            </div>
            <div className="kv small muted">
              <span>Treasury</span>
              <span className="mono">{short(TREASURY)}</span>
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

        {/* Action Grid */}
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
              <button className="action-btn" onClick={handleBuy}>Buy DMD</button>
              <button className="action-btn" onClick={handleSwapSolForDmd}>Swap SOL→DMD</button>
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
                  Sell DMD
                </button>
              )}
              <button className="action-btn" onClick={handleSwapDmdForSol}>Swap DMD→SOL</button>
              <button className="action-btn" onClick={handleClaim}>Claim Rewards</button>
            </div>
          </div>
        </div>

        {/* Status */}
        <p className="small muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {status}
        </p>
      </main>
    </>
  );
}

export default function App() {
  const wallets = useMemo(
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
