import React, { useEffect, useMemo, useState } from "react";
import { Connection, Commitment, PublicKey } from "@solana/web3.js";
import { findVaultPda, ataFor as ataOf, FOUNDER, TREASURY, DMD_MINT } from "./solana";

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

// -------------------------
// Types
// -------------------------
type HolderRow = {
  rank: number;
  owner: string;       // wallet address
  tokenAccount: string;
  amount: number;      // ui amount
  pct: number;         // % of supply
};

function shortPk(pk: string, a = 6, b = 6) {
  return `${pk.slice(0, a)}…${pk.slice(-b)}`;
}

function fmtNum(x: number, d = 0) {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(4)}%`;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function getParsedOwner(parsed: unknown): string | null {
  // parsed?.info?.owner
  if (!isRecord(parsed)) return null;
  const info = parsed["info"];
  if (!isRecord(info)) return null;
  const owner = info["owner"];
  return typeof owner === "string" ? owner : null;
}

async function getMintSupplyUi(connection: Connection, mint: PublicKey): Promise<number> {
  const s = await connection.getTokenSupply(mint, CONFIRMED);
  return Number(s.value.uiAmount ?? 0);
}

async function getOwnerOfTokenAccount(connection: Connection, tokenAccount: PublicKey): Promise<string | null> {
  const ai = await connection.getParsedAccountInfo(tokenAccount, CONFIRMED);
  const data = ai.value?.data;

  // parsed token account response shape:
  // { program: 'spl-token', parsed: { type: 'account', info: { owner: '...' } }, space: ... }
  if (!isRecord(data)) return null;
  const parsed = data["parsed"];
  if (!isRecord(parsed)) return null;
  return getParsedOwner(parsed);
}

async function getUiAmountOfTokenAccount(connection: Connection, tokenAccount: PublicKey): Promise<number> {
  const b = await connection.getTokenAccountBalance(tokenAccount, CONFIRMED);
  return Number(b.value.uiAmount ?? 0);
}

export default function Leaderboard(): JSX.Element {
  const [rows, setRows] = useState<HolderRow[]>([]);
  const [supplyUi, setSupplyUi] = useState<number>(0);
  const [err, setErr] = useState<string>("");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [excludeSystemWallets, setExcludeSystemWallets] = useState<boolean>(true);

  const connection = useMemo(() => {
    const rpc =
      import.meta.env.VITE_RPC_URL ??
      "https://mainnet.helius-rpc.com/?api-key=cba27cb3-9d36-4095-ae3a-4025bc7ff611";
    return new Connection(rpc, CONFIRMED);
  }, []);

  const vault = useMemo(() => findVaultPda(), []);

  const systemOwners = useMemo(() => {
    // Owner-Adressen die “System” sind (Founder/Treasury/Vault PDA)
    return new Set<string>([
      FOUNDER.toBase58(),
      TREASURY.toBase58(),
      vault.toBase58(),
    ]);
  }, [vault]);

  const systemTokenAccounts = useMemo(() => {
    // z.B. Vault ATA
    const vAta = ataOf(vault, DMD_MINT);
    return new Set<string>([vAta.toBase58()]);
  }, [vault]);

  useEffect(() => {
    let alive = true;

    async function pull() {
      try {
        setErr("");

        // 1) Supply
        const s = await getMintSupplyUi(connection, DMD_MINT);
        if (!alive) return;
        setSupplyUi(s);

        // 2) Largest token accounts (load more, then filter)
        const largest = await connection.getTokenLargestAccounts(DMD_MINT, CONFIRMED);
        if (!alive) return;

        // Pull deeper to survive filtering (LP/system accounts etc.)
        const top = largest.value.slice(0, 60);

        // 3) Resolve owners + amounts
        const enriched = await Promise.all(
          top.map(async (x) => {
            const ta = x.address;
            const tokenAccount = ta.toBase58();

            // Some RPCs include uiAmount; fallback to balance call if needed
            const uiMaybe = (x as unknown as { uiAmount?: number }).uiAmount;
            const amount = (typeof uiMaybe === "number" && Number.isFinite(uiMaybe) && uiMaybe > 0)
              ? uiMaybe
              : await getUiAmountOfTokenAccount(connection, ta);

            const owner = await getOwnerOfTokenAccount(connection, ta);

            return { tokenAccount, owner, amount };
          })
        );

        if (!alive) return;

        // 4) Filter + sort + rank
        const cleaned = enriched
          .filter((it) => it.owner && it.amount > 0)
          .filter((it) => {
            if (!excludeSystemWallets) return true;
            if (systemOwners.has(it.owner as string)) return false;
            if (systemTokenAccounts.has(it.tokenAccount)) return false;
            return true;
          })
          .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

        const finalRows: HolderRow[] = cleaned.slice(0, 25).map((it, idx) => {
          const pct = s > 0 ? (it.amount / s) * 100 : 0;
          return {
            rank: idx + 1,
            owner: it.owner as string,
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

    pull();
    const iv = window.setInterval(pull, 20_000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [connection, excludeSystemWallets, systemOwners, systemTokenAccounts]);

  const maxPct = useMemo(() => {
    const m = rows.reduce((acc, r) => Math.max(acc, r.pct), 0);
    return m > 0 ? m : 1;
  }, [rows]);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="card-title" style={{ letterSpacing: 1, opacity: 0.7 }}>
            DMD HOLDER
          </div>
          <div className="panel-title" style={{ color: "var(--gold)", marginTop: 6 }}>
            On-Chain Holder Leaderboard
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Supply: {supplyUi ? fmtNum(supplyUi, 0) : "—"} DMD
            {lastUpdate ? ` · Update: ${lastUpdate}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={excludeSystemWallets}
              onChange={(e) => setExcludeSystemWallets(e.target.checked)}
            />
            Exclude Founder/Treasury/Vault
          </label>

          <a
            className="btn"
            href={`https://solscan.io/token/${DMD_MINT.toBase58()}`}
            target="_blank"
            rel="noreferrer"
          >
            Open Solscan
          </a>
        </div>
      </div>

      {err && (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="small" style={{ color: "#ffb4b4" }}>
            Fehler: {err}
          </p>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">Top Holder (Wallets)</div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.6)", textAlign: "left" }}>
                <th style={{ padding: "10px 8px", width: 48 }}>#</th>
                <th style={{ padding: "10px 8px" }}>Wallet</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>DMD</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>% Supply</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Share</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Links</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const bar = clamp01(r.pct / maxPct);
                return (
                  <tr
                    key={r.tokenAccount}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          minWidth: 28,
                          justifyContent: "center",
                          padding: "3px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(245,197,66,0.10)",
                          color: "var(--gold)",
                          fontWeight: 700,
                        }}
                      >
                        {r.rank}
                      </span>
                    </td>

                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                        {shortPk(r.owner, 8, 8)}
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {r.owner}
                      </div>
                    </td>

                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>
                      {fmtNum(r.amount, 0)}
                    </td>

                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      {fmtPct(r.pct)}
                    </td>

                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      <div
                        style={{
                          height: 10,
                          width: 140,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                          display: "inline-block",
                          verticalAlign: "middle",
                        }}
                        title={fmtPct(r.pct)}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${bar * 100}%`,
                            background: "rgba(245,197,66,0.85)",
                          }}
                        />
                      </div>
                    </td>

                    <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <a
                        href={`https://solscan.io/account/${r.owner}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--gold)", marginRight: 10 }}
                      >
                        Wallet
                      </a>
                      <a
                        href={`https://solscan.io/account/${r.tokenAccount}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "rgba(255,255,255,0.75)" }}
                      >
                        TokenAcc
                      </a>
                    </td>
                  </tr>
                );
              })}

              {!rows.length && !err && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "rgba(255,255,255,0.55)" }}>
                    Lade Holder…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="small muted" style={{ marginTop: 12 }}>
          Hinweis: “Top Holder” basiert auf <code>getTokenLargestAccounts</code> (SPL Token Accounts).
          
        </p>
      </div>
    </div>
  );
}