// src/AirdropPreview.tsx
import React, { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

type PreviewRow = {
  wallet: string;
  dmd: number;
};

type PreviewPlan = {
  recipients: number;
  totalDmd: number;
  rows?: PreviewRow[];
  errors?: string[];
  source?: "backend";
};

const CSV_MAX_LEN = 200_000;
const MAX_ROWS = 2000;
const DMD_DECIMALS_MAX = 9;

function isValidSolanaAddress(s: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function normalizeCsvInput(value: string): string {
  return value.replace(/\r\n/g, "\n").slice(0, CSV_MAX_LEN);
}

function safeNumber(input: string): number {
  const n = Number(input.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function roundDmd(value: number): number {
  return Number(value.toFixed(DMD_DECIMALS_MAX));
}

function parseCsvLocal(csv: string): { rows: PreviewRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = normalizeCsvInput(csv)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["CSV ist leer."] };
  }

  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("wallet") && first.includes("dmd");
  const startIdx = hasHeader ? 1 : 0;

  if (!hasHeader) {
    errors.push('Hinweis: Header fehlt. Erwartet z. B. "wallet,dmd".');
  }

  const rows: PreviewRow[] = [];
  const seen = new Set<string>();

  for (let i = startIdx; i < lines.length; i++) {
    if (rows.length >= MAX_ROWS) {
      errors.push(`Maximale Zeilenzahl erreicht (${MAX_ROWS}).`);
      break;
    }

    const raw = lines[i];
    const parts = raw.split(",").map((p) => p.trim());

    if (parts.length < 2) {
      errors.push(`Zeile ${i + 1}: Ungültiges Format. Erwartet: wallet,dmd`);
      continue;
    }

    const wallet = parts[0];
    const dmd = safeNumber(parts[1]);

    if (!wallet || !isValidSolanaAddress(wallet)) {
      errors.push(`Zeile ${i + 1}: Wallet ungültig: "${wallet}"`);
      continue;
    }

    if (!Number.isFinite(dmd) || dmd <= 0) {
      errors.push(`Zeile ${i + 1}: DMD ungültig (muss > 0 sein): "${parts[1]}"`);
      continue;
    }

    if (seen.has(wallet)) {
      errors.push(`Zeile ${i + 1}: Wallet doppelt vorhanden: "${wallet}"`);
      continue;
    }

    seen.add(wallet);
    rows.push({
      wallet,
      dmd: roundDmd(dmd),
    });
  }

  return { rows, errors };
}

function sumDmd(rows: PreviewRow[]): number {
  return roundDmd(rows.reduce((a, b) => a + b.dmd, 0));
}

function normalizeBackendPlan(x: unknown): PreviewPlan | null {
  if (typeof x !== "object" || x === null) return null;
  const obj = x as Record<string, unknown>;

  const recipients = Number(obj.recipients ?? 0);
  const totalDmd = Number(obj.totalDmd ?? 0);

  const rows = Array.isArray(obj.rows)
    ? obj.rows
        .map((r) => {
          if (typeof r !== "object" || r === null) return null;
          const rec = r as Record<string, unknown>;
          const wallet = String(rec.wallet ?? "").trim();
          const dmd = Number(rec.dmd ?? 0);
          if (!wallet || !isValidSolanaAddress(wallet) || !Number.isFinite(dmd) || dmd <= 0) {
            return null;
          }
          return { wallet, dmd: roundDmd(dmd) };
        })
        .filter((r): r is PreviewRow => r !== null)
    : undefined;

  const errors = Array.isArray(obj.errors)
    ? obj.errors.map((e) => String(e)).slice(0, 500)
    : [];

  if (!Number.isFinite(recipients) || recipients < 0) return null;
  if (!Number.isFinite(totalDmd) || totalDmd < 0) return null;

  return {
    recipients,
    totalDmd: roundDmd(totalDmd),
    rows,
    errors,
    source: "backend",
  };
}

async function fetchPreviewFromBackend(csv: string): Promise<PreviewPlan> {
  const response = await fetch("/api/airdrop/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ csv }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Non-JSON response (${ct})`);
  }

  const json = await response.json();
  const plan = normalizeBackendPlan(json);

  if (!plan) {
    throw new Error("Ungültige Preview-Antwort vom Backend.");
  }

  return plan;
}

export default function AirdropPreview(): JSX.Element {
  const [csv, setCsv] = useState<string>("wallet,dmd\n");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  const normalizedCsv = useMemo(() => normalizeCsvInput(csv), [csv]);
  const localParsed = useMemo(() => parseCsvLocal(normalizedCsv), [normalizedCsv]);

  async function preview() {
    setBusy(true);
    setPlan(null);
    setStatus("");

    try {
      const nextPlan = await fetchPreviewFromBackend(normalizedCsv);
      setPlan(nextPlan);
      setStatus("Preview vom Backend geladen.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Backend-Preview nicht verfügbar: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const localRows = localParsed.rows.length;
  const localTotal = sumDmd(localParsed.rows);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <div className="card-title" style={{ letterSpacing: 1, opacity: 0.7 }}>
          PROTOCOL OWNER
        </div>
        <div className="panel-title" style={{ color: "var(--gold)", marginTop: 6 }}>
          Smart Airdrop (Preview)
        </div>
        <div className="small muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
          Dieser Bereich ist absichtlich nur eine kontrollierte Preview-Oberfläche.
          <br />
          Kein lokaler Fallback, kein stiller DEV-Modus, keine On-Chain-Ausführung in der Investor-App.
        </div>
      </div>

      <div className="card panel" style={{ padding: 20 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>
          CSV Input
        </div>

        <textarea
          className="input"
          rows={14}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          spellCheck={false}
          placeholder={"wallet,dmd\n...\n"}
          disabled={busy}
          style={{ width: "100%", resize: "vertical" }}
        />

        <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          Erwartetes Format: <b>wallet,dmd</b>
          <br />
          Max. {MAX_ROWS} Zeilen · max. {CSV_MAX_LEN.toLocaleString()} Zeichen
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn" onClick={preview} disabled={busy}>
            {busy ? "Prüfe..." : "Backend Preview"}
          </button>
        </div>

        {status ? (
          <div className="small muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {status}
          </div>
        ) : null}
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card panel" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>
            Lokale Vorprüfung
          </div>

          <div className="kv">
            <span>Empfänger</span>
            <b>{localRows}</b>
          </div>

          <div className="kv">
            <span>Total DMD</span>
            <b>{localTotal.toLocaleString()}</b>
          </div>

          <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
            Diese Vorprüfung dient nur der Eingabekontrolle im Browser.
            <br />
            Maßgeblich bleibt die Backend-Preview.
          </div>
        </div>

        <div className="card panel" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>
            Backend Preview
          </div>

          <div className="kv">
            <span>Quelle</span>
            <b>{plan?.source ?? "—"}</b>
          </div>

          <div className="kv">
            <span>Empfänger</span>
            <b>{plan?.recipients ?? "—"}</b>
          </div>

          <div className="kv">
            <span>Total DMD</span>
            <b>{plan ? plan.totalDmd.toLocaleString() : "—"}</b>
          </div>

          <div className="small muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
            Ohne funktionierendes Backend bleibt nur die lokale Validierung sichtbar.
          </div>
        </div>
      </div>

      {localParsed.errors.length > 0 && (
        <div className="card panel" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>
            Lokale Validierungsfehler
          </div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {localParsed.errors.slice(0, 100).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {plan?.errors && plan.errors.length > 0 && (
        <div className="card panel" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>
            Backend-Hinweise / Fehler
          </div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {plan.errors.slice(0, 100).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {plan?.rows && plan.rows.length > 0 && (
        <div className="card panel" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>
            Preview Rows
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {plan.rows.slice(0, 200).map((row, i) => (
              <div
                key={`${row.wallet}-${i}`}
                className="kv"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <span
                  className="small muted"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "72%",
                  }}
                  title={row.wallet}
                >
                  {row.wallet}
                </span>
                <b>{row.dmd.toLocaleString()} DMD</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}