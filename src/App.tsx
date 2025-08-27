import React, { useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { WalletButtons } from "./components/WalletButtons";

const RPC =
  import.meta.env.VITE_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ??
    "EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro"
);
const DMD_MINT = new PublicKey(
  import.meta.env.VITE_DMD_MINT ??
    "3rCZT3Xw6jvU4JWatQPsivS8fQ7gV7GjUfJnbTk9Ssn5"
);

function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!publicKey) { setBalance(null); return; }
      const lamports = await connection.getBalance(publicKey);
      if (alive) setBalance(lamports / LAMPORTS_PER_SOL);
    }
    load().catch(console.error);
    return () => { alive = false; };
  }, [connection, publicKey]);

  return (
    <div className="panel">
      <div className="panel-title">Wallet</div>
      {!connected || !publicKey ? (
        <div className="muted">Bitte Wallet verbinden.</div>
      ) : (
        <>
          <div className="kv">
            <span>Adresse</span>
            <code className="mono">
              {publicKey.toBase58().slice(0,4)}…{publicKey.toBase58().slice(-4)}
            </code>
          </div>
          <div className="kv">
            <span>SOL</span>
            <b>{balance?.toFixed(4) ?? "…"}</b>
          </div>

          <div className="hr" />

          <div className="kv">
            <span>Programm</span>
            <code className="mono">
              {PROGRAM_ID.toBase58().slice(0,4)}…{PROGRAM_ID.toBase58().slice(-4)}
            </code>
          </div>
          <div className="kv">
            <span>DMD Mint</span>
            <code className="mono">
              {DMD_MINT.toBase58().slice(0,4)}…{DMD_MINT.toBase58().slice(-4)}
            </code>
          </div>

          <p className="muted small">
            Buy / Sell / Claim kommen gleich als nächster Schritt.
          </p>
        </>
      )}
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
        <div className="shell">
          <header className="topbar">
            <div className="container brand">
              <div className="title">
                <span className="mark">Die Mark Digital</span>
                <span className="sub">Investor&nbsp;App</span>
              </div>
              <WalletButtons />
            </div>
          </header>

          <main className="container">
            <div className="grid">
              <div className="panel">
                <div className="panel-title">Status</div>
                <ul className="bullets">
                  <li>RPC: <code className="mono">{RPC}</code></li>
                  <li>Programm: <code className="mono">{PROGRAM_ID.toBase58()}</code></li>
                </ul>
                <p className="muted small">Verbinde eine Wallet, um fortzufahren.</p>
              </div>

              <Dashboard />
            </div>
          </main>

          <footer className="footer">
            <div className="container muted small">
              © {new Date().getFullYear()} Die Mark Digital — Buy • Sell • Claim
            </div>
          </footer>
        </div>
      </WalletProvider>
    </ConnectionProvider>
  );
}
