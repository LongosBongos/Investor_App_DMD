// src/TxFeed.tsx
import React, { useMemo } from "react";

type Tx = {
  sig?: string;
  evt_type?: string;
  amount_sol?: number;
  amount_dmd?: number;
  ts?: number; // unix seconds
};

type Props = {
  title: string;
  rows: Tx[];
  wipText?: string; // optional override
};

function shortSig(sig?: string) {
  return sig ? sig.slice(0, 4) + "…" + sig.slice(-4) : "";
}

function explorer(sig?: string) {
  return sig ? `https://solscan.io/tx/${sig}` : "#";
}

function fmtSol(x: number | undefined) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  if (x <= 0) return "—";
  return x.toFixed(3);
}

function fmtDmd(x: number | undefined) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  if (x <= 0) return "—";
  return Math.floor(x).toLocaleString();
}

function labelClass(evt?: string) {
  const e = (evt || "").toLowerCase();
  if (e === "buy") return "buy";
  if (e === "sell") return "sell";
  if (e === "claim") return "claim";
  if (e === "whitelist") return "whitelist";
  if (e === "airdrop") return "airdrop";
  return "unknown";
}

function prettyType(evt?: string) {
  const e = (evt || "").toLowerCase();
  if (!e) return "UNKNOWN";
  return e.toUpperCase();
}

function timeAgo(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return "";
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - ts);

  if (d < 10) return "gerade eben";
  if (d < 60) return `vor ${d}s`;
  const m = Math.floor(d / 60);
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `vor ${h}h`;
  const days = Math.floor(h / 24);
  return `vor ${days}d`;
}

export default function TxFeed({ title, rows, wipText }: Props) {
  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : [];
    list.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    return list.slice(0, 15);
  }, [rows]);

  const empty = !sorted || sorted.length === 0;

  return (
    <div className="card panel">
      <div className="panel-title">{title}</div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Letzte Ereignisse
      </div>

      {!empty ? (
        sorted.map((t, i) => (
          <div key={(t.sig || "") + i} className="tx-row" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={"label " + labelClass(t.evt_type)}>
                  {prettyType(t.evt_type)}
                </span>
                {t.ts ? (
                  <span className="small muted">{timeAgo(t.ts)}</span>
                ) : null}
              </div>

              <div className="small muted" style={{ marginTop: 4 }}>
                {fmtSol(t.amount_sol)} SOL · {fmtDmd(t.amount_dmd)} DMD
              </div>
            </div>

            <a
              className="small muted mono"
              href={explorer(t.sig)}
              target="_blank"
              rel="noreferrer"
              style={{ whiteSpace: "nowrap", alignSelf: "center" }}
              title={t.sig || ""}
            >
              {shortSig(t.sig)}
            </a>
          </div>
        ))
      ) : (
        <div className="small muted" style={{ lineHeight: 1.35 }}>
          <span style={{ color: "var(--gold)", fontWeight: 700 }}>WIP</span>{" "}
          · {wipText || "On-Chain Feed wird gerade integriert."}
        </div>
      )}
    </div>
  );
}
