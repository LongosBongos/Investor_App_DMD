import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
const PORT = Number(process.env.PORT ?? 8787);
const connection = new Connection(process.env.RPC_URL!, 'confirmed');

const FOUNDER = process.env.FOUNDER_PUBKEY!;
const TREASURY = process.env.TREASURY_PUBKEY!;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

type EvtType = 'buy'|'sell'|'claim'|'transfer';
type DmdEvent = {
  sig: string;
  evt_type: EvtType;
  wallet: string;
  amount_dmd: number;
  amount_sol: number;
  ts: number; // ms
  is_founder: boolean;
  is_treasury: boolean;
};

const PUBLIC_EVENTS: DmdEvent[] = [];           // allgemein
const TREASURY_EVENTS: DmdEvent[] = [];         // nur Treasury
const FOUNDER_EVENTS: DmdEvent[] = [];          // nur Founder

const MAX_KEEP = 500; // max events im Speicher

function pushEvent(arr: DmdEvent[], e: DmdEvent) {
  arr.unshift(e);
  if (arr.length > MAX_KEEP) arr.pop();
}

function verifyHelius(req: any) {
  const sig = req.header('X-Helius-Signature') || '';
  const body = JSON.stringify(req.body);
  const secret = process.env.PUBLIC_HELIUS_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac)); }
  catch { return false; }
}

async function sendTelegram(chatId: string, text: string) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true
    });
  } catch (e) { console.error('tg send fail', (e as any)?.message); }
}

function detectType(logs: string[]): EvtType {
  if (logs?.some(l => l.includes('buy_dmd'))) return 'buy';
  if (logs?.some(l => l.includes('sell_dmd'))) return 'sell';
  if (logs?.some(l => l.includes('claim_reward'))) return 'claim';
  return 'transfer';
}

// Placeholder Preisfunktionen (ersetzbar durch Jupiter/Coingecko)
function getSolUsd(): number {
  return Number(process.env.SOL_USD_FALLBACK ?? 150);
}
function getDmdPerSol(): number {
  return Number(process.env.DMD_PER_SOL ?? 10000);
}

function parseEvent(ev: any): DmdEvent | null {
  const signature = ev?.signature;
  if (!signature) return null;
  const logs: string[] = ev?.logs ?? [];
  const evt_type = detectType(logs);
  const lamports = ev?.nativeTransfers?.[0]?.amount ?? 0;
  const amount_sol = lamports / 1e9;
  const amount_dmd = Number(ev?.metadata?.dmd ?? 0); // falls du custom metadata sendest
  const wallet = ev?.feePayer ?? ev?.signer ?? '';
  const ts = (ev?.timestamp ? ev.timestamp * 1000 : Date.now());
  const is_founder = wallet === FOUNDER;
  const is_treasury = wallet === TREASURY;
  return { sig: signature, evt_type, wallet, amount_dmd, amount_sol, ts, is_founder, is_treasury };
}

/* ================== WEBHOOK =================== */
app.post('/hel-wbhk', async (req, res) => {
  if (!verifyHelius(req)) return res.status(401).send('bad sig');

  const payload = Array.isArray(req.body) ? req.body : [req.body];
  for (const raw of payload) {
    const e = parseEvent(raw);
    if (!e) continue;

    // verteile in Feeds
    pushEvent(PUBLIC_EVENTS, e);
    if (e.is_treasury) pushEvent(TREASURY_EVENTS, e);
    if (e.is_founder) pushEvent(FOUNDER_EVENTS, e);

    // Alerts (einfacher MVP)
    const whale = Number(process.env.WHALE_DMD ?? 100000);
    if (e.evt_type === 'buy' && e.amount_dmd >= whale) {
      await sendTelegram(ADMIN_CHAT, `🟢 <b>Whale BUY</b>\n${Math.floor(e.amount_dmd).toLocaleString()} DMD (${e.amount_sol.toFixed(3)} SOL)\nTx: https://solscan.io/tx/${e.sig}`);
    }
    if (e.is_treasury) {
      await sendTelegram(ADMIN_CHAT, `🏦 <b>Treasury</b> Bewegung: ${e.amount_sol.toFixed(3)} SOL / ${Math.floor(e.amount_dmd)} DMD\nTx: https://solscan.io/tx/${e.sig}`);
    }
    if (e.is_founder) {
      await sendTelegram(ADMIN_CHAT, `👑 <b>Founder</b> Event: ${e.amount_sol.toFixed(3)} SOL / ${Math.floor(e.amount_dmd)} DMD\nTx: https://solscan.io/tx/${e.sig}`);
    }
  }

  res.send('ok');
});

/* ================== REST =================== */

// Stats (Vault/Treasury/Founder SOL)
app.get('/api/stats', async (_req, res) => {
  try {
    const [vaultSOL, treSOL, fouSOL] = await Promise.all([
      connection.getBalance(new PublicKey(process.env.VAULT_PDA!)),
      connection.getBalance(new PublicKey(process.env.TREASURY_PUBKEY!)),
      connection.getBalance(new PublicKey(process.env.FOUNDER_PUBKEY!)),
    ]);
    res.json({
      vaultSOL: vaultSOL / 1e9,
      treasurySOL: treSOL / 1e9,
      founderSOL: fouSOL / 1e9,
      publicSaleActive: true // optional: aus Vault-Account via Anchor lesen
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'stats_failed' });
  }
});

// Price
app.get('/api/price', (_req, res) => {
  const solUsd = getSolUsd();
  const dmdPerSol = getDmdPerSol();
  const dmdUsd = (1 / dmdPerSol) * solUsd;
  res.json({ solUsd, dmdPerSol, dmdUsd });
});

// Feeds
app.get('/api/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(PUBLIC_EVENTS.slice(0, limit));
});
app.get('/api/treasury-events', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(TREASURY_EVENTS.slice(0, limit));
});
app.get('/api/founder-events', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(FOUNDER_EVENTS.slice(0, limit));
});

app.listen(PORT, () => console.log(`🚀 DMD backend running on :${PORT}`));
