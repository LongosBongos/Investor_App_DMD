import React, { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export const WalletButtons: React.FC = () => {
  const {
    wallets, select, wallet, connect, disconnect, connected, connecting,
  } = useWallet();

  const byName = useMemo(() => {
    const m = new Map<string, (typeof wallets)[number]>();
    wallets.forEach((w) => m.set(w.adapter.name, w));
    return m;
  }, [wallets]);

  if (connected) {
    return (
      <div className="walletbar">
        <span className="chip">{wallet?.adapter.name ?? "Wallet"} verbunden</span>
        <button className="btn" onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  const click = async (name: string) => {
    const w = byName.get(name);
    if (!w) return;
    select(w.adapter.name);
    await connect();
  };

  return (
    <div className="walletbar">
      <button className="btn" disabled={connecting} onClick={() => click("Phantom")}>
        Connect Phantom
      </button>
      <button className="btn" disabled={connecting} onClick={() => click("Solflare")}>
        Connect Solflare
      </button>
    </div>
  );
};
