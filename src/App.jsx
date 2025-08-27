// src/App.jsx
import React, { useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Connection,
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

import idl from "./idl/dmd_anchor.json";               // dein IDL (für Coder)  ⟶ buy_dmd/claim_reward/sell_dmd vorhanden
//                                                                         ↑ siehe dmd_anchor.json instructions. 
//                                                                         (buy_dmd-Accounts-Reihenfolge!) :contentReference[oaicite:3]{index=3}
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ======== PROJEKT-KONSTANTEN ========
// Program ID aus deinem IDL:
const PROGRAM_ID = new PublicKey("EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"); // :contentReference[oaicite:4]{index=4}

// Mint / Treasury / Founder:
const DMD_MINT = new PublicKey("3W8wtdW8pA8eUfUMJrCnJh9Dto8rc23nfQRJamuh1AWb"); // falls abweichend, anpassen
const TREASURY_PUBKEY = new PublicKey("CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV"); // anpassen falls anders
const FOUNDER_PUBKEY  = new PublicKey("AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT"); // anpassen falls anders

const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";

// ======== PDA-Helper (aus IDL abgeleitet) ========
// vault = PDA([b"vault"])
function findVaultPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID)[0];
}
// buyer_state = PDA([b"buyer", vault, buyer])
function findBuyerStatePda(vault, buyer) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buyer"), vault.toBuffer(), buyer.toBuffer()],
    PROGRAM_ID
  )[0];
}

// ATA-Helper (Owner kann PDA sein ⇒ allowOwnerOffCurve=true)
async function ataOf(owner) {
  return await getAssociatedTokenAddress(DMD_MINT, owner, true);
}

// ======== Instruction-Builder via Anchor Coder ========
const coder = new anchor.BorshInstructionCoder(idl); // :contentReference[oaicite:5]{index=5}
function ixFromCoder(name, keys, args = {}) {
  const data = coder.encode(name, args);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}

// ======== UI-Komponente ========
function UI() {
  const wallet = useWallet();
  const [connection] = useState(() => new Connection(RPC_URL, "confirmed"));
  const [amountSol, setAmountSol] = useState("1.0");
  const [status, setStatus] = useState("");

  const connected = !!wallet.publicKey;

  async function ensureAtas(payer, buyer, vault) {
    const ixs = [];
    const buyerAta = await ataOf(buyer);
    const vaultAta = await ataOf(vault);

    const [buyerInfo, vaultInfo] = await Promise.all([
      connection.getAccountInfo(buyerAta),
      connection.getAccountInfo(vaultAta),
    ]);

    if (!buyerInfo) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          payer,     // payer zahlt Miete
          buyerAta,  // neue ATA
          buyer,     // owner
          DMD_MINT   // mint
        )
      );
    }
    if (!vaultInfo) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          payer,
          vaultAta,
          vault,     // owner = PDA
          DMD_MINT
        )
      );
    }
    return { ixs, buyerAta, vaultAta };
  }

  async function handleBuy() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Kauf vor…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const { ixs: ataIxs, buyerAta, vaultAta } = await ensureAtas(buyer, buyer, vault);

      // Betrag (SOL → Lamports)
      const lamports = new anchor.BN(
        Math.floor(parseFloat(amountSol) * anchor.web3.LAMPORTS_PER_SOL)
      );
      if (lamports.lte(new anchor.BN(0))) return alert("Ungültiger SOL-Betrag.");

      // 🔴 WICHTIG: Accounts exakt wie im IDL angeben (Founder ≠ Buyer!) :contentReference[oaicite:6]{index=6}
      const keys = [
        { pubkey: vault,          isSigner: false, isWritable: true },
        { pubkey: buyerState,     isSigner: false, isWritable: true },
        { pubkey: FOUNDER_PUBKEY, isSigner: false, isWritable: true }, // <-- vorher fälschlich buyer
        { pubkey: TREASURY_PUBKEY,isSigner: false, isWritable: true },
        { pubkey: vaultAta,       isSigner: false, isWritable: true }, // vault_token_account
        { pubkey: buyerAta,       isSigner: false, isWritable: true }, // buyer_token_account
        { pubkey: buyer,          isSigner: true,  isWritable: true }, // buyer (signer)
        { pubkey: TOKEN_PROGRAM_ID,isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const buyIx = ixFromCoder("buy_dmd", keys, { sol_contribution: lamports }); // :contentReference[oaicite:7]{index=7}

      const tx = new Transaction();
      ataIxs.forEach(ix => tx.add(ix));
      tx.add(buyIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      setStatus("Sende Buy…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Buy gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Buy fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  async function handleSell() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Verkauf vor…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const amount = new anchor.BN(Math.floor(parseFloat(amountSol) * 1e9)); // DMD (9 Decimals)
      if (amount.lte(new anchor.BN(0))) return alert("Ungültiger DMD-Betrag.");

      const keys = [
        { pubkey: vault,      isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer,      isSigner: true,  isWritable: true },
      ];
      const sellIx = ixFromCoder("sell_dmd", keys, { amount }); // :contentReference[oaicite:8]{index=8}

      const tx = new Transaction().add(sellIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      setStatus("Sende Sell…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Sell gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Sell fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  async function handleClaim() {
    try {
      if (!connected) return alert("Verbinde deine Wallet.");
      setStatus("Bereite Claim vor…");

      const buyer = wallet.publicKey;
      const vault = findVaultPda();
      const buyerState = findBuyerStatePda(vault, buyer);

      const keys = [
        { pubkey: vault,      isSigner: false, isWritable: true },
        { pubkey: buyerState, isSigner: false, isWritable: true },
        { pubkey: buyer,      isSigner: true,  isWritable: false },
      ];
      const claimIx = ixFromCoder("claim_reward", keys); // :contentReference[oaicite:9]{index=9}

      const tx = new Transaction().add(claimIx);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      setStatus("Sende Claim…");
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`✅ Claim gesendet: ${sig}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Claim fehlgeschlagen: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-yellow-300">
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
          <div className="text-white/70">Verbinde zuerst deine Wallet (oben rechts).</div>
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
        © {new Date().getFullYear()} Die Mark Digital · Buy • Sell • Claim
      </footer>
    </div>
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
