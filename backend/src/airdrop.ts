// src/AirdropPreview.tsx
import React, { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

type PreviewPlan = {
  recipients: number;
  totalDmd: number;
  rows?: Array<{ wallet: string; dmd: number }>;
  errors?: string[];
  source?: "backend" | "local";
};

function isValidSolanaAddress(s: string): boolean {
  try {
    // PublicKey ctor validates base58 + length
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function parseCsv(csv: string): { rows: Array<{ wallet: string; dmd: number }>; errors: string[] } {
  const errors: string[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errors: ["CSV ist leer."] };

  // allow header but don't require exact casing
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("wallet") && first.includes("dmd");

  const startIdx = hasHeader ? 1 : 0;
  if (!hasHeader) {
    errors.push("Hinweis: Header fehlt. Erwartet: wallet,dmd");
  }

  const rows: Array<{ wallet: string; dmd: number }> = [];

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Zeile ${i + 1}: Ungültiges Format (wallet,dmd).`);
      continue;
    }
    const wallet = parts[0];
    const dmd = Number(parts[1]);

    if (!wallet || !isValidSolanaAddress(wallet)) {
      errors.push(`Zeile ${i + 1}: Wallet ungültig: "${wallet}"`);
      continue;
    }
    if (!Number.isFinite(dmd) || dmd <= 0) {
      errors.push(`Zeile ${i + 1}: DMD ungültig (muss > 0 sein): "${parts[1]}"`);
      continue;
    }

    rows.push({ wallet, dmd });
  }

  return { rows, errors };
}

function sumDmd(rows: Array<{ wallet: string; dmd: number }>) {
  return rows.reduce((a, b) => a + b.dmd, 0);
}

export default function AirdropPreview(): JSX.Element {
  const [csv, setCsv] = useState<string>("wallet,dmd\n");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const localParsed = useMemo(() => parseCsv(csv), [csv]);
  const localPlan = useMemo<PreviewPlan>(() => {
    const total = sumDmd(localParsed.rows);
    return {
      recipients: localParsed.rows.length,
      totalDmd: total,
      rows: localParsed.rows,
      errors: localParsed.errors,
      source: "local",
    };
  }, [localParsed]);

  async function preview() {
    setBusy(true);
    setPlan(null);

    // 1) Try backend first (WIP backend route)
    try {
      const r = await fetch("/api/airdrop/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });

      if (r.ok) {
        const j = (await r.json()) as Partial<PreviewPlan>;
        setPlan({
          recipients: Number(j.recipients ?? 0),
          totalDmd: Number(j.totalDmd ?? 0),
          rows: Array.isArray(j.rows) ? (j.rows as any) : undefined,
          errors: Array.isArray(j.errors) ? (j.errors as string[]) : [],
          source: "backend",
        });
        setBusy(false);
        return;
      }
      // if backend exists but fails, fall back local
    } catch {
      // backend not available -> fallback local
    }

    // 2) Fallback local preview
    setPlan(localPlan);
    setBusy(false);
  }

  const show = plan ?? null;
  const usingBackend = show?.source === "backend";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <div className="card-title" style={{ letterSpacing: 1, opacity: 0.7 }}>
          FOUNDER – SMART AIRDROP PREVIEW
        </div>
        <div className="panel-title" style={{ color: "var(--gold)", marginTop: 6 }}>
          Smart Airdrop (Preview)
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          WIP: Aktuell nur Preview. On-Chain Airdrop kommt mit Backend + Batch-TX Builder.
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <div className="small muted">CSV Format: <span className="mono">wallet,dmd</span></div>

        <textarea
          rows={10}
          className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"wallet,dmd\n<wallet>,1000\n<wallet>,2500"}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={preview} disabled={busy}>
            {busy ? "Preview…" : "Preview"}
          </button>

          <button
            className="btn"
            onClick={() => setCsv("wallet,dmd\n")}
            disabled={busy}
            style={{ opacity: 0.9 }}
          >
            Reset
          </button>

          <button
            className="btn"
            onClick={() => {
              // quick example
              setCsv(
                "wallet,dmd\n" +
                  "AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT,1000\n" +
                  "CEUmazdgtbUCcQyLq6NCm4BuQbvCsYFzKsS5wdRvZehV,2500\n"
              );
            }}
            disabled={busy}
            style={{ opacity: 0.9 }}
          >
            Beispiel
          </button>
        </div>

        {/* live local validation hint (doesn't block) */}
        <div className="small muted" style={{ marginTop: 8 }}>
          Lokal erkannt: {localPlan.recipients} Recipient(s) · Gesamt: {Math.floor(localPlan.totalDmd).toLocaleString()} DMD
        </div>

        {localPlan.errors && localPlan.errors.length > 0 ? (
          <div className="small" style={{ color: "#ffb4b4", marginTop: 8, whiteSpace: "pre-wrap" }}>
            {localPlan.errors.slice(0, 8).map((e, i) => `• ${e}`).join("\n")}
            {localPlan.errors.length > 8 ? `\n… +${localPlan.errors.length - 8} weitere` : ""}
          </div>
        ) : null}
      </div>

      {show ? (
        <div className="card p-4 space-y-2">
          <div className="small muted">
            Quelle: {usingBackend ? "Backend" : "Local Fallback"} · Preview only
          </div>

          <div className="text-white/80">Recipients: {show.recipients}</div>
          <div className="text-white/80">
            Total DMD: {Math.floor(show.totalDmd).toLocaleString()}
          </div>

          {show.errors && show.errors.length > 0 ? (
            <div className="small" style={{ color: "#ffb4b4", whiteSpace: "pre-wrap" }}>
              {show.errors.slice(0, 10).map((e) => `• ${e}`).join("\n")}
              {show.errors.length > 10 ? `\n… +${show.errors.length - 10} weitere` : ""}
            </div>
          ) : null}

          <div className="text-white/60 text-xs">
            Hinweis: Dies ist nur eine Vorschau – kein On-Chain-Transfer.
          </div>
        </div>
      ) : null}
    </div>
  );
}