// src/TokenDistribution.tsx
// ELITE ASSET-MANAGER EDITION — Premium Token Distribution
// Vollständig überarbeitet: Gold-Akzente, sanfte Animationen, moderne Balken, Hover-Effekte, perfekte Typografie
import React from "react";

type Props = {
  vault: number;
  treasury: number;
  founder: number;
};

export default function TokenDistribution({ vault, treasury, founder }: Props) {
  const totalDmd = Math.max(vault + founder, 1);
  const vaultPct = Math.min(Math.max((vault / totalDmd) * 100, 0), 100);
  const founderPct = Math.min(Math.max((founder / totalDmd) * 100, 0), 100);

  return (
    <div
      className="card panel"
      style={{
        background: "rgba(15,15,15,0.98)",
        border: "1px solid rgba(255,215,0,0.12)",
        padding: "28px",
        borderRadius: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="text-white font-semibold text-2xl tracking-tight">TOKEN DISTRIBUTION</div>
          <div className="text-xs text-white/50 mt-1">Verified On-Chain Allocation</div>
        </div>
        <div
          style={{
            background: "rgba(255,215,0,0.15)",
            color: "#f5c542",
            padding: "4px 14px",
            borderRadius: 999,
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ● VERIFIED
        </div>
      </div>

      {/* Reward Vault */}
      <DistributionLine
        label="REWARD VAULT"
        value={`${vault.toLocaleString()} DMD`}
        percent={`${vaultPct.toFixed(1)}%`}
        width={vaultPct}
        color="#7CFFB2"
        sub="Liquidity + Rewards"
      />

      {/* Strategic Reserve */}
      <DistributionLine
        label="STRATEGIC RESERVE"
        value={`${founder.toLocaleString()} DMD`}
        percent={`${founderPct.toFixed(1)}%`}
        width={founderPct}
        color="#f5c542"
        sub="Protocol Growth + Development"
      />

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "28px 0" }} />

      {/* Treasury */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="text-white/90 font-medium">TREASURY</div>
          <div className="text-xs text-white/50">Backing (SOL)</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-white tracking-tighter">
            {treasury.toFixed(2)} <span className="text-sm text-white/60">SOL</span>
          </div>
          <div className="text-xs text-white/50 mt-1">Protected on-chain reserve</div>
        </div>
      </div>

      {/* Footer Hinweis */}
      <div className="text-[10px] text-white/40 mt-8 text-center">
        100% On-Chain • No Hidden Allocation • Transparency First
      </div>
    </div>
  );
}

function DistributionLine({
  label,
  value,
  percent,
  width,
  color,
  sub,
}: {
  label: string;
  value: string;
  percent: string;
  width: number;
  color: string;
  sub: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <div className="text-white font-medium text-base tracking-wide">{label}</div>
          <div className="text-xs text-white/50">{sub}</div>
        </div>
        <div className="text-right">
          <div className="text-white text-xl font-semibold tracking-tight">{value}</div>
          <div style={{ color, fontWeight: 700, fontSize: "13px" }}>{percent}</div>
        </div>
      </div>

      {/* Premium Progress Bar */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 999,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            borderRadius: 999,
            transition: "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: `0 0 12px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}