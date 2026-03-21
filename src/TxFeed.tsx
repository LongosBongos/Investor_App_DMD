// src/TxFeed.tsx
// ELITE ASSET-MANAGER EDITION — Premium On-Chain Tx Feed
// Gold-Akzente, Hover-Glow, farbige Event-Badges, animierte Zeilen, perfekt abgestimmt auf PriceChart + TokenDistribution + Leaderboard
import React, { useMemo } from "react";

type RawTx = Record<string, unknown>;

type TxRow = {
  sig: string;
  evtType: string;
  amountSol: number | null;
  amountDmd: number | null;
  ts: number | null;
};

type Props = {
  title: string;
  rows: RawTx[];
  wipText?: string;
};

const MAX_ROWS = 15;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function toNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function normalizeEvtType(value: unknown): string {
  const raw = toStr(value).toLowerCase();
  if (!raw) return "unknown";
  if (raw === "buy") return "buy";
  if (raw === "sell") return "sell";
  if (raw === "claim") return "claim";
  if (raw === "whitelist") return "whitelist";
  if (raw === "airdrop") return "airdrop";
  if (raw === "reward") return "claim";
  if (raw === "swap") return "buy";
  return "unknown";
}

function normalizeTx(row: unknown): TxRow | null {
  if (!isRecord(row)) return null;
  const sig =
    toStr(row.sig) ||
    toStr(row.signature) ||
    toStr(row.tx) ||
    toStr(row.txid);
  const evtType = normalizeEvtType(
    row.evt_type ?? row.event ?? row.type ?? row.kind
  );
  const amountSol =
    toNum(row.amount_sol) ??
    toNum(row.sol) ??
    toNum(row.sol_amount) ??
    null;
  const amountDmd =
    toNum(row.amount_dmd) ??
    toNum(row.dmd) ??
    toNum(row.dmd_amount) ??
    null;
  const ts =
    toNum(row.ts) ??
    toNum(row.timestamp) ??
    toNum(row.time) ??
    null;

  if (!sig && evtType === "unknown" && amountSol == null && amountDmd == null && ts == null) {
    return null;
  }

  return {
    sig,
    evtType,
    amountSol,
    amountDmd,
    ts,
  };
}

function shortSig(sig: string): string {
  return sig ? `${sig.slice(0, 6)}…${sig.slice(-4)}` : "—";
}

function explorer(sig: string): string {
  return sig ? `https://solscan.io/tx/${sig}` : "#";
}

function fmtSol(x: number | null): string {
  if (x == null || !Number.isFinite(x) || x <= 0) return "—";
  return x.toFixed(3);
}

function fmtDmd(x: number | null): string {
  if (x == null || !Number.isFinite(x) || x <= 0) return "—";
  return Math.floor(x).toLocaleString();
}

function labelClass(evt: string): string {
  if (evt === "buy") return "#4ade80";
  if (evt === "sell") return "#f87171";
  if (evt === "claim") return "#facc15";
  if (evt === "whitelist") return "#60a5fa";
  if (evt === "airdrop") return "#a78bfa";
  return "#9ca3af";
}

function prettyType(evt: string): string {
  if (!evt) return "UNKNOWN";
  return evt.toUpperCase();
}

function timeAgo(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return "";
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - Math.floor(ts));
  if (d < 10) return "gerade eben";
  if (d < 60) return `vor ${d}s`;
  const m = Math.floor(d / 60);
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `vor ${h}h`;
  const days = Math.floor(h / 24);
  return `vor ${days}d`;
}

export default function TxFeed({ title, rows, wipText }: Props): JSX.Element {
  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map(normalizeTx)
      .filter((t): t is TxRow => t !== null)
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, MAX_ROWS);
  }, [rows]);

  const empty = sorted.length === 0;

  return (
    <div
      className="card panel"
      style={{
        background: "rgba(15,15,15,0.98)",
        border: "1px solid rgba(255,215,0,0.12)",
        padding: "24px",
        borderRadius: 16,
      }}
    >
      {/* Premium Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div className="panel-title" style={{ color: "var(--gold)" }}>{title}</div>
          <div className="small muted">Letzte On-Chain Ereignisse</div>
        </div>
        <div
          style={{
            background: "rgba(245,197,66,0.15)",
            color: "#f5c542",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          ● LIVE
        </div>
      </div>

      {!empty ? (
        sorted.map((t, i) => (
          <div
            key={`${t.sig || "nosig"}-${t.ts || 0}-${i}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 0",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,197,66,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {/* Linke Seite */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {/* Event Badge */}
              <div
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: "11px",
                  fontWeight: 800,
                  background: `${labelClass(t.evtType)}15`,
                  color: labelClass(t.evtType),
                  whiteSpace: "nowrap",
                }}
              >
                {prettyType(t.evtType)}
              </div>

              {/* Time */}
              {t.ts && (
                <div className="small muted" style={{ whiteSpace: "nowrap" }}>
                  {timeAgo(t.ts)}
                </div>
              )}
            </div>

            {/* Beträge */}
            <div style={{ textAlign: "right", minWidth: 120 }}>
              <div style={{ fontWeight: 700, color: "#ddd" }}>
                {fmtSol(t.amountSol)} SOL
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {fmtDmd(t.amountDmd)} DMD
              </div>
            </div>

            {/* Signature Link */}
            {t.sig ? (
              <a
                href={explorer(t.sig)}
                target="_blank"
                rel="noreferrer"
                className="small muted mono"
                style={{
                  whiteSpace: "nowrap",
                  alignSelf: "center",
                  color: "#aaa",
                  transition: "color .2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#f5c542")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa")}
                title={t.sig}
              >
                {shortSig(t.sig)}
              </a>
            ) : (
              <span className="small muted mono" style={{ whiteSpace: "nowrap", alignSelf: "center" }}>
                —
              </span>
            )}
          </div>
        ))
      ) : (
        <div
          className="small muted"
          style={{
            padding: "40px 20px",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: "var(--gold)", fontWeight: 700 }}>WIP</span>{" "}
          · {wipText || "On-Chain Feed wird gerade integriert. Erste Transaktionen erscheinen bald."}
        </div>
      )}
    </div>
  );
}