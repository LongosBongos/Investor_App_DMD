import 'dotenv/config';
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const forumRouter = express.Router();
const connection = new Connection(process.env.RPC_URL!, 'confirmed');

type Thread = {
  id: string;
  author: string;
  title: string;
  body: string;
  tags: string[];
  created: number;
};
type Reply = {
  id: string;
  threadId: string;
  author: string;
  body: string;
  created: number;
};

const threads: Thread[] = [];
const replies: Reply[] = [];

function verifySignature(wallet: string, message: string, signature: string): boolean {
  try {
    const pubkey = new PublicKey(wallet);
    const sigBytes = bs58.decode(signature);
    const msgBytes = new TextEncoder().encode(message);
    return pubkey.verify(msgBytes, sigBytes);
  } catch {
    return false;
  }
}

// Liste Threads
forumRouter.get('/forum/threads', (_req, res) => {
  res.json(threads.sort((a, b) => b.created - a.created));
});

// Hole Thread + Replies
forumRouter.get('/forum/thread/:id', (req, res) => {
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'not found' });
  const repliesList = replies.filter(r => r.threadId === thread.id);
  res.json({ thread, replies: repliesList });
});

// Neuer Thread
forumRouter.post('/forum/thread', (req, res) => {
  const { wallet, message, signature, title, body, tags } = req.body;
  if (!verifySignature(wallet, message, signature)) return res.status(401).send('invalid signature');
  const id = crypto.randomUUID();
  const thread: Thread = { id, author: wallet, title, body, tags: tags || [], created: Date.now() };
  threads.push(thread);
  res.json(thread);
});

// Antwort
forumRouter.post('/forum/reply', (req, res) => {
  const { wallet, message, signature, threadId, body } = req.body;
  if (!verifySignature(wallet, message, signature)) return res.status(401).send('invalid signature');
  const id = crypto.randomUUID();
  const reply: Reply = { id, threadId, author: wallet, body, created: Date.now() };
  replies.push(reply);
  res.json(reply);
});

export default forumRouter;
