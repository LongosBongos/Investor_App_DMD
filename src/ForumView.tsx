import { useEffect, useMemo, useState } from "react";
import ForumEditor from "./ForumEditor";
import { ForumThread, getThreads } from "./forumClient";

export default function ForumView({
  walletPk,
  apiBase = "",
}: {
  walletPk?: string;
  apiBase?: string;
}) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const backendReady = useMemo(() => apiBase.trim().length > 0, [apiBase]);

  const load = async () => {
    if (!backendReady) {
      setThreads([]);
      setErr("Forum ist ohne Backend im Read-Only-Hinweismodus.");
      return;
    }

    try {
      setLoading(true);
      setErr("");
      const list = await getThreads(apiBase);
      setThreads(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg || "Fehler beim Laden.");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {!backendReady ? (
        <div className="card p-4">
          <div className="text-white/80 font-semibold">Community Forum</div>
          <div className="small muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
            Das Forum ist in dieser Investor-App ohne angebundenes Backend absichtlich nicht aktiv.
            Dadurch gibt es keinen unsauberen LocalStorage-Modus und keine lokal manipulierbaren Threads.
          </div>
        </div>
      ) : null}

      {backendReady ? (
        <>
          {err ? (
            <div className="small" style={{ color: "#ffb4b4" }}>
              {err}
            </div>
          ) : null}

          <ForumEditor walletPk={walletPk} apiBase={apiBase} onPosted={load} />

          <div className="space-y-4">
            {loading ? (
              <div className="text-white/50">Lade Beiträge…</div>
            ) : null}

            {!loading &&
              threads.map((t) => (
                <div key={t.id} className="card p-4">
                  <div className="text-lg font-semibold">{t.title}</div>
                  <div className="text-sm text-white/80 mt-1" style={{ whiteSpace: "pre-wrap" }}>
                    {t.body}
                  </div>

                  {t.tags?.length ? (
                    <div className="text-xs text-white/50 mt-2">
                      Tags: {t.tags.join(", ")}
                    </div>
                  ) : null}

                  <div className="text-xs text-white/50 mt-1">
                    von {t.author.slice(0, 6)}…{t.author.slice(-4)} ·{" "}
                    {new Date((t.ts ?? 0) * 1000).toLocaleString()}
                  </div>
                </div>
              ))}

            {!loading && !threads.length && !err ? (
              <div className="text-white/50">Noch keine Beiträge.</div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}