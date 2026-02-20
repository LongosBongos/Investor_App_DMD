import { useEffect, useState } from "react";
import ForumEditor from "./ForumEditor";
import { getThreads, ForumThread } from "./forumClient";

export default function ForumView({ walletPk, apiBase = "" }: { walletPk?: string; apiBase?: string }) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [err, setErr] = useState<string>("");

  const load = async () => {
    try {
      setErr("");
      const list = await getThreads(apiBase);
      setThreads(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg || "Fehler beim Laden.");
      setThreads([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {err ? <div className="small" style={{ color: "#ffb4b4" }}>{err}</div> : null}

      <ForumEditor walletPk={walletPk} apiBase={apiBase} onPosted={load} />

      <div className="space-y-4">
        {threads.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="text-lg font-semibold">{t.title}</div>
            <div className="text-sm text-white/80 mt-1">{t.body}</div>
            <div className="text-xs text-white/50 mt-1">
              von {t.author.slice(0, 6)}…{t.author.slice(-4)} · {new Date((t.ts ?? 0) * 1000).toLocaleString()}
            </div>
          </div>
        ))}
        {!threads.length && <div className="text-white/50">Noch keine Beiträge.</div>}
      </div>
    </div>
  );
}