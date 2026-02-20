import React, { useState } from "react";
import { postThread } from "./forumClient";

type Props = {
  walletPk?: string;
  apiBase?: string; // lass leer => LocalStorage DEV Forum
  onPosted?: () => void;
};

export default function ForumEditor({ walletPk, apiBase = "", onPosted }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("DMD,Feedback");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!walletPk) return alert("Bitte Wallet verbinden.");

    try {
      setBusy(true);
      await postThread(
        apiBase,
        walletPk,
        title,
        body,
        tags.split(",").map((s) => s.trim()).filter(Boolean)
      );

      setTitle("");
      setBody("");
      alert("Thread erstellt.");
      onPosted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("Fehler beim Posten: " + (msg || "Unbekannter Fehler"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="text-white/80 font-semibold">Neuen Thread erstellen</div>

      <input
        className="input"
        placeholder="Titel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="input"
        rows={4}
        placeholder="Dein Beitrag..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <input
        className="input"
        placeholder="Tags (kommagetrennt)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />

      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? "Sende..." : "Posten"}
      </button>

      <div className="small muted" style={{ marginTop: 6 }}>
        {apiBase
          ? "Mode: API (Backend erforderlich)"
          : "Mode: LocalStorage (DEV/WIP – läuft sofort)"}
      </div>
    </div>
  );
}
