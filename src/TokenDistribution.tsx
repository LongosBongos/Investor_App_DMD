import React from "react";

type Props = {
  vault: number;
  treasury: number;
  founder: number;
};

export default function TokenDistribution({
  vault,
  treasury,
  founder,
}: Props) {
  const totalDmd = Math.max(vault + founder, 1);

  const vaultPct = (vault / totalDmd) * 100;
  const founderPct = (founder / totalDmd) * 100;

  return (
    <div className="card token-dist">
      <div className="token-dist__head">
        <div>
          <div className="card-title">Token Distribution</div>
          <div className="token-dist__sub">Allocation overview</div>
        </div>

        <div className="token-dist__live">Live</div>
      </div>

      <div className="token-dist__body">
        <DistributionLine
          label="Vault"
          value={`${vault.toLocaleString()} DMD`}
          percent={`${vaultPct.toFixed(1)}%`}
          width={vaultPct}
          tone="vault"
        />

        <DistributionLine
          label="Founder"
          value={`${founder.toLocaleString()} DMD`}
          percent={`${founderPct.toFixed(1)}%`}
          width={founderPct}
          tone="founder"
        />

        <div className="token-dist__divider" />

        <div className="token-dist__row token-dist__row--treasury">
          <div className="token-dist__meta">
            <div className="token-dist__label">Treasury</div>
            <div className="token-dist__value">{treasury.toFixed(2)} SOL</div>
          </div>

          <div className="token-dist__percent token-dist__percent--muted">
            Separate reserve
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionLine({
  label,
  value,
  percent,
  width,
  tone,
}: {
  label: string;
  value: string;
  percent: string;
  width: number;
  tone: "vault" | "founder";
}) {
  return (
    <div className="token-dist__row">
      <div className="token-dist__row-top">
        <div className="token-dist__meta">
          <div className="token-dist__label">{label}</div>
          <div className="token-dist__value">{value}</div>
        </div>

        <div className="token-dist__percent">{percent}</div>
      </div>

      <div className="token-dist__bar">
        <div
          className={`token-dist__bar-fill token-dist__bar-fill--${tone}`}
          style={{ width: `${Math.min(Math.max(width, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}