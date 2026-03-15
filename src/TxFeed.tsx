// src/TxFeed.tsx
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
  return sig ? `${sig.slice(0, 4)}…${sig.slice(-4)}` : "—";
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
  if (evt === "buy") return "buy";
  if (evt === "sell") return "sell";
  if (evt === "claim") return "claim";
  if (evt === "whitelist") return "whitelist";
  if (evt === "airdrop") return "airdrop";
  return "unknown";
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
    <div className="card panel">
      <div className="panel-title">{title}</div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Letzte Ereignisse
      </div>

      {!empty ? (
        sorted.map((t, i) => (
          <div
            key={`${t.sig || "nosig"}-${t.ts || 0}-${i}`}
            className="tx-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className={`label ${labelClass(t.evtType)}`}>
                  {prettyType(t.evtType)}
                </span>

                {t.ts ? (
                  <span className="small muted">{timeAgo(t.ts)}</span>
                ) : null}
              </div>

              <div className="small muted" style={{ marginTop: 4 }}>
                {fmtSol(t.amountSol)} SOL · {fmtDmd(t.amountDmd)} DMD
              </div>
            </div>

            {t.sig ? (
              <a
                className="small muted mono"
                href={explorer(t.sig)}
                target="_blank"
                rel="noreferrer"
                style={{ whiteSpace: "nowrap", alignSelf: "center" }}
                title={t.sig}
              >
                {shortSig(t.sig)}
              </a>
            ) : (
              <span
                className="small muted mono"
                style={{ whiteSpace: "nowrap", alignSelf: "center" }}
              >
                —
              </span>
            )}
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