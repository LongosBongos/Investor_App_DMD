// src/WalletButtons.tsx
import React, { useMemo } from "react";
import { useWallet, WalletContextState } from "@solana/wallet-adapter-react";

export const WalletButtons: React.FC = () => {
  const {
    wallets,
    select,
    wallet,
    connect,
    disconnect,
    connected,
    connecting,
    publicKey,
  }: WalletContextState = useWallet();

  // Map Wallets nach Namen
  const byName = useMemo(() => {
    const m = new Map<string, (typeof wallets)[number]>();
    wallets.forEach((w) => m.set(w.adapter.name, w));
    return m;
  }, [wallets]);

  // Klick-Handler
  const handleClick = async (name: string): Promise<void> => {
    const w = byName.get(name);
    if (!w) return;
    select(w.adapter.name);
    await connect();
  };

  const supportedWallets = ["Phantom", "Solflare", "Ledger", "Torus"];

  // PublicKey kurz anzeigen
  const shortKey = useMemo(() => {
    const s = publicKey?.toBase58();
    if (!s) return "";
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }, [publicKey]);

  return (
    <div className="wallet-slot" role="navigation" aria-label="Wallet">
      {connected ? (
        <div className="walletbar walletbar--connected">
          <span className="wallet-chip">
            {wallet?.adapter.name ?? "Wallet"} · {shortKey || "verbunden"}
          </span>
          <button className="wallet-elite-btn" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="walletbar">
          {supportedWallets.map((name) => (
            <button
              key={name}
              className="wallet-elite-btn"
              disabled={connecting}
              onClick={() => handleClick(name)}
            >
              {connecting ? "Connecting…" : `Connect ${name}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};