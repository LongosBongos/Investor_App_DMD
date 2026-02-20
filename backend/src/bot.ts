import 'dotenv/config';
import { Telegraf } from 'telegraf';
import axios from 'axios';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const ADMIN = String(process.env.TELEGRAM_ADMIN_CHAT_ID!);

bot.start((ctx) => {
  ctx.reply('🤖 DMD Investor Alerts\nBefehle: /price, /founder');
});

bot.command('price', async (ctx) => {
  const r = await axios.get('http://localhost:8787/api/price');
  const { solUsd, dmdUsd, dmdPerSol } = r.data;
  await ctx.replyWithHTML(
    `<b>DMD Price</b>\n1 SOL = ${dmdPerSol} DMD\n1 DMD ≈ $${dmdUsd.toFixed(6)}\nSOL/USD ≈ $${solUsd}`
  );
});

bot.command('founder', async (ctx) => {
  if (String(ctx.chat.id) !== ADMIN) return ctx.reply('Founder only.');
  const r = await axios.get('http://localhost:8787/api/founder-events?limit=15');
  const txs = r.data as any[];
  if (!txs.length) return ctx.reply('Keine Founder-Events.');
  const out = txs.map(t =>
    `• ${t.evt_type.toUpperCase()} ${Number(t.amount_sol||0).toFixed(3)} SOL / ${Math.floor(t.amount_dmd||0)} DMD\n  https://solscan.io/tx/${t.sig}`
  ).join('\n');
  await ctx.replyWithHTML(`<b>Founder Feed</b>\n${out}`);
});

bot.launch();
console.log('🤖 Telegram bot running');
