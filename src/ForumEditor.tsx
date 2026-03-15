import React, { useMemo, useState } from "react";
import { postThread } from "./forumClient";

type Props = {
  walletPk?: string;
  apiBase?: string;
  onPosted?: () => void;
};

const TITLE_MAX = 120;
const BODY_MAX = 5000;
const TAG_MAX = 10;

function sanitizeTags(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, TAG_MAX);
}

export default function ForumEditor({ walletPk, apiBase = "", onPosted }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("DMD,Feedback");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const backendReady = useMemo(() => apiBase.trim().length > 0, [apiBase]);

  const titleLeft = TITLE_MAX - title.length;
  const bodyLeft = BODY_MAX - body.length;

  async function submit() {
    if (!walletPk) {
      setStatus("Bitte Wallet verbinden.");
      return;
    }

    if (!backendReady) {
      setStatus("Forum-Posting ist ohne Backend deaktiviert.");
      return;
    }

    try {
      setBusy(true);
      setStatus("");

      await postThread(apiBase, walletPk, title, body, sanitizeTags(tags));

      setTitle("");
      setBody("");
      setStatus("Thread erstellt.");
      onPosted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg || "Fehler beim Posten.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-white/80 font-semibold">Neuen Thread erstellen</div>

      <input
        className="input"
        placeholder="Titel"
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        disabled={!backendReady || busy}
      />
      <div className="small muted">{titleLeft} Zeichen übrig</div>

      <textarea
        className="input"
        rows={5}
        placeholder="Dein Beitrag..."
        value={body}
        maxLength={BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        disabled={!backendReady || busy}
      />
      <div className="small muted">{bodyLeft} Zeichen übrig</div>

      <input
        className="input"
        placeholder="Tags (kommagetrennt)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        disabled={!backendReady || busy}
      />

      <button className="btn" onClick={submit} disabled={!backendReady || busy}>
        {busy ? "Sende..." : "Posten"}
      </button>

      <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
        {backendReady
          ? "Mode: API-only"
          : "Posting deaktiviert: Kein Forum-Backend konfiguriert."}
      </div>

      {status ? (
        <div className="small" style={{ color: status === "Thread erstellt." ? "#9be7a3" : "#ffb4b4" }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}