// src/forumClient.ts
// Forum Client – API first, fallback to localStorage (DEV/WIP)

export type ForumThread = {
  id: string;
  title: string;
  body: string;
  author: string; // wallet pubkey
  tags: string[];
  ts: number; // unix seconds
};

const LS_KEY = "dmd_forum_threads_v1";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeJson<T>(x: unknown, fallback: T): T {
  try {
    return (typeof x === "string" ? JSON.parse(x) : x) as T;
  } catch {
    return fallback;
  }
}

function lsRead(): ForumThread[] {
  const raw = localStorage.getItem(LS_KEY);
  const arr = safeJson<ForumThread[]>(raw ?? "[]", []);
  return Array.isArray(arr) ? arr : [];
}

function lsWrite(list: ForumThread[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 500)));
}

export async function getThreads(apiBase = ""): Promise<ForumThread[]> {
  // API attempt
  if (apiBase) {
    try {
      const r = await fetch(`${apiBase}/api/forum/threads`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        return Array.isArray(j) ? j : [];
      }
    } catch {
      // ignore -> fallback below
    }
  }

  // fallback (local)
  const list = lsRead();
  list.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return list;
}

// Optional signing (future backend verification)
export async function signMessageWithWallet(message: string): Promise<string> {
  const anyWin = window as any;
  const provider = anyWin?.solana;
  if (!provider?.signMessage) throw new Error("No wallet 'signMessage' found");
  const encoded = new TextEncoder().encode(message);
  const { signature } = await provider.signMessage(encoded, "utf8");
  // base58 encode
  // @ts-ignore
  const bs58 = (await import("bs58")).default;
  return bs58.encode(signature);
}

export async function postThread(
  apiBase: string,
  wallet: string,
  title: string,
  body: string,
  tags: string[] = []
) {
  const cleanTitle = (title || "").trim();
  const cleanBody = (body || "").trim();
  const cleanTags = (tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 10);

  if (!wallet) throw new Error("Wallet fehlt.");
  if (!cleanTitle) throw new Error("Titel fehlt.");
  if (!cleanBody) throw new Error("Beitrag fehlt.");

  // API first (if provided and reachable)
  if (apiBase) {
    try {
      const message = `Sign this to post on DMD Forum`;
      // signature optional; backend may require later
      let signature = "";
      try {
        signature = await signMessageWithWallet(message);
      } catch {
        signature = "";
      }

      const resp = await fetch(`${apiBase}/api/forum/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, message, signature, title: cleanTitle, body: cleanBody, tags: cleanTags }),
      });

      if (resp.ok) return resp.json();
      // if API exists but rejects -> still show error (no silent fallback)
      const txt = await resp.text().catch(() => "");
      throw new Error(txt || `HTTP ${resp.status}`);
    } catch (e) {
      // If apiBase was set intentionally, we keep the error.
      // If you want silent fallback even with apiBase, set apiBase="" in props.
      throw e;
    }
  }

  // Local fallback (DEV/WIP)
  const list = lsRead();
  const t: ForumThread = {
    id: uid(),
    title: cleanTitle,
    body: cleanBody,
    author: wallet,
    tags: cleanTags,
    ts: nowSec(),
  };
  list.unshift(t);
  lsWrite(list);

  return t;
}
