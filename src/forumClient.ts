// src/forumClient.ts
// Hardened forum client for Investor_App_DMD
// No localStorage fallback in production path.
// API-only. If no backend is configured, read/write stays disabled.

export type ForumThread = {
  id: string;
  title: string;
  body: string;
  author: string;
  tags: string[];
  ts: number;
};

export type ForumPostPayload = {
  wallet: string;
  title: string;
  body: string;
  tags: string[];
};

const HTTP_TIMEOUT_MS = 7000;
const TITLE_MAX = 120;
const BODY_MAX = 5000;
const TAG_MAX = 10;
const TAG_LEN_MAX = 24;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function normalizeString(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function clampText(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizeBody(value: string, max: number): string {
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) => clampText(String(t || ""), TAG_LEN_MAX))
    .filter(Boolean)
    .slice(0, TAG_MAX);

  return [...new Set(clean)];
}

function normalizeThread(x: unknown): ForumThread | null {
  if (!isRecord(x)) return null;

  const id = normalizeString(x.id).trim();
  const title = normalizeString(x.title).trim();
  const body = normalizeString(x.body).trim();
  const author = normalizeString(x.author).trim();
  const ts = Number(x.ts);
  const tags = Array.isArray(x.tags)
    ? x.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, TAG_MAX)
    : [];

  if (!id || !title || !body || !author || !Number.isFinite(ts) || ts <= 0) {
    return null;
  }

  return { id, title, body, author, ts, tags };
}

function normalizeThreadList(x: unknown): ForumThread[] {
  if (!Array.isArray(x)) return [];
  return x
    .map(normalizeThread)
    .filter((t): t is ForumThread => t !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200);
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = HTTP_TIMEOUT_MS
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`Non-JSON response (${ct})`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export function validateForumApiBase(apiBase = ""): string {
  const base = apiBase.trim();

  if (!base) {
    throw new Error("Forum backend is not configured.");
  }

  if (!/^https?:\/\//i.test(base) && !base.startsWith("/")) {
    throw new Error("Forum backend URL is invalid.");
  }

  return base.replace(/\/+$/, "");
}

export async function getThreads(apiBase = ""): Promise<ForumThread[]> {
  const base = validateForumApiBase(apiBase);
  const json = await fetchJson(`${base}/api/forum/threads`);
  return normalizeThreadList(json);
}

export async function postThread(
  apiBase: string,
  wallet: string,
  title: string,
  body: string,
  tags: string[] = []
): Promise<ForumThread> {
  const base = validateForumApiBase(apiBase);

  const cleanWallet = String(wallet || "").trim();
  const cleanTitle = clampText(String(title || ""), TITLE_MAX);
  const cleanBody = normalizeBody(String(body || ""), BODY_MAX);
  const cleanTags = normalizeTags(tags);

  if (!cleanWallet) throw new Error("Wallet fehlt.");
  if (!cleanTitle) throw new Error("Titel fehlt.");
  if (!cleanBody) throw new Error("Beitrag fehlt.");

  const payload: ForumPostPayload = {
    wallet: cleanWallet,
    title: cleanTitle,
    body: cleanBody,
    tags: cleanTags,
  };

  const json = await fetchJson(`${base}/api/forum/thread`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const thread = normalizeThread(json);
  if (!thread) {
    throw new Error("Ungültige Forum-Antwort vom Backend.");
  }

  return thread;
}