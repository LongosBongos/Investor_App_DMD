// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
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
import "@solana/wallet-adapter-react-ui/styles.css";
import idl from "./idl/dmd_anchor.json";

// ---- Mini-Fix #1: Buffer Polyfill (Vite “buffer externalized”) ----
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window).Buffer) {
  (window).Buffer = Buffer;
}

// ======== Projekt-Konstanten (intern genutzt, NICHT anzeigen) ========
const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ??
    "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"
);
const RPC_URL =
  import.meta.env.VITE_RPC_URL ??
  "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";
const DMD_MINT = new PublicKey(
  import.meta.env.VITE_DMD_MINT ??
    "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5"
);
const TREASURY = new PublicKey(
  import.meta.env.VITE_TREASURY ?? "CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV"
);
const FOUNDER = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT");

// SPL IDs
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// On-chain Regeln (für Precheck)
const HOLD_DURATION = 60 * 60 * 24 * 30; // 30 Tage
const REWARD_INTERVAL = 60 * 60 * 24 * 90; // 90 Tage

// ======== PDA/ATA Helper ========
const u8 = anchor.utils.bytes.utf8;
function findVaultPda() {
  return PublicKey.findProgramAddressSync([u8.encode("vault")], PROGRAM_ID)[0];
}
function findBuyerStatePda(vault, buyer) {
  return PublicKey.findProgramAddressSync(
    [u8.encode("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  )[0];
}
function ataOf(owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), DMD_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// === Mini-Fix #2: ATA-Create ohne veraltete Rent-Sysvar ===
function createAtaIx(payer, ata, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true }, // payer
      { pubkey: ata, isSigner: false, isWritable: true }, // ata
      { pubkey: owner, isSigner: false, isWritable: false }, // owner
      { pubkey: mint, isSigner: false, isWritable: false }, // mint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

// ======== Anchor Coder ========
const ixCoder = new anchor.BorshInstructionCoder(idl);
const accCoder = new anchor.BorshAccountsCoder(idl);
function ixFromCoder(name, keys, args = {}) {
  const data = ixCoder.encode(name, args);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

// ======== Preisfeed (SOL→USD) mit Fallback ========
async function fetchSolUsd() {
  const urls = [
    "https://price.jup.ag/v6/price?ids=SOL",
    "https://price.jup.ag/v4/price?ids=SOL",
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      const p = j?.data?.SOL?.price ?? j?.data?.SOL;
      if (typeof p === "number") return p;
    } catch {}
  }
  const fallback = Number(import.meta.env.VITE_SOL_USD || "0");
  return fallback > 0 ? fallback : 0;
}

function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed"));
  const [amountSol, setAmountSol] = useState("1.0");
  const [status, setStatus] = useState("");

  // Investor-Infos
  const [treasurySol, setTreasurySol] = useState(null);
  const [solUsd, setSolUsd] = useState(0);
  const [priceLamports10k, setPriceLamports10k] = useState(null);
  const [vaultDmd, setVaultDmd] = useState(null); // DMD-Bestand der Vault-ATA

  const connected = !!wallet.publicKey;
  const SEND_OPTS = { skipPreflight: true }; // Simulation der Wallet überspringen

  // Vault/Treasury laden (nur das, was Investoren sehen sollen)
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
          connection
            .getTokenAccountBalance(vAta)
            .then((r) => r?.value?.uiAmount ?? 0)
            .catch(() => 0),
        ]);
        if (!alive) return;
        setTreasurySol(trezLamports / LAMPORTS_PER_SOL);
        setSolUsd(px);
        setVaultDmd(dmdBal);
        if (ai?.data) {
          const vault = accCoder.decode("Vault", ai.data);
          setPriceLamports10k(Number(vault.initial_price_sol ?? 0));
        }
      } catch (e) {
        console.error("load investor data:", e);
      }
    })();
    const iv = setInterval(() => {
      connection
        .getBalance(TREASURY)
        .then((l) => setTreasurySol(l / LAMPORTS_PER_SOL))
        .catch(() => {});
      fetchSolUsd().then(setSolUsd).catch(() => {});
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [connection]);

  // Abgeleitete Preise
  const priceSol10k =
    priceLamports10k != null ? priceLamports10k / LAMPORTS_PER_SOL : null;
  const priceSol1Dmd = priceSol10k != null ? priceSol10k / 10000 : null;
  const priceUsd1Dmd =
    priceSol1Dmd != null && solUsd > 0 ? priceSol1Dmd * solUsd : null;

  // Treasury-USD (nur SOL)
  const treasuryUsd = useMemo(
    () => (treasurySol != null && solUsd > 0 ? treasurySol * solUsd : null),
    [treasurySol, solUsd]
  );

  // Presale-Pool (DMD in Vault) – optional USD @ Manual Price als Hinweis
  const presaleUsdManual = useMemo(
    () =>
      vaultDmd != null && priceUsd1Dmd != null
        ? vaultDmd * priceUsd1Dmd
        : null,
    [vaultDmd, priceUsd1Dmd]
  );

  // ===== Helpers =====
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

  async function readBuyerState(buyer) {
    try {
      const v = findVaultPda();
      const bs = findBuyerStatePda(v, buyer);
      const ai = await connection.getAccountInfo(bs);
      if (!ai) return null;
      return accCoder.decode("BuyerState", ai.data);
    } catch {
      return null;
    }
  }

  // ===== Actions =====
  async function handleBuy() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Kauf vor…");
      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const { ixs: ataIxs, buyerAta, vaultAta } = await ensureAtas(
        buyer,
        buyer,
        vault
      );
      const lamports = new anchor.BN(
        Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL)
      );
      if (lamports.lte(new anchor.BN(0)))
        return alert("Ungültiger SOL-Betrag.");

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
      const buyIx = ixFromCoder("buy_dmd", keys, {
        sol_contribution: lamports,
      });

      const tx = new Transaction();
      ataIxs.forEach((ix) => tx.add(ix));
      tx.add(buyIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      setStatus("Sende Buy…");
      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Buy gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Buy fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  async function handleSell() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const st = await readBuyerState(buyer);
      const now = Math.floor(Date.now() / 1000);

      if (!st) return setStatus("❌ Kein BuyerState – zuerst via Buy erwerben.");
      if (!st.whitelisted) return setStatus("❌ Nicht auf Whitelist.");
      const amt = new anchor.BN(Math.floor(parseFloat(amountSol) * 10000)); // 1.0 -> 10k DMD
      if (amt.lte(new anchor.BN(0)))
        return setStatus("❌ Ungültiger DMD-Betrag.");
      if (new anchor.BN(st.total_dmd).lt(amt))
        return setStatus("❌ Zu wenig DMD im BuyerState.");
      if (now - Number(st.last_sell ?? 0) < HOLD_DURATION)
        return setStatus("❌ Sell-Lock: 30 Tage zwischen Verkäufen.");

      setStatus("Sende Sell…");
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);
      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
      ];
      const sellIx = ixFromCoder("sell_dmd", keys, { amount: amt });
      const tx = new Transaction().add(sellIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Sell gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Sell fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  async function handleClaim() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      const buyer = wallet.publicKey;
      const st = await readBuyerState(buyer);
      const now = Math.floor(Date.now() / 1000);

      if (!st) return setStatus("❌ Kein BuyerState – zuerst via Buy erwerben.");
      if (!st.whitelisted) return setStatus("❌ Nicht auf Whitelist.");
      if (Number(st.total_dmd) <= 0)
        return setStatus("❌ Kein DMD im BuyerState.");
      if (now - Number(st.holding_since ?? 0) < HOLD_DURATION)
        return setStatus("❌ Hold zu kurz (30 Tage).");
      if (
        Number(st.last_reward_claim ?? 0) !== 0 &&
        now - Number(st.last_reward_claim) < REWARD_INTERVAL
      )
        return setStatus("❌ Claim zu früh (90 Tage).");

      setStatus("Sende Claim…");
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);
      const keys = [
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: false },
      ];
      const claimIx = ixFromCoder("claim_reward", keys);
      const tx = new Transaction().add(claimIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sig = await wallet.sendTransaction(tx, connection, SEND_OPTS);
      setStatus(`✅ Claim gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Claim fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  // UI helpers
  function short(pk) {
    const s = pk.toBase58();
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }
  const fmtUSD = (x) =>
    x == null
      ? "…"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(x);

  return (
    <div className="min-h-screen bg-[#0b0f14] text-yellow-300">
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <WalletMultiButton />
      </div>

      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "Old English Text MT, serif" }}
        >
          Die Mark Digital
        </h1>
        <span className="opacity-70">Investor App · Solana</span>
        {connected && (
          <span className="ml-auto text-xs text-white/60">
            {short(wallet.publicKey)}
          </span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pricing – nur Manual Price */}
          <div className="bg-white/5 rounded-xl p-5">
            <div className="text-lg font-semibold mb-2">DMD Pricing</div>
            <div className="text-white/85 space-y-1">
              <div>
                Manual Price:{" "}
                <b>
                  {priceSol10k == null ? "…" : priceSol10k.toFixed(6)} SOL / 10k
                </b>
              </div>
              <div className="text-sm opacity-85">
                ≈ {priceSol1Dmd == null ? "…" : priceSol1Dmd.toFixed(9)} SOL /
                DMD
                {priceUsd1Dmd != null ? ` · ${fmtUSD(priceUsd1Dmd)} / DMD` : ""}
              </div>
              <div className="text-xs opacity-60">Mint: {short(DMD_MINT)}</div>
            </div>
          </div>

          {/* Treasury – SOL & USD (nur SOL-Wert) + Presale Pool */}
          <div className="bg-white/5 rounded-xl p-5">
            <div className="text-lg font-semibold mb-2">Treasury</div>
            <div className="text-white/85 space-y-1">
              <div>
                SOL: <b>{treasurySol == null ? "…" : treasurySol.toFixed(4)}</b>
              </div>
              <div>
                USD:{" "}
                <b>{treasuryUsd == null ? "…" : fmtUSD(treasuryUsd)}</b>{" "}
                <span className="opacity-60">(SOL × ${solUsd || "…"})</span>
              </div>
              <div className="text-xs opacity-60">
                Treasury: {short(TREASURY)}
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="text-sm opacity-85">
                  Presale Pool: <b>{vaultDmd == null ? "…" : vaultDmd.toLocaleString()}</b> DMD
                  {presaleUsdManual != null
                    ? `  · ≈ ${fmtUSD(presaleUsdManual)} @ Manual`
                    : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        {connected ? (
          <>
            <div className="mt-8">
              <label className="block mb-2 opacity-80">Betrag</label>
              <input
                value={amountSol}
                onChange={(e) => setAmountSol(e.target.value)}
                className="px-3 py-2 rounded bg-black/50 border border-white/10"
                placeholder="z. B. 1.5"
              />
              <span className="ml-2 opacity-60">SOL (Buy) · DMD (Sell)</span>
            </div>

            <div className="flex flex-wrap gap-8 mt-5">
              <button
                onClick={handleBuy}
                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded"
              >
                Buy DMD
              </button>
              <button
                onClick={handleSell}
                className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded"
              >
                Sell DMD
              </button>
              <button
                onClick={handleClaim}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded"
              >
                Claim Rewards
              </button>
            </div>

            <p className="mt-6 text-sm text-white/70 whitespace-pre-wrap">
              {status}
            </p>
          </>
        ) : (
          <div className="text-white/70 mt-8">
            Verbinde deine Wallet, um zu handeln.
          </div>
        )}
      </main>

      <footer className="text-center text-white/40 text-sm py-6">
        © {new Date().getFullYear()} Die Mark Digital
      </footer>
    </div>
  );
}

export default function App() {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
    ],
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
