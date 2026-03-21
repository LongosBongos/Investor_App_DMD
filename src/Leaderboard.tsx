// src/Leaderboard.tsx
// ELITE ASSET-MANAGER EDITION — Premium On-Chain Holder Leaderboard
// Gold-Akzente, moderne Tabelle, Hover-Glow, Rank-Badges, Live-Indicator
import React, { useEffect, useMemo, useState } from "react";
import { Commitment, Connection, PublicKey } from "@solana/web3.js";
import {
  findVaultPda,
  ataFor as ataOf,
  PROTOCOL_OWNER,
  TREASURY,
  DMD_MINT,
} from "./solana";

// -------------------------
// Vite Env Typing
// -------------------------
interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

const CONFIRMED: Commitment = "confirmed";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const MAX_LARGEST_ACCOUNTS = 80;
const MAX_ROWS = 25;

// -------------------------
// Types
// -------------------------
type HolderRow = {
  rank: number;
  owner: string;
  tokenAccount: string;
  amount: number;
  pct: number;
};

function getRpcUrl(): string {
  const envRpc = import.meta.env.VITE_RPC_URL?.trim();
  const rpc = envRpc && envRpc.length > 0 ? envRpc : DEFAULT_RPC;
  if (rpc.includes("api-key=") || rpc.includes("apiKey=")) {
    throw new Error(
      "SECURITY: VITE_RPC_URL contains api-key. Remove it and use a keyless endpoint or a backend proxy."
    );
  }
  return rpc;
}

function shortPk(pk: string, a = 8, b = 8): string {
  return `${pk.slice(0, a)}…${pk.slice(-b)}`;
}

function fmtNum(x: number, d = 0): string {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(4)}%`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default function Leaderboard(): JSX.Element {
  const [rows, setRows] = useState<HolderRow[]>([]);
  const [supplyUi, setSupplyUi] = useState<number>(0);
  const [err, setErr] = useState<string>("");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [excludeSystemWallets, setExcludeSystemWallets] = useState<boolean>(true);

  const connection = useMemo(() => {
    const rpc = getRpcUrl();
    return new Connection(rpc, CONFIRMED);
  }, []);

  const vault = useMemo(() => findVaultPda(), []);
  const systemOwners = useMemo(() => {
    return new Set<string>([
      PROTOCOL_OWNER.toBase58(),
      TREASURY.toBase58(),
      vault.toBase58(),
    ]);
  }, [vault]);

  const systemTokenAccounts = useMemo(() => {
    const vAta = ataOf(vault, DMD_MINT);
    return new Set<string>([vAta.toBase58()]);
  }, [vault]);

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        setErr("");
        const s = await connection.getTokenSupply(DMD_MINT, CONFIRMED);
        const supply = Number(s.value.uiAmount ?? 0);
        if (!alive) return;
        setSupplyUi(supply);

        const largest = await connection.getTokenLargestAccounts(DMD_MINT, CONFIRMED);
        if (!alive) return;

        const top = largest.value.slice(0, MAX_LARGEST_ACCOUNTS);
        const enriched = await Promise.all(
          top.map(async (x) => {
            const ta = x.address;
            const tokenAccount = ta.toBase58();
            const amount = Number(x.uiAmount ?? 0) || 0;
            const ownerInfo = await connection.getParsedAccountInfo(ta, CONFIRMED);
            const owner = (ownerInfo.value?.data as any)?.parsed?.info?.owner || "";
            return { tokenAccount, owner, amount };
          })
        );

        if (!alive) return;

        const cleaned = enriched
          .filter((it) => it.owner && it.amount > 0)
          .filter((it) => {
            if (!excludeSystemWallets) return true;
            if (systemOwners.has(it.owner)) return false;
            if (systemTokenAccounts.has(it.tokenAccount)) return false;
            return true;
          })
          .sort((a, b) => b.amount - a.amount);

        const finalRows: HolderRow[] = cleaned.slice(0, MAX_ROWS).map((it, idx) => {
          const pct = supply > 0 ? (it.amount / supply) * 100 : 0;
          return {
            rank: idx + 1,
            owner: it.owner,
            tokenAccount: it.tokenAccount,
            amount: it.amount,
            pct,
          };
        });

        setRows(finalRows);
        setLastUpdate(new Date().toLocaleTimeString());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!alive) return;
        setErr(msg);
        setRows([]);
      }
    }

    void pull();
    const iv = window.setInterval(() => void pull(), 20000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection, excludeSystemWallets, systemOwners, systemTokenAccounts]);

  const maxPct = useMemo(() => {
    return rows.length ? Math.max(...rows.map((r) => r.pct)) : 1;
  }, [rows]);

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <div className="card-title" style={{ letterSpacing: 1, opacity: 0.7 }}>
            DMD HOLDER
          </div>
          <div className="panel-title" style={{ color: "var(--gold)", marginTop: 6 }}>
            On-Chain Leaderboard
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Supply: {supplyUi ? fmtNum(supplyUi, 0) : "—"} DMD
            {lastUpdate && ` · Update: ${lastUpdate}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label
            className="small muted"
            style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={excludeSystemWallets}
              onChange={(e) => setExcludeSystemWallets(e.target.checked)}
            />
            Exclude Protocol / Treasury / Vault
          </label>
          <a
            className="btn"
            href={`https://solscan.io/token/${DMD_MINT.toBase58()}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--gold)" }}
          >
            Open Solscan
          </a>
        </div>
      </div>

      {err && (
        <div className="panel" style={{ marginTop: 16, color: "#ffb4b4" }}>
          Fehler: {err}
        </div>
      )}

      <div
        className="panel"
        style={{
          background: "rgba(15,15,15,0.98)",
          border: "1px solid rgba(255,215,0,0.12)",
          padding: "24px",
          borderRadius: 16,
        }}
      >
        <div className="panel-title" style={{ marginBottom: 16 }}>
          TOP HOLDERS (Wallets)
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#aaa", textAlign: "left", fontSize: "12px", fontWeight: 600 }}>
                <th style={{ padding: "12px 8px", width: 60 }}>#</th>
                <th style={{ padding: "12px 8px" }}>WALLET</th>
                <th style={{ padding: "12px 8px", textAlign: "right" }}>DMD</th>
                <th style={{ padding: "12px 8px", textAlign: "right" }}>% SUPPLY</th>
                <th style={{ padding: "12px 8px", textAlign: "right", width: 180 }}>SHARE</th>
                <th style={{ padding: "12px 8px", textAlign: "right" }}>LINKS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const barWidth = clamp01(r.pct / maxPct) * 100;
                return (
                  <tr
                    key={r.tokenAccount}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,197,66,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 8px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          minWidth: 32,
                          justifyContent: "center",
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "rgba(245,197,66,0.15)",
                          color: "#f5c542",
                          fontWeight: 800,
                          fontSize: "13px",
                        }}
                      >
                        {r.rank}
                      </span>
                    </td>
                    <td style={{ padding: "14px 8px" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#ddd" }}>
                        {shortPk(r.owner)}
                      </div>
                    </td>
                    <td style={{ padding: "14px 8px", textAlign: "right", fontWeight: 700 }}>
                      {fmtNum(r.amount, 0)}
                    </td>
                    <td style={{ padding: "14px 8px", textAlign: "right", color: "#aaa" }}>
                      {fmtPct(r.pct)}
                    </td>
                    <td style={{ padding: "14px 8px", textAlign: "right" }}>
                      <div
                        style={{
                          height: 8,
                          width: 160,
                          background: "rgba(255,255,255,0.08)",
                          borderRadius: 999,
                          overflow: "hidden",
                          display: "inline-block",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${barWidth}%`,
                            background: "linear-gradient(90deg, #f5c542, #d8b23a)",
                            borderRadius: 999,
                            transition: "width 1s ease",
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: "14px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <a
                        href={`https://solscan.io/account/${r.owner}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--gold)", marginRight: 12 }}
                      >
                        Wallet
                      </a>
                      <a
                        href={`https://solscan.io/account/${r.tokenAccount}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#aaa" }}
                      >
                        Token
                      </a>
                    </td>
                  </tr>
                );
              })}

              {!rows.length && !err && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#666" }}>
                    Lade Top Holder…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="small muted" style={{ marginTop: 20, lineHeight: 1.6 }}>
          Hinweis: Das Ranking basiert auf <code>getTokenLargestAccounts</code>. 
          System-Wallets (Vault, Treasury, Protocol Owner) sind standardmäßig ausgeblendet.
        </div>
      </div>
    </div>
  );
}