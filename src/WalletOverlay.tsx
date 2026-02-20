import React from 'react';

export default function WalletOverlay({ open, onClose, onConnect }: {
  open: boolean; onClose: () => void; onConnect: (wallet:string)=>void;
}) {
  if (!open) return null;
  const wallets = [
    { name: 'Phantom', icon: '/phantom.svg' },
    { name: 'Solflare', icon: '/solflare.svg' },
    { name: 'Ledger', icon: '/ledger.svg' }
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b0f14]/95 border border-white/10 rounded-2xl p-6 w-80 text-center">
        <h2 className="text-white text-lg font-semibold mb-4">Connect Wallet</h2>
        <div className="space-y-2">
          {wallets.map(w => (
            <button key={w.name}
              onClick={() => onConnect(w.name)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition">
              <img src={w.icon} alt={w.name} className="w-6 h-6"/>
              {w.name}
            </button>
          ))}
        </div>
        <button onClick={onClose}
          className="mt-4 text-sm text-white/60 hover:text-white">Abbrechen</button>
      </div>
    </div>
  );
}
