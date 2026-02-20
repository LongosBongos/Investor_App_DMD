import React from "react";

type Props = {
  vault: number;
  treasury: number;
  founder: number;
};

export default function TokenDistribution({ vault, treasury, founder }: Props) {
  const total = vault + treasury + founder || 1;
  const pct = (v: number) => ((v / total) * 100).toFixed(1) + "%";

  return (
    <div className="card p-4">
      <div className="text-white font-semibold mb-2">Token Distribution</div>
      <div className="space-y-2 text-sm text-white/80">
        <div className="flex justify-between">
          <span>Vault</span>
          <span>{vault.toLocaleString()} DMD ({pct(vault)})</span>
        </div>
        <div className="flex justify-between">
          <span>Treasury (SOL)</span>
          <span>{treasury.toFixed(2)} SOL ({pct(treasury)})</span>
        </div>
        <div className="flex justify-between">
          <span>Founder</span>
          <span>{founder.toLocaleString()} DMD ({pct(founder)})</span>
        </div>
      </div>
    </div>
  );
}
