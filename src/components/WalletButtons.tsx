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

  // Angemeldet → Disconnect-UI
  if (connected) {
    return (
      <div className="walletbar">
        <span className="chip">
          {wallet?.adapter.name ?? "Wallet"} verbunden
        </span>
        <button className="btn" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  // Nicht angemeldet → Connect-Buttons
  const supportedWallets = ["Phantom", "Solflare", "Ledger", "Torus"];

  return (
    <div className="walletbar">
      {supportedWallets.map((name) => (
        <button
          key={name}
          className="btn"
          disabled={connecting}
          onClick={() => handleClick(name)}
        >
          Connect {name}
        </button>
      ))}
    </div>
  );
};

