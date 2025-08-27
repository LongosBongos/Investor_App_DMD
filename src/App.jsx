// src/App.jsx
import React, { useMemo, useState } from "react";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import idl from "./idl/dmd_anchor.json"; // nur für den Ix-Coder (instructions), NICHT für Program()
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

import {
  PROGRAM_ID,
  DMD_MINT,
  TREASURY,
  TOKEN_PROGRAM_ID,
  findVaultPda,
  findBuyerStatePda,
  vaultAta,
  buyerAta,
  buildIxCoder,
  ix_fromCoder,
} from "./solana";

// === RPC ===
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";

function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed"));
  const [ixCoder] = useState(() => buildIxCoder(idl)); // nur instructions nötig
  const [status, setStatus] = useState("");
  const [amountSol, setAmountSol] = useState("1.0"); // SOL (Buy) / DMD (Sell)

  const connected = !!wallet.publicKey;

  async function handleBuy() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Kauf vor…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const buyerToken = buyerAta(buyer);
      const vaultToken = vaultAta(vault);

      // ATAs ggf. anlegen
      const ataIxs = [];
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");

      const [buyerInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(buyerToken),
        connection.getAccountInfo(vaultToken),
      ]);
      if (!buyerInfo) {
        ataIxs.push(
          createAssociatedTokenAccountInstruction(
            buyer,        // payer
            buyerToken,   // ata
            buyer,        // owner
            DMD_MINT      // mint
          )
        );
      }
      if (!vaultInfo) {
        ataIxs.push(
          createAssociatedTokenAccountInstruction(
            buyer,        // payer
            vaultToken,   // ata
            vault,        // owner (PDA)
            DMD_MINT
          )
        );
      }

      // Betrag in Lamports
      const lamports = new anchor.BN(
        Math.floor(parseFloat(amountSol) * anchor.web3.LAMPORTS_PER_SOL)
      );
      if (lamports.lte(new anchor.BN(0))) return alert("Ungültiger SOL-Betrag.");

      // buy_dmd – reiner Ix-Encoder via IDL.instructions
      const keys = [
        { pubkey: vault,               isSigner: false, isWritable: true },
        { pubkey: buyerState,          isSigner: false, isWritable: true },
        { pubkey: buyer,               isSigner: false, isWritable: true }, // founder SystemAccount wird on-chain geprüft, buyer als Platzhalter ok
        { pubkey: TREASURY,            isSigner: false, isWritable: true },
        { pubkey: vaultToken,          isSigner: false, isWritable: true },
        { pubkey: buyerToken,          isSigner: false, isWritable: true },
        { pubkey: buyer,               isSigner: true,  isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];
      const buyIx = ix_fromCoder(ixCoder, "buy_dmd", keys, { sol_contribution: lamports });

      const tx = new Transaction();
      ataIxs.forEach(ix => ix && tx.add(ix));
      tx.add(buyIx);

      setStatus("Sende Buy…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Buy gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Buy fehlgeschlagen: ${e.message ?? e}`);
    }
  }

  async function handleSell() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Verkauf vor…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      // amountSol hier als DMD (9 Decimals)
      const amount = new anchor.BN(Math.floor(parseFloat(amountSol) * 1e9));
      if (amount.lte(new anchor.BN(0))) return alert("Ungültiger DMD-Betrag.");

      const keys = [
        { pubkey: vault,      isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer,      isSigner: true,  isWritable: true },
      ];
      const sellIx = ix_fromCoder(ixCoder, "sell_dmd", keys, { amount });

      const tx = new Transaction().add(sellIx);
      setStatus("Sende Sell…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Sell gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Sell fehlgeschlagen: ${e.message ?? e}`);
    }
  }

  async function handleClaim() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Prüfe Claim…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const keys = [
        { pubkey: vault,      isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer,      isSigner: true,  isWritable: false },
      ];
      const claimIx = ix_fromCoder(ixCoder, "claim_reward", keys);

      const tx = new Transaction().add(claimIx);
      setStatus("Sende Claim…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Claim gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Claim fehlgeschlagen: ${e.message ?? e}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-yellow-300">
      {/* Connect-Button fix */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <WalletMultiButton />
      </div>

      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Old English Text MT, serif" }}>
          Die Mark Digital
        </h1>
        <span className="opacity-70">Investor App · Solana</span>
        {connected && (
          <span className="ml-auto text-xs text-white/60">
            {wallet.publicKey.toBase58().slice(0, 4)}…{wallet.publicKey.toBase58().slice(-4)}
          </span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        {!connected ? (
          <div className="text-white/70">
            Verbinde zuerst deine Wallet (oben rechts).
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block mb-2 opacity-80">Betrag</label>
              <input
                value={amountSol}
                onChange={(e) => setAmountSol(e.target.value)}
                className="px-3 py-2 rounded bg-black/50 border border-white/10"
                placeholder="z. B. 1.5"
              />
              <span className="ml-2 opacity-60">SOL (Buy) · DMD (Sell)</span>
            </div>

            <div className="flex flex-wrap gap-8">
              <button onClick={handleBuy} className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded">
                Buy DMD
              </button>
              <button onClick={handleSell} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded">
                Sell DMD
              </button>
              <button onClick={handleClaim} className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded">
                Claim Rewards
              </button>
            </div>

            <p className="mt-6 text-sm text-white/70 whitespace-pre-wrap">{status}</p>
          </>
        )}
      </main>

      <footer className="text-center text-white/40 text-sm py-6">
        © 2025 Die Mark Digital · Buy • Sell • Claim
      </footer>
    </div>
  );
}

export default function App() {
  const endpoint = RPC_URL;
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
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <UI />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
